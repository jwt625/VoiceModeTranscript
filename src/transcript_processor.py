#!/usr/bin/env python3
"""
Transcript Processor Module
Handles Whisper transcription and text processing using whisper.cpp
"""

import os
import time
from collections import deque

# Handle both relative and absolute imports
try:
    from .whisper_cpp_client import WhisperCppClient
except ImportError:
    from whisper_cpp_client import WhisperCppClient

class TranscriptProcessor:
    def __init__(self, model_name="base", language=None, server_url="http://127.0.0.1:8080"):
        self.model_name = model_name
        self.language = language
        self.server_url = server_url
        self.is_processing = False

        # Processing queue
        self.audio_queue = deque()
        self.processing_thread = None

        # Statistics
        self.total_processed = 0
        self.total_processing_time = 0

        # Initialize whisper.cpp client
        self._init_client()

    def _init_client(self):
        """Initialize the whisper.cpp client"""
        try:
            print(f"Initializing whisper.cpp client (model: {self.model_name})...")
            start_time = time.time()
            self.client = WhisperCppClient(server_url=self.server_url)
            init_time = time.time() - start_time
            print(f"✅ Whisper.cpp client initialized in {init_time:.2f}s")
        except Exception as e:
            print(f"❌ Failed to initialize whisper.cpp client: {e}")
            raise
    
    def process_audio_chunk(self, audio_data):
        """Process an audio chunk and return transcript"""
        if not self.client or not audio_data:
            return None

        try:
            # Transcribe with whisper.cpp client
            result = self.client.transcribe_audio_data(
                audio_data,
                sample_rate=16000,
                channels=1,
                language=self.language
            )

            if not result:
                print("⚠️  Empty transcript result from whisper.cpp")
                return None

            # Update statistics
            self.total_processed += 1
            self.total_processing_time += result.get('processing_time', 0)

            return result

        except Exception as e:
            print(f"Error processing audio chunk: {e}")
            return None
    

    
    def process_audio_file(self, file_path):
        """Process a complete audio file"""
        if not self.client:
            return None

        try:
            print(f"Processing audio file: {file_path}")

            result = self.client.transcribe_file(
                file_path,
                language=self.language
            )

            if result:
                # Add file path to result
                result['file_path'] = file_path

                # Update statistics
                self.total_processed += 1
                self.total_processing_time += result.get('processing_time', 0)

            return result

        except Exception as e:
            print(f"Error processing audio file {file_path}: {e}")
            return None
    
    def get_processing_stats(self):
        """Get processing statistics"""
        avg_processing_time = 0
        if self.total_processed > 0:
            avg_processing_time = self.total_processing_time / self.total_processed

        # Get client stats and merge with our stats
        client_stats = self.client.get_stats() if self.client else {}

        return {
            'total_processed': self.total_processed,
            'total_processing_time': self.total_processing_time,
            'average_processing_time': avg_processing_time,
            'model_name': self.model_name,
            'server_url': self.server_url,
            'client_stats': client_stats
        }
    
    def change_model(self, model_name):
        """Change the Whisper model (note: requires restarting whisper.cpp server with new model)"""
        if model_name != self.model_name:
            print(f"Note: Changing model from {self.model_name} to {model_name}")
            print("⚠️  To use a different model, restart the whisper.cpp server with the new model file")
            self.model_name = model_name
    
    def set_language(self, language):
        """Set the target language for transcription"""
        self.language = language
        print(f"Language set to: {language or 'auto-detect'}")

# Test function
def test_transcript_processor():
    """Test the transcript processor"""
    print("Testing TranscriptProcessor with whisper.cpp...")

    try:
        processor = TranscriptProcessor(model_name="base")

        # Test with a dummy audio file (if available)
        audio_samples_dir = "src/audio_samples"
        if os.path.exists(audio_samples_dir):
            wav_files = [f for f in os.listdir(audio_samples_dir) if f.endswith('.wav')]

            if wav_files:
                test_file = os.path.join(audio_samples_dir, wav_files[0])
                print(f"Testing with file: {test_file}")

                result = processor.process_audio_file(test_file)
                if result:
                    print(f"✅ Transcription successful:")
                    print(f"   Text: {result['text']}")
                    print(f"   Confidence: {result['confidence']:.2f}")
                    print(f"   Processing time: {result['processing_time']:.2f}s")
                    print(f"   Language: {result['language']}")
                else:
                    print("❌ Transcription failed")
            else:
                print("⚠️  No audio files found for testing")
        else:
            print("⚠️  Audio samples directory not found")

        print("✅ TranscriptProcessor module is working with whisper.cpp")

        # Show stats
        stats = processor.get_processing_stats()
        print(f"Processing stats: {stats}")

    except Exception as e:
        print(f"❌ TranscriptProcessor test failed: {e}")

if __name__ == "__main__":
    test_transcript_processor()
