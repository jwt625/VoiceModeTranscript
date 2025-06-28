#!/usr/bin/env python3
"""
Whisper.cpp Deduplication Test
Tests real-time transcript deduplication similar to run_whisper_stream_vad.sh
"""

import subprocess
import threading
import time
import re
from collections import deque
from difflib import SequenceMatcher


class TranscriptDeduplicator:
    def __init__(self, max_history=10):
        self.transcript_history = deque(maxlen=max_history)
        self.accumulated_transcript = ""  # This grows over time with all new content
        self.last_raw_transcript = ""     # Keep track of the last raw input

    def similarity(self, a, b):
        """Calculate similarity between two strings"""
        return SequenceMatcher(None, a.lower(), b.lower()).ratio()

    def normalize_text(self, text):
        """Normalize text for comparison"""
        if not text:
            return ""
        # Remove punctuation and extra whitespace, convert to lowercase
        normalized = re.sub(r'[^\w\s]', '', text.lower())
        return ' '.join(normalized.split())

    def is_duplicate_or_subset(self, new_text, existing_text):
        """Check if new_text is a duplicate or subset of existing_text"""
        if not new_text or not existing_text:
            return False

        new_norm = self.normalize_text(new_text)
        existing_norm = self.normalize_text(existing_text)

        if not new_norm or not existing_norm:
            return False

        # Check if new text is identical or a subset of existing text
        return new_norm in existing_norm

    def find_new_content_suffix(self, existing_text, new_text):
        """Find new content at the end of new_text that's not in existing_text"""
        if not existing_text or not new_text:
            return new_text

        existing_norm = self.normalize_text(existing_text)
        new_norm = self.normalize_text(new_text)

        if not new_norm:
            return ""

        if not existing_norm:
            return new_text

        # If new text is shorter or identical, no new content
        if len(new_norm) <= len(existing_norm):
            if new_norm == existing_norm:
                return ""  # Exact duplicate
            # Check if new text is contained in existing text
            if new_norm in existing_norm:
                return ""  # New text is subset of existing

        # Find where existing content ends in new content
        if existing_norm in new_norm:
            # Find the position where existing content ends
            existing_words = existing_norm.split()
            new_words = new_norm.split()

            # Look for the best match of existing content in new content
            best_match_end = 0
            for i in range(len(new_words) - len(existing_words) + 1):
                if new_words[i:i + len(existing_words)] == existing_words:
                    best_match_end = i + len(existing_words)
                    break

            # Extract new content after the match
            if best_match_end < len(new_words):
                new_content_words = new_words[best_match_end:]
                # Map back to original text to preserve punctuation
                original_words = new_text.split()
                if len(original_words) >= len(new_words):
                    # Calculate approximate position in original text
                    words_to_skip = best_match_end
                    if words_to_skip < len(original_words):
                        return ' '.join(original_words[words_to_skip:])

                return ' '.join(new_content_words)

        # If no clear overlap found, check similarity
        similarity = self.similarity(existing_text, new_text)
        if similarity > 0.8:  # Very similar, likely no new content
            return ""
        elif similarity < 0.3:  # Very different, treat as new content
            return new_text
        else:
            # Moderate similarity, try to extract new content more carefully
            return self.extract_new_content_fuzzy(existing_text, new_text)

    def extract_new_content_fuzzy(self, existing_text, new_text):
        """Extract new content using fuzzy matching for moderate similarity cases"""
        existing_words = existing_text.split()
        new_words = new_text.split()

        # Find the longest common subsequence
        # This is a simplified approach - find where existing content best matches in new content
        best_match_score = 0
        best_match_end = 0

        for i in range(len(new_words)):
            for j in range(min(len(existing_words), len(new_words) - i)):
                match_score = 0
                for k in range(j):
                    if i + k < len(new_words) and k < len(existing_words):
                        if self.normalize_text(new_words[i + k]) == self.normalize_text(existing_words[k]):
                            match_score += 1

                if match_score > best_match_score and match_score > len(existing_words) * 0.6:
                    best_match_score = match_score
                    best_match_end = i + j

        # Extract content after the best match
        if best_match_end < len(new_words):
            return ' '.join(new_words[best_match_end:])

        return ""
    
    def extract_new_content(self, new_transcript):
        """Extract only the new content from a transcript and add it to accumulated transcript"""
        if not new_transcript.strip():
            return ""

        # If this is the first transcript, start accumulating
        if not self.accumulated_transcript:
            self.accumulated_transcript = new_transcript
            self.last_raw_transcript = new_transcript
            return new_transcript

        # Normalize both transcripts for comparison
        accumulated_norm = self.normalize_text(self.accumulated_transcript)
        new_norm = self.normalize_text(new_transcript)

        # Check for exact duplicate of last raw input
        if new_transcript == self.last_raw_transcript:
            return ""  # Exact duplicate of last input, no new content

        # Check if new transcript is already contained in accumulated transcript
        if new_norm in accumulated_norm:
            self.last_raw_transcript = new_transcript
            return ""  # New transcript is already in accumulated content

        # Check if accumulated transcript is contained in new transcript (extension case)
        if accumulated_norm in new_norm:
            # New transcript extends accumulated transcript
            new_content = self.find_new_content_suffix(self.accumulated_transcript, new_transcript)
            if new_content.strip():
                # Add only the truly new content to accumulated transcript
                self.accumulated_transcript = self.accumulated_transcript + " " + new_content.strip()
                self.last_raw_transcript = new_transcript
                return new_content.strip()
            else:
                self.last_raw_transcript = new_transcript
                return ""

        # Check if this is a partial overlap or continuation
        # Look for any part of the new transcript that's not in accumulated
        new_words = new_transcript.split()

        # Find the longest suffix of new_transcript that's not in accumulated_transcript
        best_new_content = ""
        for i in range(len(new_words)):
            suffix = " ".join(new_words[i:])
            suffix_norm = self.normalize_text(suffix)
            if suffix_norm and suffix_norm not in accumulated_norm:
                if len(suffix) > len(best_new_content):
                    best_new_content = suffix

        if best_new_content.strip():
            # Add the new content to accumulated transcript
            self.accumulated_transcript = self.accumulated_transcript + " " + best_new_content.strip()
            self.last_raw_transcript = new_transcript
            return best_new_content.strip()

        # Check similarity to determine if this is a completely new segment
        similarity = self.similarity(self.accumulated_transcript, new_transcript)

        if similarity < 0.3:
            # Low similarity, likely a completely new segment
            self.accumulated_transcript = self.accumulated_transcript + " " + new_transcript
            self.last_raw_transcript = new_transcript
            return new_transcript

        # If we get here, it's likely a duplicate or very similar content
        self.last_raw_transcript = new_transcript
        return ""
    
    def process_transcript(self, raw_transcript, debug=False):
        """Process a raw transcript and return deduplicated content"""
        # Clean up the transcript
        cleaned = raw_transcript.strip()
        if not cleaned:
            return None

        # Add to history
        self.transcript_history.append(cleaned)

        # Extract new content
        new_content = self.extract_new_content(cleaned)

        # Debug output
        if debug:
            print(f"[DEDUP DEBUG] Accumulated: '{self.accumulated_transcript}'")
            print(f"[DEDUP DEBUG] New raw: '{cleaned}'")
            print(f"[DEDUP DEBUG] Last raw: '{self.last_raw_transcript}'")
            print(f"[DEDUP DEBUG] Extracted: '{new_content}'")

        return {
            'raw': cleaned,
            'new_content': new_content,
            'full_transcript': self.accumulated_transcript
        }


def test_deduplication_logic():
    """Test the deduplication logic with sample data"""
    print("🧪 Testing Deduplication Logic")
    print("=" * 50)

    deduplicator = TranscriptDeduplicator()

    # Test cases based on the actual output you showed - simulating sequential transcription
    test_cases = [
        ("First transcript", "One rainy Tuesday Sarah decided to try the door."),
        ("Exact duplicate", "One rainy Tuesday Sarah decided to try the door."),
        ("New sentence", "To her surprise, it opened with a gentle chime."),
        ("Exact duplicate of second", "To her surprise, it opened with a gentle chime."),
        ("Extension of previous", "To her surprise, it opened with a gentle chime. Inside, an elderly woman with silver hair smiled warmly."),
        ("Exact duplicate of extension", "To her surprise, it opened with a gentle chime. Inside, an elderly woman with silver hair smiled warmly."),
        ("Just the new part", "Inside, an elderly woman with silver hair smiled warmly."),
        ("Completely new content", "Welcome, dear, I've been waiting for you."),
        ("Extension of welcome", "Welcome, dear, I've been waiting for you. This is our special blend."),
        ("Duplicate of extension", "Welcome, dear, I've been waiting for you. This is our special blend."),
    ]

    print("🔄 Processing transcripts sequentially...")

    for i, (description, transcript) in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {description} ---")
        print(f"Input: '{transcript}'")
        result = deduplicator.process_transcript(transcript, debug=False)
        if result:
            print(f"[RAW]  {result['raw']}")
            if result['new_content']:
                print(f"[NEW]  {result['new_content']}")
            else:
                print(f"[NEW]  (no new content - duplicate detected)")
            print(f"[FULL] {result['full_transcript']}")
        print("-" * 50)

    print("\n✅ Deduplication logic test completed!")
    print("=" * 50)


def run_whisper_with_deduplication():
    """Run whisper.cpp streaming and apply deduplication"""
    
    # Check if whisper-stream exists
    stream_bin = "./whisper.cpp/build/bin/whisper-stream"
    model_path = "./whisper.cpp/models/ggml-base.en.bin"
    
    try:
        # Test if files exist
        import os
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
    
    print("🎯 Starting Whisper.cpp with Real-time Deduplication")
    print("=" * 60)
    print("💡 Speak into your microphone")
    print("📝 Raw transcripts will be shown with [RAW] prefix")
    print("✨ Deduplicated content will be shown with [NEW] prefix")
    print("🔄 Full transcript will be shown with [FULL] prefix")
    print("🛑 Press Ctrl+C to stop")
    print("=" * 60)
    
    deduplicator = TranscriptDeduplicator()
    transcript_count = 0
    
    # Start whisper.cpp process
    cmd = [
        stream_bin,
        "-m", model_path,
        "-t", "6",
        "--step", "0",
        "--length", "30000",
        "-vth", "0.6"
    ]

    print(f"🔧 Running command: {' '.join(cmd)}")

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Redirect stderr to stdout to see all output
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Read output line by line
        line_count = 0
        for line in process.stdout:
            line = line.strip()
            line_count += 1

            if not line:
                continue

            # Look for actual transcript lines with timestamps
            # Format: [00:00:00.000 --> 00:00:05.000]   Text content here
            if re.match(r'^\[[\d:.,\s\-\>]+\]\s+', line):
                # Extract just the text part after the timestamp
                text_match = re.search(r'^\[[\d:.,\s\-\>]+\]\s+(.+)$', line)
                if text_match:
                    transcript_text = text_match.group(1).strip()
                    if transcript_text:
                        print(f"[DEBUG {line_count}] Found transcript: {transcript_text}")

                        # Process transcript with debug enabled
                        result = deduplicator.process_transcript(transcript_text, debug=True)
                        if result:
                            transcript_count += 1

                            print(f"\n--- Transcription {transcript_count} ---")
                            print(f"[RAW]  {result['raw']}")

                            if result['new_content']:
                                print(f"[NEW]  {result['new_content']}")
                            else:
                                print(f"[NEW]  (no new content - duplicate detected)")

                            print(f"[FULL] {result['full_transcript']}")
                            print("-" * 40)
                continue

            # Skip all other debug/info lines
            if (line.startswith('###') or
                line.startswith('init:') or
                line.startswith('whisper_') or
                line.startswith('ggml_') or
                line.startswith('main:') or
                'loading' in line.lower() or
                'START' in line or
                'END' in line or
                't0 =' in line or
                't1 =' in line or
                'ms |' in line or
                'speaking' in line.lower() or
                'backend' in line.lower() or
                'device' in line.lower() or
                'capture' in line.lower() or
                'Metal' in line or
                'GPU' in line):
                continue

                
    except KeyboardInterrupt:
        print("\n\n🛑 Stopping...")
        process.terminate()
        
    except Exception as e:
        print(f"❌ Error running whisper: {e}")
        
    finally:
        if 'process' in locals():
            process.terminate()
            
    print("\n👋 Deduplication test ended.")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_deduplication_logic()
    else:
        print("🎯 Whisper.cpp Deduplication Test")
        print("Options:")
        print("  python test_deduplication.py --test    # Test deduplication logic only")
        print("  python test_deduplication.py           # Run with whisper.cpp")
        print()

        choice = input("Run with whisper.cpp? (y/n): ").lower().strip()
        if choice in ['y', 'yes']:
            run_whisper_with_deduplication()
        else:
            test_deduplication_logic()
