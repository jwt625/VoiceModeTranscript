"""Transcript processing service."""

import queue
from datetime import datetime
from typing import Any, Optional

from ..config import get_config
from ..models import (
    ProcessedTranscriptRepository,
    RawTranscript,
    RawTranscriptRepository,
)
from ..whisper_stream_processor import WhisperStreamProcessor


class TranscriptService:
    """Service for managing transcript processing."""

    def __init__(self, stream_queue: queue.Queue):
        """Initialize transcript service."""
        self.config = get_config()
        self.stream_queue = stream_queue
        self.raw_transcript_repository = RawTranscriptRepository()
        self.processed_transcript_repository = ProcessedTranscriptRepository()

        # Whisper processors
        self.mic_whisper_processor: Optional[WhisperStreamProcessor] = None
        self.system_whisper_processor: Optional[WhisperStreamProcessor] = None

    def initialize_processors(self, device_selection: dict, vad_settings: dict) -> dict:
        """Initialize whisper.cpp processors for microphone and system audio."""
        mic_sdl_id = device_selection["microphone"]["sdl_id"]
        system_sdl_id = device_selection["system"]["sdl_id"]
        user_disabled_system = device_selection["system"]["user_disabled"]

        # Initialize microphone processor
        self.mic_whisper_processor = WhisperStreamProcessor(
            callback=self._on_whisper_transcript,
            audio_source="microphone",
            audio_device_id=mic_sdl_id,
            vad_config=vad_settings,
        )

        # Initialize system audio processor (if available and enabled)
        self.system_whisper_processor = None
        if system_sdl_id is not None and not user_disabled_system:
            self.system_whisper_processor = WhisperStreamProcessor(
                callback=self._on_whisper_transcript,
                audio_source="system",
                audio_device_id=system_sdl_id,
                vad_config=vad_settings,
            )
            print("🔊 System audio transcription enabled")
        elif user_disabled_system:
            print("🔇 System audio transcription disabled (user choice)")
        else:
            print("⚠️ System audio transcription disabled (no system audio device)")

        return {
            "microphone_initialized": self.mic_whisper_processor is not None,
            "system_initialized": self.system_whisper_processor is not None,
        }

    def start_streaming(self, session_id: str) -> dict:
        """Start whisper.cpp streaming for all processors."""
        if not self.mic_whisper_processor:
            raise RuntimeError("Microphone processor not initialized")

        # Start microphone streaming
        mic_success = self.mic_whisper_processor.start_streaming(session_id)
        if not mic_success:
            raise RuntimeError("Failed to start whisper.cpp streaming for microphone")

        # Start system audio streaming (if available)
        system_success = True
        if self.system_whisper_processor:
            print("🔧 Starting system audio transcription")
            system_success = self.system_whisper_processor.start_streaming(session_id)
            if system_success:
                print("🔊 System audio transcription started successfully")
            else:
                print("⚠️ System audio transcription failed to start")

        return {
            "microphone_started": mic_success,
            "system_started": system_success,
        }

    def stop_streaming(self) -> dict[str, Any]:
        """Stop whisper.cpp streaming for all processors."""
        mic_result = {}
        system_result = {}

        if self.mic_whisper_processor:
            mic_result = self.mic_whisper_processor.stop_streaming()

        if self.system_whisper_processor:
            system_result = self.system_whisper_processor.stop_streaming()

        return {
            "microphone_stopped": mic_result,
            "system_stopped": system_result,
        }

    def get_accumulated_transcripts(self) -> list[dict]:
        """Get all accumulated transcripts from both sources."""
        accumulated_transcripts = []

        # Add microphone transcripts
        if self.mic_whisper_processor:
            mic_transcripts = self.mic_whisper_processor.get_accumulated_transcripts()
            accumulated_transcripts.extend(mic_transcripts)

        # Add system audio transcripts
        if self.system_whisper_processor:
            system_transcripts = (
                self.system_whisper_processor.get_accumulated_transcripts()
            )
            accumulated_transcripts.extend(system_transcripts)

        # Sort by timestamp to maintain chronological order
        accumulated_transcripts.sort(key=lambda x: x.get("timestamp", ""))

        return accumulated_transcripts

    def clear_accumulated_transcripts(self) -> None:
        """Clear accumulated transcripts from all processors."""
        if self.mic_whisper_processor:
            self.mic_whisper_processor.clear_accumulated_transcripts()

        if self.system_whisper_processor:
            self.system_whisper_processor.clear_accumulated_transcripts()

    def get_processor_status(self) -> dict:
        """Get status of all processors."""
        mic_active = False
        system_active = False
        mic_count = 0
        system_count = 0

        if self.mic_whisper_processor:
            mic_active = self.mic_whisper_processor.is_running
            try:
                mic_transcripts = (
                    self.mic_whisper_processor.get_accumulated_transcripts()
                )
                mic_count = len(mic_transcripts) if mic_transcripts else 0
            except Exception:
                mic_count = 0

        if self.system_whisper_processor:
            system_active = self.system_whisper_processor.is_running
            try:
                system_transcripts = (
                    self.system_whisper_processor.get_accumulated_transcripts()
                )
                system_count = len(system_transcripts) if system_transcripts else 0
            except Exception:
                system_count = 0

        return {
            "microphone_active": mic_active,
            "system_active": system_active,
            "accumulated_transcripts": {
                "microphone": mic_count,
                "system": system_count,
                "total": mic_count + system_count,
            },
        }

    def get_session_transcripts(
        self, session_id: str, transcript_type: str = "both"
    ) -> dict:
        """Get transcripts for a session."""
        result = {}

        if transcript_type in ["raw", "both"]:
            raw_transcripts = self.raw_transcript_repository.get_by_session(session_id)
            result["raw"] = [t.to_dict() for t in raw_transcripts]

        if transcript_type in ["processed", "both"]:
            processed_transcripts = self.processed_transcript_repository.get_by_session(
                session_id
            )
            result["processed"] = [t.to_dict() for t in processed_transcripts]

        return result

    def _on_whisper_transcript(self, transcript_data: dict) -> None:
        """Callback for whisper.cpp transcript events."""
        try:
            # Create transcript model
            transcript = RawTranscript(
                id=transcript_data["id"],
                session_id=transcript_data["session_id"],
                text=transcript_data["text"],
                timestamp=transcript_data["timestamp"],
                sequence_number=transcript_data["sequence_number"],
                confidence=transcript_data.get("confidence"),
                processing_time=transcript_data.get("processing_time"),
                audio_source=transcript_data.get("audio_source", "unknown"),
            )

            # Save to database
            success = self.raw_transcript_repository.create(transcript)
            if not success:
                print(f"❌ Failed to save transcript: {transcript.id}")
                return

            # Send via SSE stream
            self._send_transcript_event("transcript", transcript_data)

        except Exception as e:
            print(f"❌ Error processing whisper transcript: {e}")

    def _send_transcript_event(self, event_type: str, data: dict) -> None:
        """Send transcript event via SSE stream."""
        try:
            event_data = {
                "type": event_type,
                "timestamp": datetime.now().isoformat(),
                **data,
            }
            self.stream_queue.put(event_data, block=False)
        except queue.Full:
            print(f"⚠️ Stream queue full, dropping {event_type} event")
