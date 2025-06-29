#!/usr/bin/env python3
"""
Whisper.cpp Streaming Processor for Flask Integration
Adapted from test_llm_deduplication.py for real-time Flask SSE integration
"""

import subprocess
import threading
import re
import os
import time
import uuid
from datetime import datetime
from typing import Optional, Callable, Dict, Any, List
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class WhisperStreamProcessor:
    def __init__(self, callback: Optional[Callable] = None):
        """
        Initialize whisper.cpp streaming processor for Flask integration
        
        Args:
            callback: Function to call when new transcripts are available
                     Signature: callback(transcript_data: Dict[str, Any])
        """
        self.callback = callback
        self.accumulated_transcripts = []
        self.transcript_counter = 0
        self.current_transcription_block = []
        self.in_transcription_block = False
        self.is_running = False
        self.session_id = None
        
        # Whisper.cpp process management
        self.whisper_process = None
        self.processing_thread = None
        
        # Configuration from environment
        self.stream_binary = os.getenv("WHISPER_STREAM_BINARY", "./whisper.cpp/build/bin/whisper-stream")
        self.model_path = os.getenv("WHISPER_MODEL_PATH", "./whisper.cpp/models/ggml-base.en.bin")
        
        # Statistics
        self.start_time = None
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
        self.processing_thread = threading.Thread(target=self._run_whisper_process, daemon=True)
        self.processing_thread.start()
        
        print(f"🎤 Started whisper.cpp streaming for session {session_id}")
        return True

    def stop_streaming(self) -> Dict[str, Any]:
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
        
        duration = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        result = {
            "session_id": self.session_id,
            "duration": duration,
            "total_transcripts": self.total_transcripts,
            "accumulated_transcripts": len(self.accumulated_transcripts),
            "processing_errors": self.processing_errors
        }
        
        print(f"🛑 Stopped whisper.cpp streaming: {result}")
        return result

    def get_accumulated_transcripts(self) -> List[Dict[str, Any]]:
        """Get current accumulated transcripts"""
        return self.accumulated_transcripts.copy()

    def clear_accumulated_transcripts(self):
        """Clear accumulated transcripts buffer"""
        self.accumulated_transcripts = []
        print(f"🗑️  Cleared accumulated transcripts")

    def _run_whisper_process(self):
        """Run whisper.cpp streaming process (internal method)"""
        # Whisper command similar to run_whisper_stream_vad.sh
        cmd = [
            self.stream_binary,
            "-m", self.model_path,
            "-t", "6",           # 6 threads
            "--step", "0",       # Enable sliding window mode with VAD
            "--length", "30000", # 30 second window
            "-vth", "0.6"        # VAD threshold
        ]
        
        print(f"🔧 Running whisper.cpp: {' '.join(cmd)}")
        
        try:
            self.whisper_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            
            # Read output line by line
            for line in iter(self.whisper_process.stdout.readline, ''):
                if not self.is_running:
                    break
                    
                if line:
                    self._process_line(line)
                    
        except Exception as e:
            print(f"❌ Error running whisper.cpp: {e}")
            self.processing_errors += 1
            
            # Notify callback of error
            if self.callback:
                self.callback({
                    "type": "error",
                    "message": f"Whisper.cpp process error: {e}",
                    "session_id": self.session_id
                })
        finally:
            self.is_running = False

    def _process_line(self, line: str):
        """Process a single line from whisper.cpp output"""
        line = line.strip()

        # Check for transcription block start
        if "### Transcription" in line and "START" in line:
            self.in_transcription_block = True
            self.current_transcription_block = []
            return

        # Check for transcription block end
        if "### Transcription" in line and "END" in line:
            if self.in_transcription_block and self.current_transcription_block:
                # Process the complete transcription block
                self._add_transcript_block(self.current_transcription_block)
            self.in_transcription_block = False
            self.current_transcription_block = []
            return

        # If we're in a transcription block, collect the lines
        if self.in_transcription_block:
            self.current_transcription_block.append(line)

    def _add_transcript_block(self, block_lines: List[str]):
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
            "type": "raw_transcript"
        }
        
        # Add to accumulated transcripts
        self.accumulated_transcripts.append(transcript_data)
        
        print(f"📝 Raw transcript {self.transcript_counter}: {transcript_text}")
        print(f"📚 Total accumulated: {len(self.accumulated_transcripts)}")
        
        # Notify callback if provided
        if self.callback:
            self.callback({
                "type": "raw_transcript",
                "data": transcript_data,
                "accumulated_count": len(self.accumulated_transcripts)
            })

    def _extract_transcript_from_block(self, block_lines: List[str]) -> str:
        """Extract transcript text from a transcription block"""
        transcript_parts = []

        for line in block_lines:
            # Look for lines with timestamp markers like [00:00:00.000 --> 00:00:05.000]
            if re.match(r'\[[\d:.\s\-\>]+\]', line):
                # Extract text after the timestamp
                text_after_timestamp = re.sub(r'\[[\d:.\s\-\>]+\]\s*', '', line)
                if text_after_timestamp.strip():
                    transcript_parts.append(text_after_timestamp.strip())

        # Join all transcript parts
        full_transcript = ' '.join(transcript_parts)
        return self._clean_transcript(full_transcript)
            
    def _clean_transcript(self, text: str) -> str:
        """Clean up transcript text from whisper.cpp output"""
        if not text:
            return ""
            
        # Remove timestamp markers like [00:00:00.000 --> 00:00:04.000]
        text = re.sub(r'\[[\d:.\s\-\>]+\]', '', text)
        
        # Remove common whisper artifacts
        text = re.sub(r'\[BLANK_AUDIO\]', '', text)
        
        # Clean up whitespace
        text = ' '.join(text.split())
        
        return text.strip()

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        duration = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        return {
            "session_id": self.session_id,
            "is_running": self.is_running,
            "duration": duration,
            "total_transcripts": self.total_transcripts,
            "accumulated_transcripts": len(self.accumulated_transcripts),
            "processing_errors": self.processing_errors,
            "stream_binary": self.stream_binary,
            "model_path": self.model_path
        }
