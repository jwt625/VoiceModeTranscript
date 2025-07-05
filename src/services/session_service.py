"""Session management service."""

import queue
from datetime import datetime
from typing import Optional

from ..config import get_config
from ..models import SessionRepository


class SessionService:
    """Service for managing recording sessions."""

    def __init__(self, stream_queue: queue.Queue):
        """Initialize session service."""
        self.config = get_config()
        self.session_repository = SessionRepository()
        self.stream_queue = stream_queue
        self.current_session: Optional[dict] = None

    def start_session(self) -> dict:
        """Start a new recording session."""
        if self.current_session and self.current_session.get("is_recording"):
            raise ValueError("Session already in progress")

        # Generate session ID and start time
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_time = datetime.now()

        # Create session record in database
        success = self.session_repository.create(session_id, start_time.isoformat())
        if not success:
            raise RuntimeError("Failed to create session record")

        # Update current session state
        self.current_session = {
            "is_recording": True,
            "session_id": session_id,
            "start_time": start_time.isoformat(),
        }

        # Send session started event
        self._send_session_event(
            "session_started",
            {
                "session_id": session_id,
                "start_time": start_time.isoformat(),
                "message": "🎯 Recording session started",
            },
        )

        return self.current_session.copy()

    def stop_session(self) -> dict:
        """Stop the current recording session."""
        if not self.current_session or not self.current_session.get("is_recording"):
            raise ValueError("No active session to stop")

        session_id = self.current_session["session_id"]
        start_time_str = self.current_session["start_time"]
        end_time = datetime.now()

        # Calculate duration
        start_time = datetime.fromisoformat(start_time_str)
        duration = int((end_time - start_time).total_seconds())

        # Update session in database
        success = self.session_repository.finalize(
            session_id, end_time.isoformat(), duration
        )
        if not success:
            print(f"⚠️ Failed to finalize session {session_id}")

        # Update current session state
        self.current_session.update(
            {
                "is_recording": False,
                "end_time": end_time.isoformat(),
                "duration": duration,
            }
        )

        # Send session stopped event
        self._send_session_event(
            "session_stopped",
            {
                "session_id": session_id,
                "end_time": end_time.isoformat(),
                "duration": duration,
                "message": "🛑 Recording session stopped",
            },
        )

        result = self.current_session.copy()
        self.current_session = None
        return result

    def get_current_session(self) -> Optional[dict]:
        """Get current session state."""
        return self.current_session.copy() if self.current_session else None

    def get_all_sessions(self) -> list[dict]:
        """Get all sessions with transcript counts."""
        return self.session_repository.get_all()

    def get_session_by_id(self, session_id: str) -> Optional[dict]:
        """Get session by ID."""
        session = self.session_repository.get_by_id(session_id)
        return session.to_dict() if session else None

    def update_session_metrics(self, session_id: str, transcripts: list[dict]) -> bool:
        """Update session metrics based on transcripts."""
        if not transcripts:
            return True

        # Calculate metrics
        total_segments = len(transcripts)
        total_words = 0
        confidence_sum = 0.0
        confidence_count = 0

        for transcript in transcripts:
            # Count words
            text = transcript.get("text", "")
            if text:
                total_words += len(text.split())

            # Sum confidence scores
            confidence = transcript.get("confidence")
            if confidence is not None:
                confidence_sum += confidence
                confidence_count += 1

        # Calculate average confidence
        avg_confidence = (
            confidence_sum / confidence_count if confidence_count > 0 else 0.0
        )

        # Update in database
        return self.session_repository.update_metrics(
            session_id,
            total_segments,
            total_words,
            avg_confidence,
            confidence_count,
            confidence_sum,
        )

    def _send_session_event(self, event_type: str, data: dict) -> None:
        """Send session event via SSE stream."""
        try:
            event_data = {
                "type": event_type,
                "timestamp": datetime.now().isoformat(),
                **data,
            }
            self.stream_queue.put(event_data, block=False)
        except queue.Full:
            print(f"⚠️ Stream queue full, dropping {event_type} event")
