#!/usr/bin/env python3
"""
LLM-Based Whisper.cpp Deduplication Test
Uses LLM to intelligently deduplicate and summarize overlapping transcripts
"""

import subprocess
import threading
import re
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class LLMTranscriptProcessor:
    def __init__(self):
        """
        Initialize LLM-based transcript processor with manual spacebar triggering
        """
        self.accumulated_transcripts = []
        self.transcript_counter = 0
        self.current_transcription_block = []
        self.in_transcription_block = False

        # Initialize OpenAI client for Lambda Labs
        self.client = OpenAI(
            api_key=os.getenv("LLM_API_KEY"),
            base_url="https://api.lambda.ai/v1",
        )
        self.model = "llama-4-maverick-17b-128e-instruct-fp8"



    def process_line(self, line):
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
                self.add_transcript_block(self.current_transcription_block)
            self.in_transcription_block = False
            self.current_transcription_block = []

            return

        # If we're in a transcription block, collect the lines
        if self.in_transcription_block:
            self.current_transcription_block.append(line)

    def add_transcript_block(self, block_lines):
        """Process a complete transcription block and extract transcript text"""
        transcript_text = self.extract_transcript_from_block(block_lines)
        if not transcript_text:
            return

        self.transcript_counter += 1

        print(f"\n--- Transcription {self.transcript_counter} ---")
        print(f"[RAW] {transcript_text}")

        # Add to accumulated transcripts
        self.accumulated_transcripts.append(transcript_text)
        print(f"� Total accumulated transcripts: {len(self.accumulated_transcripts)}")
        print("⌨️  Press ENTER to process with LLM, or let it accumulate more...")

    def extract_transcript_from_block(self, block_lines):
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
        return self.clean_transcript(full_transcript)
            
    def clean_transcript(self, text):
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
        
    def process_with_llm(self):
        """Send accumulated transcripts to LLM for deduplication and summarization"""
        if not self.accumulated_transcripts:
            return
            
        print(f"\n🤖 Processing {len(self.accumulated_transcripts)} transcripts with LLM...")
        
        # Prepare the prompt
        transcript_text = self.format_transcripts_for_llm()
        
        try:
            response = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": """You are an expert transcript processor. You will receive multiple overlapping speech transcripts from whisper.cpp that contain duplicate and similar content due to sliding window processing.

Your task is to:
1. Intelligently merge and deduplicate the overlapping content
2. Correct ONLY obvious transcription errors (like "boar" instead of "door") when context clearly indicates the error
3. Create a clean, coherent transcript from the overlapping segments
4. Stay truthful and faithful to the original speech content - do NOT add, embellish, or creatively interpret
5. Preserve the exact meaning, tone, and style of the original speaker
6. If uncertain about a word or phrase, keep the most common version from the transcripts

IMPORTANT: Your goal is accuracy and faithfulness to the original speech, not creative storytelling.

Return only the clean, deduplicated transcript without any explanations or metadata."""
                    },
                    {
                        "role": "user", 
                        "content": f"Please process these overlapping transcripts:\n\n{transcript_text}"
                    }
                ],
                model=self.model,
                temperature=0.1,  # Low temperature for consistent processing
                max_tokens=1000
            )
            
            # Extract the cleaned transcript
            cleaned_result = response.choices[0].message.content.strip()
            
            print(f"\n✨ LLM PROCESSED RESULT:")
            print(f"[CLEAN] {cleaned_result}")
            print(f"\n{'='*60}")
            
        except Exception as e:
            print(f"❌ Error calling LLM: {e}")
            
        # Clear accumulated transcripts after processing
        self.accumulated_transcripts = []

    def manual_process_trigger(self):
        """Manually trigger LLM processing"""
        if self.accumulated_transcripts:
            print(f"\n🤖 Manual trigger: Processing {len(self.accumulated_transcripts)} transcripts with LLM...")
            self.process_with_llm()
        else:
            print("📝 No transcripts to process yet.")
        
    def format_transcripts_for_llm(self):
        """Format accumulated transcripts for LLM processing"""
        formatted = []
        for i, transcript in enumerate(self.accumulated_transcripts, 1):
            formatted.append(f"Transcript {i}: {transcript}")
        return "\n\n".join(formatted)


def keyboard_listener(processor):
    """Listen for Enter key presses to trigger LLM processing"""
    print("⌨️  Keyboard listener started. Press ENTER to process transcripts with LLM.")

    try:
        while True:
            # Wait for Enter key
            input()  # This will wait for Enter key press
            processor.manual_process_trigger()
    except KeyboardInterrupt:
        pass
    except EOFError:
        pass


def run_whisper_with_llm():
    """Run whisper.cpp streaming and apply LLM-based deduplication"""
    
    # Check if whisper-stream exists
    stream_bin = "./whisper.cpp/build/bin/whisper-stream"
    model_path = "./whisper.cpp/models/ggml-base.en.bin"
    
    try:
        if not os.path.exists(stream_bin):
            print(f"❌ whisper-stream not found at {stream_bin}")
            print("Please build whisper.cpp first")
            return
            
        if not os.path.exists(model_path):
            print(f"❌ Model not found at {model_path}")
            print("Please download the model first")
            return
            
    except Exception as e:
        print(f"❌ Error checking files: {e}")
        return

    print("🎤 Starting LLM-based Whisper.cpp Deduplication Test")
    print("=" * 60)
    print("💡 Speak into your microphone")
    print("⌨️  Press ENTER to process accumulated transcripts with LLM")
    print("🛑 Press Ctrl+C to stop")
    print("")

    # Initialize the LLM processor
    processor = LLMTranscriptProcessor()

    # Start keyboard listener in a separate thread
    keyboard_thread = threading.Thread(target=keyboard_listener, args=(processor,), daemon=True)
    keyboard_thread.start()

    # Whisper command similar to run_whisper_stream_vad.sh
    cmd = [
        stream_bin,
        "-m", model_path,
        "-t", "6",           # 6 threads
        "--step", "0",       # Enable sliding window mode with VAD
        "--length", "30000", # 30 second window
        "-vth", "0.6"        # VAD threshold
    ]

    print(f"🔧 Running command: {' '.join(cmd)}")

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        # Read output line by line
        for line in iter(process.stdout.readline, ''):
            if line:
                # Process each line through the transcript processor
                processor.process_line(line)

    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
        process.terminate()

        # Process any remaining transcripts
        if processor.accumulated_transcripts:
            print("\n🔄 Processing remaining transcripts...")
            processor.process_with_llm()

    except Exception as e:
        print(f"❌ Error running whisper: {e}")
    finally:
        if 'process' in locals():
            process.terminate()


if __name__ == "__main__":
    # Check if LLM API key is available
    if not os.getenv("LLM_API_KEY"):
        print("❌ LLM_API_KEY not found in .env file")
        exit(1)
        
    run_whisper_with_llm()
