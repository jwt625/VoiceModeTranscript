"""Audio processing service."""

import queue
from datetime import datetime
from typing import Optional

from ..audio_capture import AudioCapture
from ..config import get_config


class AudioService:
    """Service for managing audio capture and processing."""

    def __init__(self, stream_queue: queue.Queue):
        """Initialize audio service."""
        self.config = get_config()
        self.stream_queue = stream_queue
        self.audio_capture: Optional[AudioCapture] = None
        self.is_capturing = False

    def initialize_audio_capture(self, audio_capture: AudioCapture) -> None:
        """Initialize audio capture with callback."""
        self.audio_capture = audio_capture
        self.audio_capture.callback = self._on_audio_chunk

    def start_capture(self) -> bool:
        """Start audio capture for volume monitoring."""
        if not self.audio_capture:
            print("❌ Audio capture not initialized")
            return False

        try:
            # AudioCapture uses start_recording, not start_capture
            # For volume monitoring, we'll use a dummy session_id
            self.audio_capture.start_recording("volume_monitor")
            self.is_capturing = True
            print("🎤 Audio capture started for volume monitoring")
            return True
        except Exception as e:
            print(f"❌ Error starting audio capture: {e}")
            return False

    def stop_capture(self) -> bool:
        """Stop audio capture."""
        if not self.audio_capture:
            return True

        try:
            # AudioCapture uses stop_recording, not stop_capture
            self.audio_capture.stop_recording()
            self.is_capturing = False
            print("🛑 Audio capture stopped")
            return True
        except Exception as e:
            print(f"❌ Error stopping audio capture: {e}")
            return False

    def get_capture_status(self) -> dict:
        """Get audio capture status."""
        return {
            "is_capturing": self.is_capturing,
            "audio_capture_initialized": self.audio_capture is not None,
            "audio_capture_active": self.audio_capture.is_recording
            if self.audio_capture
            else False,
        }

    def _on_audio_chunk(
        self,
        audio_data: bytes,
        is_transcription: bool = False,
        transcript_processor=None,
    ) -> None:
        """Callback for audio chunk processing."""
        try:
            # Calculate audio levels for volume monitoring
            if self.audio_capture:
                level_data = self._calculate_audio_levels(audio_data)
                if level_data:
                    self._send_audio_level_event(level_data)

            # Handle transcription processing (if needed)
            if is_transcription and transcript_processor:
                try:
                    # Process audio chunk with whisper.cpp
                    transcript_result = transcript_processor.process_audio_chunk(
                        audio_data
                    )
                    if transcript_result:
                        print(f"📝 Transcript: {transcript_result}")
                except Exception as e:
                    print(f"❌ Error processing audio for transcription: {e}")

        except Exception as e:
            print(f"❌ Error in audio chunk callback: {e}")

    def _calculate_audio_levels(self, audio_data: bytes) -> Optional[dict]:
        """Calculate audio levels from audio data."""
        try:
            if not self.audio_capture:
                return None

            # AudioCapture doesn't have direct level methods
            # For now, return default values - this would need to be implemented
            # by accessing the audio buffers in AudioCapture
            mic_level = 0.0
            system_level = 0.0

            # Create level data
            level_data = {
                "type": "audio_level",
                "microphone": {
                    "level": mic_level,
                    "percentage": min(100, max(0, mic_level * 100)),
                },
                "system": {
                    "level": system_level,
                    "percentage": min(100, max(0, system_level * 100)),
                },
                "timestamp": datetime.now().isoformat(),
            }

            return level_data

        except Exception as e:
            print(f"❌ Error calculating audio levels: {e}")
            return None

    def _send_audio_level_event(self, level_data: dict) -> None:
        """Send audio level event via SSE stream."""
        try:
            self.stream_queue.put(level_data, block=False)
        except queue.Full:
            # Skip if queue is full (audio levels are frequent)
            pass

    def get_audio_devices(self) -> dict:
        """Get available audio devices."""
        if not self.audio_capture:
            return {"error": "Audio capture not initialized"}

        try:
            input_devices, output_devices = self.audio_capture.list_devices()
            return {
                "success": True,
                "input_devices": input_devices,
                "output_devices": output_devices,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
