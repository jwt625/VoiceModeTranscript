#!/usr/bin/env python3
"""
LLM Processor Module for Flask Integration
Handles LLM-based transcript deduplication and processing using Lambda Labs API
"""

import json
import os
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Optional

from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()


class LLMProcessor:
    def __init__(self, callback: Optional[Callable] = None):
        """
        Initialize LLM processor for transcript deduplication

        Args:
            callback: Function to call when LLM processing completes
                     Signature: callback(result_data: Dict[str, Any])
        """
        self.callback = callback

        # Initialize OpenAI client for Lambda Labs
        self.client = OpenAI(
            api_key=os.getenv("LLM_API_KEY"),
            base_url=os.getenv("LLM_BASE_URL", "https://api.lambda.ai/v1"),
        )
        self.model = os.getenv("LLM_MODEL", "llama-4-maverick-17b-128e-instruct-fp8")

        # Processing state
        self.is_processing = False
        self.processing_queue: list[dict[str, Any]] = []

        # Statistics
        self.total_processed = 0
        self.total_processing_time = 0.0
        self.failed_requests = 0

        print(f"🤖 LLM Processor initialized with model: {self.model}")

    def process_transcripts_async(
        self, transcripts: list[dict[str, Any]], session_id: str
    ) -> str:
        """
        Process transcripts asynchronously using LLM

        Args:
            transcripts: List of transcript dictionaries
            session_id: Session identifier

        Returns:
            str: Processing job ID for tracking
        """
        if self.is_processing:
            print("⚠️  LLM processing already in progress, queuing request...")

        job_id = str(uuid.uuid4())

        # Add to processing queue
        job_data = {
            "job_id": job_id,
            "transcripts": transcripts,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "status": "queued",
        }

        self.processing_queue.append(job_data)

        # Start processing in background thread
        processing_thread = threading.Thread(
            target=self._process_queue_worker, daemon=True
        )
        processing_thread.start()

        return job_id

    def process_transcripts_sync(
        self, transcripts: list[dict[str, Any]], session_id: str
    ) -> dict[str, Any]:
        """
        Process transcripts synchronously using LLM

        Args:
            transcripts: List of transcript dictionaries
            session_id: Session identifier

        Returns:
            Dict with processing results
        """
        if not transcripts:
            return {"error": "No transcripts provided"}

        start_time = time.time()

        try:
            # Format transcripts for LLM
            formatted_text = self._format_transcripts_for_llm(transcripts)

            # Call LLM API with timeout
            print(f"🤖 Sending {len(transcripts)} transcripts to LLM...")
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {
                        "role": "user",
                        "content": f"Please process these overlapping transcripts:\n\n{formatted_text}",
                    },
                ],
                model=self.model,
                temperature=0.1,  # Low temperature for consistent processing
                max_tokens=5000,
                timeout=30,  # 30 second timeout
            )
            print(f"✅ LLM response received in {time.time() - start_time:.2f}s")

            processing_time = time.time() - start_time

            # Extract the cleaned transcript
            cleaned_result = response.choices[0].message.content.strip()

            # Update statistics
            self.total_processed += 1
            self.total_processing_time += processing_time

            result = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "processed_text": cleaned_result,
                "original_transcript_count": len(transcripts),
                "original_transcript_ids": [t.get("id") for t in transcripts],
                "llm_model": self.model,
                "processing_time": processing_time,
                "timestamp": datetime.now().isoformat(),
                "status": "success",
            }

            print(
                f"✨ LLM processed {len(transcripts)} transcripts in {processing_time:.2f}s"
            )
            print(f"📄 Result: {cleaned_result[:100]}...")

            return result

        except Exception as e:
            self.failed_requests += 1
            error_result = {
                "session_id": session_id,
                "error": str(e),
                "original_transcript_count": len(transcripts),
                "processing_time": time.time() - start_time,
                "timestamp": datetime.now().isoformat(),
                "status": "error",
            }

            error_type = type(e).__name__
            processing_time = time.time() - start_time
            print(
                f"❌ LLM processing failed after {processing_time:.2f}s ({error_type}): {e}"
            )

            # Check for specific timeout or connection errors
            if "timeout" in str(e).lower() or "connection" in str(e).lower():
                print("🔄 This appears to be a network/timeout issue. Try again.")

            return error_result

    def _process_queue_worker(self):
        """Background worker to process LLM queue"""
        while self.processing_queue:
            if self.is_processing:
                time.sleep(0.1)
                continue

            self.is_processing = True

            try:
                # Get next job from queue
                job_data = self.processing_queue.pop(0)
                job_id = job_data["job_id"]
                transcripts = job_data["transcripts"]
                session_id = job_data["session_id"]

                print(
                    f"🤖 Processing LLM job {job_id} with {len(transcripts)} transcripts"
                )

                # Notify callback of processing start
                if self.callback:
                    self.callback(
                        {
                            "type": "llm_processing_start",
                            "job_id": job_id,
                            "session_id": session_id,
                            "transcript_count": len(transcripts),
                        }
                    )

                # Process transcripts
                result = self.process_transcripts_sync(transcripts, session_id)
                result["job_id"] = job_id

                # Notify callback of completion
                if self.callback:
                    self.callback(
                        {
                            "type": "llm_processing_complete",
                            "job_id": job_id,
                            "result": result,
                        }
                    )

            except Exception as e:
                print(f"❌ Error in LLM queue worker: {e}")

                if self.callback:
                    self.callback(
                        {
                            "type": "llm_processing_error",
                            "job_id": job_data.get("job_id", "unknown"),
                            "error": str(e),
                        }
                    )
            finally:
                self.is_processing = False

    def _format_transcripts_for_llm(self, transcripts: list[dict[str, Any]]) -> str:
        """Format accumulated transcripts for LLM processing"""
        formatted = []
        for i, transcript in enumerate(transcripts, 1):
            text = transcript.get("text", "")
            timestamp = transcript.get("timestamp", "")
            audio_source = transcript.get("audio_source", "unknown")

            # Map audio source to speaker role
            speaker_role = self._map_audio_source_to_role(audio_source)
            formatted.append(f"Transcript {i} ({timestamp}) [{speaker_role}]: {text}")
        return "\n\n".join(formatted)

    def _map_audio_source_to_role(self, audio_source: str) -> str:
        """Map audio source to speaker role for LLM understanding"""
        role_mapping = {
            "microphone": "USER",
            "system": "ASSISTANT",
            "unknown": "UNKNOWN",
        }
        return role_mapping.get(audio_source, "UNKNOWN")

    def _get_system_prompt(self) -> str:
        """Get the system prompt for LLM processing"""
        return """You are an expert transcript processor. You will receive multiple overlapping speech transcripts from whisper.cpp that contain duplicate and similar content due to sliding window processing.

Each transcript includes a timestamp and is labeled with a speaker role:
- [USER]: Speech from the microphone (user speaking)
- [ASSISTANT]: Speech from system audio (ChatGPT or other AI assistant)
- [UNKNOWN]: Speech from unidentified source

Your task is to:
1. Use the timestamps to understand the chronological order of speech segments
2. Intelligently merge and deduplicate the overlapping content while preserving speaker roles and temporal sequence
3. Correct ONLY obvious transcription errors (like "boar" instead of "door") when context clearly indicates the error
4. Create a clean, coherent transcript from the overlapping segments in chronological order
5. Stay truthful and faithful to the original speech content - do NOT add, embellish, or creatively interpret
6. Preserve the exact meaning, tone, and style of each speaker
7. If uncertain about a word or phrase, keep the most common version from the transcripts
8. Maintain clear speaker attribution in the final output
9. Handle cases where whisper.cpp may return transcripts with processing delays - use timestamps to determine actual speech order

IMPORTANT: Your goal is accuracy and faithfulness to the original speech, not creative storytelling. Pay attention to timestamps to maintain proper chronological flow.

Return the clean, deduplicated transcript in this format, with proper line breaks when the speaker role changes:
[SPEAKER_ROLE]: transcript text
[SPEAKER_ROLE]: transcript text

Do not include explanations, metadata, or timestamps in your output - only the speaker roles and cleaned transcript text."""

    def get_stats(self) -> dict[str, Any]:
        """Get LLM processing statistics"""
        avg_processing_time = 0.0
        if self.total_processed > 0:
            avg_processing_time = self.total_processing_time / self.total_processed

        success_rate = 0.0
        total_requests = self.total_processed + self.failed_requests
        if total_requests > 0:
            success_rate = self.total_processed / total_requests

        return {
            "total_processed": self.total_processed,
            "failed_requests": self.failed_requests,
            "success_rate": success_rate,
            "total_processing_time": self.total_processing_time,
            "average_processing_time": avg_processing_time,
            "is_processing": self.is_processing,
            "queue_length": len(self.processing_queue),
            "model": self.model,
        }

    def clear_queue(self):
        """Clear the processing queue"""
        self.processing_queue = []
        print("🗑️  Cleared LLM processing queue")

    def get_queue_status(self) -> list[dict[str, Any]]:
        """Get current queue status"""
        return [
            {
                "job_id": job["job_id"],
                "session_id": job["session_id"],
                "transcript_count": len(job["transcripts"]),
                "timestamp": job["timestamp"],
                "status": job["status"],
            }
            for job in self.processing_queue
        ]

    def generate_session_summary(
        self, processed_transcripts: list[dict[str, Any]], session_id: str
    ) -> dict[str, Any]:
        """
        Generate a session summary and keywords from processed transcripts

        Args:
            processed_transcripts: List of processed transcript dictionaries
            session_id: Session identifier

        Returns:
            dict: Summary result with summary, keywords, and metadata
        """
        if not processed_transcripts:
            return {
                "session_id": session_id,
                "error": "No processed transcripts to summarize",
                "status": "error",
            }

        start_time = time.time()

        try:
            # Format processed transcripts for summary generation
            formatted_text = self._format_processed_transcripts_for_summary(
                processed_transcripts
            )

            print(
                f"🤖 Generating summary for session {session_id} from {len(processed_transcripts)} processed transcripts..."
            )

            # Call LLM API for summary generation
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": self._get_summary_system_prompt()},
                    {
                        "role": "user",
                        "content": f"Please analyze this transcript session and generate a summary:\n\n{formatted_text}",
                    },
                ],
                model=self.model,
                temperature=0.1,  # Low temperature for consistent summaries
                max_tokens=1000,
                timeout=30,
            )

            # Parse the response
            content = response.choices[0].message.content.strip()

            # Try to parse as JSON
            try:
                summary_data = json.loads(content)

                if (
                    not isinstance(summary_data, dict)
                    or "summary" not in summary_data
                    or "keywords" not in summary_data
                ):
                    raise ValueError("Invalid summary format")

                summary = summary_data["summary"]
                keywords = summary_data["keywords"]

                if not isinstance(keywords, list) or len(keywords) != 5:
                    raise ValueError("Keywords must be a list of 5 items")

            except (json.JSONDecodeError, ValueError) as e:
                print(f"⚠️  Failed to parse LLM summary response as JSON: {e}")
                # Fallback: treat entire response as summary
                summary = content
                keywords = []

            processing_time = time.time() - start_time

            result = {
                "session_id": session_id,
                "summary": summary,
                "keywords": keywords,
                "processed_transcript_count": len(processed_transcripts),
                "processing_time": processing_time,
                "timestamp": datetime.now().isoformat(),
                "status": "success",
            }

            print(f"✅ Generated summary in {processing_time:.2f}s: {summary[:100]}...")
            if keywords:
                print(f"🏷️  Keywords: {', '.join(keywords)}")

            return result

        except Exception as e:
            processing_time = time.time() - start_time
            error_result = {
                "session_id": session_id,
                "error": str(e),
                "processed_transcript_count": len(processed_transcripts),
                "processing_time": processing_time,
                "timestamp": datetime.now().isoformat(),
                "status": "error",
            }

            print(f"❌ Summary generation failed after {processing_time:.2f}s: {e}")
            return error_result

    def _format_processed_transcripts_for_summary(
        self, processed_transcripts: list[dict[str, Any]]
    ) -> str:
        """Format processed transcripts for summary generation"""
        formatted_lines = []

        for transcript in processed_transcripts:
            timestamp = transcript.get("timestamp", "Unknown")
            text = transcript.get("processed_text", "").strip()

            if not text:
                continue

            # Add timestamp and text
            formatted_lines.append(f"[{timestamp}] {text}")

        return "\n".join(formatted_lines)

    def _get_summary_system_prompt(self) -> str:
        """Get the system prompt for summary generation"""
        return """You are an expert at analyzing conversation transcripts and creating concise summaries.

Your task is to analyze the provided transcript session and generate:
1. A single, clear sentence that summarizes what this transcript session is about
2. Exactly 5 relevant keywords/tags that best represent the content

Focus on:
- Main topics discussed
- Key concepts or subjects
- Purpose or context of the conversation
- Important themes or activities
- Technical terms or specific domains mentioned

Guidelines:
- The summary should be one complete sentence that captures the essence of the session
- Keywords should be single words or short phrases (2-3 words max)
- Keywords should be diverse and cover different aspects of the content
- Avoid generic words like "discussion", "conversation", "talk"
- Focus on specific, meaningful terms

Return your response in this exact JSON format:
{
  "summary": "One sentence summary of the session",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Do not include any explanations or additional text outside the JSON response."""


# Test function for development
def test_llm_processor():
    """Test the LLM processor with sample data"""
    print("Testing LLM Processor...")

    # Sample transcript data
    sample_transcripts = [
        {
            "id": "1",
            "text": "Hello world, this is a test of the whisper system.",
            "timestamp": "2024-01-01T12:00:00Z",
        },
        {
            "id": "2",
            "text": "Hello world, this is a test of the whisper system. It should work well.",
            "timestamp": "2024-01-01T12:00:02Z",
        },
        {
            "id": "3",
            "text": "This is a test of the whisper system. It should work well for transcription.",
            "timestamp": "2024-01-01T12:00:04Z",
        },
    ]

    processor = LLMProcessor()

    # Test synchronous processing
    result = processor.process_transcripts_sync(sample_transcripts, "test_session")

    if result.get("status") == "success":
        print("✅ LLM processing successful:")
        print(f"   Original transcripts: {len(sample_transcripts)}")
        print(f"   Processed text: {result['processed_text']}")
        print(f"   Processing time: {result['processing_time']:.2f}s")
    else:
        print(f"❌ LLM processing failed: {result.get('error')}")

    # Show stats
    stats = processor.get_stats()
    print(f"LLM Processor stats: {stats}")


if __name__ == "__main__":
    test_llm_processor()
