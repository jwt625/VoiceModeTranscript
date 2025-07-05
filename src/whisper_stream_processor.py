#!/usr/bin/env python3
"""
Whisper.cpp Streaming Processor for Flask Integration
Adapted from test_llm_deduplication.py for real-time Flask SSE integration
"""

import os
import re
import subprocess
import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class WhisperStreamProcessor:
    def __init__(
        self,
        callback: Optional[Callable] = None,
        audio_source: str = "microphone",
        audio_device_id: Optional[int] = None,
        vad_config: Optional[dict[str, Any]] = None,
    ):
        """
        Initialize whisper.cpp streaming processor for Flask integration

        Args:
            callback: Function to call when new transcripts are available
                     Signature: callback(transcript_data: Dict[str, Any])
            audio_source: Source of audio being processed ('microphone' or 'system')
            audio_device_id: Optional audio device ID to use for capture
            vad_config: Optional VAD configuration dict with 'use_fixed_interval' key
        """
        self.callback = callback
        self.audio_source = audio_source
        self.audio_device_id = audio_device_id
        self.vad_config = vad_config or {"use_fixed_interval": False}
        self.accumulated_transcripts: list[dict[str, Any]] = []
        self.transcript_counter = 0
        self.current_transcription_block: list[str] = []
        self.in_transcription_block = False
        self.is_running = False
        self.session_id: Optional[str] = None

        # Whisper.cpp process management
        self.whisper_process: Optional[subprocess.Popen] = None
        self.processing_thread: Optional[threading.Thread] = None

        # Configuration from environment
        self.stream_binary = os.getenv(
            "WHISPER_STREAM_BINARY", "./whisper.cpp/build/bin/whisper-stream"
        )
        self.model_path = os.getenv(
            "WHISPER_MODEL_PATH", "./whisper.cpp/models/ggml-base.en.bin"
        )

        # Statistics
        self.start_time: Optional[datetime] = None
        self.total_transcripts = 0
        self.processing_errors = 0

    def start_streaming(self, session_id: str) -> bool:
        """
        Start whisper.cpp streaming process

        Args:
            session_id: Unique session identifier

        Returns:
            bool: True if started successfully, False otherwise
        """
        if self.is_running:
            print("⚠️  Whisper streaming already running")
            return False

        # Validate required files
        if not os.path.exists(self.stream_binary):
            print(f"❌ whisper-stream binary not found at {self.stream_binary}")
            return False

        if not os.path.exists(self.model_path):
            print(f"❌ Model not found at {self.model_path}")
            return False

        self.session_id = session_id
        self.start_time = datetime.now()
        self.is_running = True

        # Reset state
        self.accumulated_transcripts = []
        self.transcript_counter = 0
        self.current_transcription_block = []
        self.in_transcription_block = False

        # Start whisper.cpp process in background thread
        self.processing_thread = threading.Thread(
            target=self._run_whisper_process, daemon=True
        )
        self.processing_thread.start()

        print(f"🎤 Started whisper.cpp streaming for session {session_id}")
        return True

    def stop_streaming(self) -> dict[str, Any]:
        """
        Stop whisper.cpp streaming process

        Returns:
            Dict with final statistics and accumulated transcripts
        """
        if not self.is_running:
            return {"error": "Streaming not running"}

        self.is_running = False

        # Terminate whisper process
        if self.whisper_process:
            try:
                self.whisper_process.terminate()
                self.whisper_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.whisper_process.kill()
            except Exception as e:
                print(f"⚠️  Error stopping whisper process: {e}")

        # Wait for processing thread to finish
        if self.processing_thread and self.processing_thread.is_alive():
            self.processing_thread.join(timeout=2)

        duration = 0.0
        if self.start_time:
            time_diff: timedelta = datetime.now() - self.start_time
            duration = time_diff.total_seconds()

        result = {
            "session_id": self.session_id,
            "duration": duration,
            "total_transcripts": self.total_transcripts,
            "accumulated_transcripts": len(self.accumulated_transcripts),
            "processing_errors": self.processing_errors,
        }

        print(f"🛑 Stopped whisper.cpp streaming: {result}")
        return result

    def get_accumulated_transcripts(self) -> list[dict[str, Any]]:
        """Get current accumulated transcripts"""
        return self.accumulated_transcripts.copy()

    def clear_accumulated_transcripts(self):
        """Clear accumulated transcripts buffer"""
        self.accumulated_transcripts = []
        print("🗑️  Cleared accumulated transcripts")

    def _run_whisper_process(self):
        """Run whisper.cpp streaming process (internal method)"""
        # Build command based on VAD configuration
        cmd = [
            self.stream_binary,
            "-m",
            self.model_path,
            "-t",
            "6",  # 6 threads
        ]

        # Configure VAD vs Fixed Interval mode
        if self.vad_config.get("use_fixed_interval", False):
            # Fixed interval mode: 10s intervals, 25s duration (15s overlap for better context)
            cmd.extend(
                [
                    "--step",
                    "10000",  # 10 second step interval
                    "--length",
                    "25000",  # 25 second window
                    "-vth",
                    "0.6",  # VAD threshold (still used for quality)
                ]
            )
            print(
                "🔄 Using Fixed Interval mode: 10s intervals, 25s duration (15s overlap)"
            )
        else:
            # VAD mode (default)
            cmd.extend(
                [
                    "--step",
                    "0",  # Enable sliding window mode with VAD
                    "--length",
                    "30000",  # 30 second window
                    "-vth",
                    "0.6",  # VAD threshold
                ]
            )
            print("🎯 Using VAD mode: voice activity detection")

        # Add keep parameter for context
        cmd.extend(["--keep", "200"])

        # Add audio device specification if provided
        if self.audio_device_id is not None:
            cmd.extend(["-c", str(self.audio_device_id)])  # Capture device ID

        print(f"🔧 Running whisper.cpp ({self.audio_source}): {' '.join(cmd)}")

        try:
            self.whisper_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            # Read output line by line
            for line in iter(self.whisper_process.stdout.readline, ""):
                if not self.is_running:
                    break

                if line:
                    self._process_line(line)

        except Exception as e:
            print(f"❌ Error running whisper.cpp: {e}")
            self.processing_errors += 1

            # Notify callback of error
            if self.callback:
                self.callback(
                    {
                        "type": "error",
                        "message": f"Whisper.cpp process error: {e}",
                        "session_id": self.session_id,
                    }
                )
        finally:
            self.is_running = False

    def _process_line(self, line: str):
        """Process a single line from whisper.cpp output"""
        line = line.strip()

        # Skip empty lines
        if not line:
            return

        print(f"🔍 Whisper output: {line}")

        # Check for transcription block start (VAD mode)
        if "### Transcription" in line and "START" in line:
            self.in_transcription_block = True
            self.current_transcription_block = []
            return

        # Check for transcription block end (VAD mode)
        if "### Transcription" in line and "END" in line:
            if self.in_transcription_block and self.current_transcription_block:
                # Process the complete transcription block
                self._add_transcript_block(self.current_transcription_block)
            self.in_transcription_block = False
            self.current_transcription_block = []
            return

        # If we're in a transcription block (VAD mode), collect the lines
        if self.in_transcription_block:
            self.current_transcription_block.append(line)
            return

        # Handle fixed interval mode - process direct transcript lines
        if self.vad_config.get("use_fixed_interval", False):
            # Check if it's a valid transcript FIRST (especially for long text)
            if self._is_transcript_line(line):
                print(f"� Direct transcript: {line}")
                self._add_direct_transcript(line)
                return

            # Only filter debug messages if it's NOT a valid transcript
            if self._is_debug_message(line):
                print(f"� Filtered debug message: {line}")
                return

            # If we get here, it's neither a transcript nor a debug message
            print(f"❌ Unprocessed line: {line}")
            print(
                f"   Length: {len(line.strip())}, Has letters: {bool(re.search(r'[a-zA-Z]', line))}"
            )

    def _add_transcript_block(self, block_lines: list[str]):
        """Process a complete transcription block and extract transcript text"""
        transcript_text = self._extract_transcript_from_block(block_lines)
        if not transcript_text:
            return

        self.transcript_counter += 1
        self.total_transcripts += 1

        # Create transcript data structure
        transcript_data = {
            "id": str(uuid.uuid4()),
            "session_id": self.session_id,
            "text": transcript_text,
            "timestamp": datetime.now().isoformat(),
            "sequence_number": self.transcript_counter,
            "type": "raw_transcript",
            "audio_source": self.audio_source,
        }

        # Add to accumulated transcripts
        self.accumulated_transcripts.append(transcript_data)

        print(
            f"📝 Raw transcript {self.transcript_counter} ({self.audio_source}): {transcript_text}"
        )
        print(f"📚 Total accumulated: {len(self.accumulated_transcripts)}")

        # Notify callback if provided
        if self.callback:
            self.callback(
                {
                    "type": "raw_transcript",
                    "data": transcript_data,
                    "accumulated_count": len(self.accumulated_transcripts),
                }
            )

    def _extract_transcript_from_block(self, block_lines: list[str]) -> str:
        """Extract transcript text from a transcription block"""
        transcript_parts = []

        for line in block_lines:
            # Look for lines with timestamp markers like [00:00:00.000 --> 00:00:05.000]
            if re.match(r"\[[\d:.\s\-\>]+\]", line):
                # Extract text after the timestamp
                text_after_timestamp = re.sub(r"\[[\d:.\s\-\>]+\]\s*", "", line)
                if text_after_timestamp.strip():
                    transcript_parts.append(text_after_timestamp.strip())

        # Join all transcript parts
        full_transcript = " ".join(transcript_parts)
        return self._clean_transcript(full_transcript)

    def _clean_transcript(self, text: str) -> str:
        """Clean up transcript text from whisper.cpp output"""
        if not text:
            return ""

        # Remove timestamp markers like [00:00:00.000 --> 00:00:04.000]
        text = re.sub(r"\[[\d:.\s\-\>]+\]", "", text)

        # Remove common whisper artifacts
        text = re.sub(r"\[BLANK_AUDIO\]", "", text)

        # Clean up whitespace
        text = " ".join(text.split())

        return text.strip()

    def _is_debug_message(self, line: str) -> bool:
        """Check if line is a debug/initialization message that should be filtered out"""
        debug_patterns = [
            "ggml_",
            "whisper_",
            "init:",
            "loading",
            "loaded",
            "system info",
            "AVAudioSession",
            "audio_state",
            "capture_init",
            "SDL",
            "METAL",
            "processing",
            "n_threads",
            "n_processors",
            "main:",  # whisper.cpp main function debug messages
            "[Start speaking]",  # whisper.cpp status messages
            "[End speaking]",
            "n_new_line",
            "no_context",
            "vad_",
            "audio_ctx",
            "beam_size",
            "temperature",
            "best_of",
            "language",
            "model",
            "threads",
            "offset",
            "duration",
            "max_context",
            "max_len",
            "split_on_word",
            "speed_up",
            "translate",
            "diarize",
            "tinydiarize",
            "no_fallback",
            "output_txt",
            "output_vtt",
            "output_srt",
            "output_wts",
            "output_csv",
            "output_jsn",
            "print_special",
            "print_colors",
            "print_progress",
            "no_timestamps",
            "[2K",  # Terminal control sequences
            "[1K",
            "[0K",
        ]

        line_lower = line.lower()
        line_stripped = line.strip()

        # Check for debug patterns
        if any(pattern.lower() in line_lower for pattern in debug_patterns):
            return True

        # Check for lines that are just control sequences or short codes
        if re.match(r"^\[[0-9A-Za-z]+$", line_stripped):
            return True

        return False

    def _is_transcript_line(self, line: str) -> bool:
        """Check if line contains actual transcript content"""
        line_stripped = line.strip()

        # If text is long (>150 chars), it's almost certainly a transcript - always pass it
        if len(line_stripped) > 150:
            return True

        # Skip very short lines (likely not meaningful speech)
        if len(line_stripped) < 3:
            return False

        # Skip lines that are just timestamps
        if re.match(r"^\[[\d:.\s\-\>]+\]$", line_stripped):
            return False

        # Skip lines with only punctuation or numbers
        if re.match(r"^[\s\d\.\,\!\?\-\[\]]+$", line_stripped):
            return False

        # Skip lines that start with specific whisper.cpp patterns
        if re.match(r"^main:\s", line_stripped):
            return False

        # Skip whisper debug messages
        if re.match(r"^whisper_", line_stripped):
            return False

        # Skip ggml debug messages
        if re.match(r"^ggml_", line_stripped):
            return False

        # Skip lines that are just bracketed status messages
        if re.match(r"^\[.*\]$", line_stripped):
            return False

        # Must contain some alphabetic characters
        if not re.search(r"[a-zA-Z]", line):
            return False

        # Must have a reasonable length for speech (at least 10 characters)
        if len(line_stripped) < 10:
            return False

        return False

    def _add_direct_transcript(self, line: str):
        """Process a direct transcript line from fixed interval mode"""
        # Clean the transcript text
        transcript_text = self._clean_transcript(line)
        if not transcript_text:
            return

        self.transcript_counter += 1
        self.total_transcripts += 1

        # Create transcript data structure
        transcript_data = {
            "id": str(uuid.uuid4()),
            "session_id": self.session_id,
            "text": transcript_text,
            "timestamp": datetime.now().isoformat(),
            "sequence_number": self.transcript_counter,
            "type": "raw_transcript",
            "audio_source": self.audio_source,
        }

        # Add to accumulated transcripts
        self.accumulated_transcripts.append(transcript_data)

        print(
            f"📝 Raw transcript {self.transcript_counter} ({self.audio_source}): {transcript_text}"
        )
        print(f"📚 Total accumulated: {len(self.accumulated_transcripts)}")

        # Notify callback if provided
        if self.callback:
            print("🔄 Sending transcript to callback")
            self.callback(
                {
                    "type": "raw_transcript",
                    "data": transcript_data,
                    "accumulated_count": len(self.accumulated_transcripts),
                }
            )

    def get_stats(self) -> dict[str, Any]:
        """Get processing statistics"""
        duration = 0.0
        if self.start_time:
            time_diff: timedelta = datetime.now() - self.start_time
            duration = time_diff.total_seconds()

        return {
            "session_id": self.session_id,
            "is_running": self.is_running,
            "duration": duration,
            "total_transcripts": self.total_transcripts,
            "accumulated_transcripts": len(self.accumulated_transcripts),
            "processing_errors": self.processing_errors,
            "stream_binary": self.stream_binary,
            "model_path": self.model_path,
        }
