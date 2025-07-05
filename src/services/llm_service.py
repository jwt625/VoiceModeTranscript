"""LLM processing service."""

import queue
from datetime import datetime
from typing import Optional

from ..config import get_config
from ..llm_processor import LLMProcessor
from ..models import ProcessedTranscript, ProcessedTranscriptRepository


class LLMService:
    """Service for managing LLM transcript processing."""

    def __init__(self, stream_queue: queue.Queue):
        """Initialize LLM service."""
        self.config = get_config()
        self.stream_queue = stream_queue
        self.processed_transcript_repository = ProcessedTranscriptRepository()
        self.llm_processor = LLMProcessor(callback=self._on_llm_result)

    def process_transcripts_async(
        self, transcripts: list[dict], session_id: str
    ) -> str:
        """Process transcripts asynchronously with LLM."""
        if not transcripts:
            raise ValueError("No transcripts to process")

        # Sort transcripts by timestamp to maintain chronological order
        transcripts.sort(key=lambda x: x.get("timestamp", ""))

        # Process with LLM asynchronously
        job_id = self.llm_processor.process_transcripts_async(transcripts, session_id)

        return job_id

    def process_transcripts_sync(
        self, transcripts: list[dict], session_id: str
    ) -> dict:
        """Process transcripts synchronously with LLM."""
        if not transcripts:
            raise ValueError("No transcripts to process")

        # Sort transcripts by timestamp to maintain chronological order
        transcripts.sort(key=lambda x: x.get("timestamp", ""))

        # Process with LLM synchronously
        result = self.llm_processor.process_transcripts_sync(transcripts, session_id)

        # Save result if successful
        if result.get("status") == "success":
            self._save_processed_transcript(result)

        return result

    def get_processor_status(self) -> dict:
        """Get LLM processor status."""
        return {
            "active_jobs": self.llm_processor.get_active_job_count(),
            "queue_size": self.llm_processor.get_queue_size(),
            "is_processing": self.llm_processor.is_processing(),
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancel an LLM processing job."""
        return self.llm_processor.cancel_job(job_id)

    def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get status of a specific job."""
        return self.llm_processor.get_job_status(job_id)

    def _on_llm_result(self, event_data: dict) -> None:
        """Callback for LLM processor events."""
        try:
            if event_data["type"] == "llm_processing_start":
                # Send processing start via SSE
                self._send_llm_event(
                    "llm_processing_start",
                    {
                        "job_id": event_data["job_id"],
                        "session_id": event_data["session_id"],
                        "transcript_count": event_data["transcript_count"],
                    },
                )

            elif event_data["type"] == "llm_processing_complete":
                # Save processed transcript to database
                result = event_data["result"]
                if result.get("status") == "success":
                    self._save_processed_transcript(result)

                # Send completion via SSE
                self._send_llm_event(
                    "llm_processing_complete",
                    {
                        "job_id": event_data["job_id"],
                        "result": result,
                    },
                )

            elif event_data["type"] == "llm_processing_error":
                # Send error via SSE
                self._send_llm_event(
                    "llm_processing_error",
                    {
                        "job_id": event_data["job_id"],
                        "error": event_data["error"],
                    },
                )

        except Exception as e:
            print(f"❌ Error handling LLM result: {e}")

    def _save_processed_transcript(self, result: dict) -> bool:
        """Save processed transcript to database."""
        try:
            # Create processed transcript model
            transcript = ProcessedTranscript(
                id=result["id"],
                session_id=result["session_id"],
                processed_text=result["processed_text"],
                original_transcript_ids=result["original_transcript_ids"],
                original_transcript_count=result["original_transcript_count"],
                llm_model=result["llm_model"],
                processing_time=result["processing_time"],
                timestamp=result["timestamp"],
            )

            # Save to database
            success = self.processed_transcript_repository.create(transcript)
            if success:
                print(f"✅ Saved processed transcript: {transcript.id}")
            else:
                print(f"❌ Failed to save processed transcript: {transcript.id}")

            return success

        except Exception as e:
            print(f"❌ Error saving processed transcript: {e}")
            return False

    def _send_llm_event(self, event_type: str, data: dict) -> None:
        """Send LLM event via SSE stream."""
        try:
            event_data = {
                "type": event_type,
                "timestamp": datetime.now().isoformat(),
                **data,
            }
            self.stream_queue.put(event_data, block=False)
        except queue.Full:
            print(f"⚠️ Stream queue full, dropping {event_type} event")
