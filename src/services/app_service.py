"""Main application service that coordinates all other services."""

import queue
from typing import Optional

from ..config import get_config
from .audio_service import AudioService
from .device_service import DeviceService
from .llm_service import LLMService
from .session_service import SessionService
from .transcript_service import TranscriptService


class AppService:
    """Main application service that coordinates all other services."""

    def __init__(self, stream_queue: queue.Queue):
        """Initialize application service with all sub-services."""
        self.config = get_config()
        self.stream_queue = stream_queue

        # Initialize all services
        self.session_service = SessionService(stream_queue)
        self.device_service = DeviceService()
        self.transcript_service = TranscriptService(stream_queue)
        self.llm_service = LLMService(stream_queue)
        self.audio_service = AudioService(stream_queue)

    def start_recording(self, device_data: dict, vad_settings: dict) -> dict:
        """Start a complete recording session."""
        try:
            # 1. Resolve device selection
            mic_device_id = device_data.get("mic_device_id")
            system_device_id = device_data.get("system_device_id")

            device_selection = self.device_service.resolve_device_selection(
                mic_device_id, system_device_id
            )

            device_names = self.device_service.get_device_names(device_selection)
            print(
                f"🎛️ Device selection - Mic: {device_names['microphone']}, System: {device_names['system']}"
            )

            # 2. Configure audio capture for volume monitoring
            audio_capture = self.device_service.get_audio_capture()
            self.audio_service.initialize_audio_capture(audio_capture)

            audio_configured = self.device_service.configure_audio_capture(
                device_selection
            )
            if not audio_configured:
                print("⚠️ Audio capture configuration failed")

            # 3. Initialize transcript processors
            processor_status = self.transcript_service.initialize_processors(
                device_selection, vad_settings
            )

            # 4. Start session
            session = self.session_service.start_session()
            session_id = session["session_id"]

            # 5. Start transcript streaming
            streaming_status = self.transcript_service.start_streaming(session_id)

            # 6. Start audio capture for volume monitoring
            audio_capture_started = self.audio_service.start_capture()

            return {
                "success": True,
                "session": session,
                "device_selection": device_selection,
                "device_names": device_names,
                "processor_status": processor_status,
                "streaming_status": streaming_status,
                "audio_capture_started": audio_capture_started,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_recording(self) -> dict:
        """Stop the current recording session."""
        try:
            # 1. Stop transcript streaming
            streaming_status = self.transcript_service.stop_streaming()

            # 2. Stop audio capture
            audio_stopped = self.audio_service.stop_capture()

            # 3. Stop session
            session = self.session_service.stop_session()

            return {
                "success": True,
                "session": session,
                "streaming_status": streaming_status,
                "audio_stopped": audio_stopped,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def process_transcripts_with_llm(self, session_id: Optional[str] = None) -> dict:
        """Process accumulated transcripts with LLM."""
        try:
            # Use current session if not specified
            if not session_id:
                current_session = self.session_service.get_current_session()
                if not current_session:
                    return {"success": False, "error": "No active session"}
                session_id = current_session["session_id"]

            # Get accumulated transcripts
            transcripts = self.transcript_service.get_accumulated_transcripts()
            if not transcripts:
                return {"success": False, "error": "No transcripts to process"}

            # Process with LLM
            job_id = self.llm_service.process_transcripts_async(transcripts, session_id)

            # Clear accumulated transcripts after sending to LLM
            self.transcript_service.clear_accumulated_transcripts()

            return {
                "success": True,
                "job_id": job_id,
                "transcript_count": len(transcripts),
                "message": "LLM processing started",
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_application_status(self) -> dict:
        """Get comprehensive application status."""
        try:
            # Get current session
            current_session = self.session_service.get_current_session()

            # Get processor status
            processor_status = self.transcript_service.get_processor_status()

            # Get LLM status
            llm_status = self.llm_service.get_processor_status()

            # Get audio capture status
            audio_status = self.audio_service.get_capture_status()

            # Get processed transcript count for current session
            processed_count = 0
            if current_session:
                try:
                    session_transcripts = (
                        self.transcript_service.get_session_transcripts(
                            current_session["session_id"], "processed"
                        )
                    )
                    processed_count = len(session_transcripts.get("processed", []))
                except Exception:
                    processed_count = 0

            return {
                "session": current_session,
                "processors": processor_status,
                "llm_processor": llm_status,
                "audio_capture": audio_status,
                "processed_transcripts": {"session_count": processed_count},
            }

        except Exception as e:
            return {"error": str(e)}

    def get_available_devices(self) -> dict:
        """Get all available audio devices."""
        return self.device_service.get_available_devices()

    def get_all_sessions(self) -> list[dict]:
        """Get all recording sessions."""
        return self.session_service.get_all_sessions()

    def get_session_transcripts(
        self, session_id: str, transcript_type: str = "both"
    ) -> dict:
        """Get transcripts for a specific session."""
        return self.transcript_service.get_session_transcripts(
            session_id, transcript_type
        )

    def get_session_by_id(self, session_id: str) -> Optional[dict]:
        """Get session by ID."""
        return self.session_service.get_session_by_id(session_id)
