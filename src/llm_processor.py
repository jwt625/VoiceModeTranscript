#!/usr/bin/env python3
"""
LLM Processor Module for Flask Integration
Handles LLM-based transcript deduplication and processing using Lambda Labs API
"""

import os
import time
import uuid
import asyncio
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable
from openai import OpenAI
from dotenv import load_dotenv

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
        self.processing_queue = []
        
        # Statistics
        self.total_processed = 0
        self.total_processing_time = 0
        self.failed_requests = 0
        
        print(f"🤖 LLM Processor initialized with model: {self.model}")

    def process_transcripts_async(self, transcripts: List[Dict[str, Any]], 
                                session_id: str) -> str:
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
            "status": "queued"
        }
        
        self.processing_queue.append(job_data)
        
        # Start processing in background thread
        processing_thread = threading.Thread(
            target=self._process_queue_worker, 
            daemon=True
        )
        processing_thread.start()
        
        return job_id

    def process_transcripts_sync(self, transcripts: List[Dict[str, Any]], 
                               session_id: str) -> Dict[str, Any]:
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
            
            # Call LLM API
            response = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt()
                    },
                    {
                        "role": "user", 
                        "content": f"Please process these overlapping transcripts:\n\n{formatted_text}"
                    }
                ],
                model=self.model,
                temperature=0.1,  # Low temperature for consistent processing
                max_tokens=1000
            )
            
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
                "status": "success"
            }
            
            print(f"✨ LLM processed {len(transcripts)} transcripts in {processing_time:.2f}s")
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
                "status": "error"
            }
            
            print(f"❌ LLM processing error: {e}")
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
                
                print(f"🤖 Processing LLM job {job_id} with {len(transcripts)} transcripts")
                
                # Notify callback of processing start
                if self.callback:
                    self.callback({
                        "type": "llm_processing_start",
                        "job_id": job_id,
                        "session_id": session_id,
                        "transcript_count": len(transcripts)
                    })
                
                # Process transcripts
                result = self.process_transcripts_sync(transcripts, session_id)
                result["job_id"] = job_id
                
                # Notify callback of completion
                if self.callback:
                    self.callback({
                        "type": "llm_processing_complete",
                        "job_id": job_id,
                        "result": result
                    })
                    
            except Exception as e:
                print(f"❌ Error in LLM queue worker: {e}")
                
                if self.callback:
                    self.callback({
                        "type": "llm_processing_error",
                        "job_id": job_data.get("job_id", "unknown"),
                        "error": str(e)
                    })
            finally:
                self.is_processing = False

    def _format_transcripts_for_llm(self, transcripts: List[Dict[str, Any]]) -> str:
        """Format accumulated transcripts for LLM processing"""
        formatted = []
        for i, transcript in enumerate(transcripts, 1):
            text = transcript.get("text", "")
            timestamp = transcript.get("timestamp", "")
            formatted.append(f"Transcript {i} ({timestamp}): {text}")
        return "\n\n".join(formatted)

    def _get_system_prompt(self) -> str:
        """Get the system prompt for LLM processing"""
        return """You are an expert transcript processor. You will receive multiple overlapping speech transcripts from whisper.cpp that contain duplicate and similar content due to sliding window processing.

Your task is to:
1. Intelligently merge and deduplicate the overlapping content
2. Correct ONLY obvious transcription errors (like "boar" instead of "door") when context clearly indicates the error
3. Create a clean, coherent transcript from the overlapping segments
4. Stay truthful and faithful to the original speech content - do NOT add, embellish, or creatively interpret
5. Preserve the exact meaning, tone, and style of the original speaker
6. If uncertain about a word or phrase, keep the most common version from the transcripts

IMPORTANT: Your goal is accuracy and faithfulness to the original speech, not creative storytelling.

Return only the clean, deduplicated transcript without any explanations or metadata."""

    def get_stats(self) -> Dict[str, Any]:
        """Get LLM processing statistics"""
        avg_processing_time = 0
        if self.total_processed > 0:
            avg_processing_time = self.total_processing_time / self.total_processed
        
        success_rate = 0
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
            "model": self.model
        }

    def clear_queue(self):
        """Clear the processing queue"""
        self.processing_queue = []
        print("🗑️  Cleared LLM processing queue")

    def get_queue_status(self) -> List[Dict[str, Any]]:
        """Get current queue status"""
        return [
            {
                "job_id": job["job_id"],
                "session_id": job["session_id"],
                "transcript_count": len(job["transcripts"]),
                "timestamp": job["timestamp"],
                "status": job["status"]
            }
            for job in self.processing_queue
        ]


# Test function for development
def test_llm_processor():
    """Test the LLM processor with sample data"""
    print("Testing LLM Processor...")
    
    # Sample transcript data
    sample_transcripts = [
        {
            "id": "1",
            "text": "Hello world, this is a test of the whisper system.",
            "timestamp": "2024-01-01T12:00:00Z"
        },
        {
            "id": "2", 
            "text": "Hello world, this is a test of the whisper system. It should work well.",
            "timestamp": "2024-01-01T12:00:02Z"
        },
        {
            "id": "3",
            "text": "This is a test of the whisper system. It should work well for transcription.",
            "timestamp": "2024-01-01T12:00:04Z"
        }
    ]
    
    processor = LLMProcessor()
    
    # Test synchronous processing
    result = processor.process_transcripts_sync(sample_transcripts, "test_session")
    
    if result.get("status") == "success":
        print(f"✅ LLM processing successful:")
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
