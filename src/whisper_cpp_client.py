#!/usr/bin/env python3
"""
Whisper.cpp Client Module
Interfaces with the whisper.cpp server for transcription
"""

import os
import tempfile
import time
import wave
from typing import Any, Optional

import requests


class WhisperCppClient:
    def __init__(self, server_url="http://127.0.0.1:8080", timeout=30):
        """
        Initialize the whisper.cpp client

        Args:
            server_url: URL of the whisper.cpp server
            timeout: Request timeout in seconds
        """
        self.server_url = server_url.rstrip("/")
        self.inference_endpoint = f"{self.server_url}/inference"
        self.timeout = timeout

        # Statistics
        self.total_requests = 0
        self.total_processing_time = 0
        self.failed_requests = 0

        # Test server connection
        self._test_connection()

    def _test_connection(self):
        """Test if the whisper.cpp server is accessible"""
        try:
            requests.get(self.server_url, timeout=5)
            print(f"✅ Connected to whisper.cpp server at {self.server_url}")
        except requests.exceptions.RequestException as e:
            print(
                f"⚠️  Warning: Could not connect to whisper.cpp server at {self.server_url}"
            )
            print(f"   Error: {e}")
            print(
                "   Make sure the server is running with: ./whisper.cpp/build/bin/whisper-server"
            )

    def transcribe_audio_data(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        channels: int = 1,
        language: Optional[str] = None,
        temperature: float = 0.0,
    ) -> Optional[dict[str, Any]]:
        """
        Transcribe raw audio data

        Args:
            audio_data: Raw audio bytes (16-bit PCM)
            sample_rate: Audio sample rate
            channels: Number of audio channels
            language: Target language (optional)
            temperature: Sampling temperature

        Returns:
            Dictionary with transcription results or None if failed
        """
        if not audio_data:
            return None

        # Convert audio data to temporary WAV file
        temp_file = self._audio_data_to_temp_file(audio_data, sample_rate, channels)
        if not temp_file:
            return None

        try:
            result = self.transcribe_file(temp_file, language, temperature)
            return result
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_file)
            except Exception:
                pass

    def transcribe_file(
        self, file_path: str, language: Optional[str] = None, temperature: float = 0.0
    ) -> Optional[dict[str, Any]]:
        """
        Transcribe an audio file

        Args:
            file_path: Path to the audio file
            language: Target language (optional)
            temperature: Sampling temperature

        Returns:
            Dictionary with transcription results or None if failed
        """
        if not os.path.exists(file_path):
            print(f"❌ Audio file not found: {file_path}")
            return None

        try:
            start_time = time.time()

            # Prepare the request
            files = {"file": open(file_path, "rb")}
            data = {"response_format": "json", "temperature": str(temperature)}

            if language:
                data["language"] = language

            # Make the request to whisper.cpp server
            response = requests.post(
                self.inference_endpoint, files=files, data=data, timeout=self.timeout
            )

            processing_time = time.time() - start_time

            # Close the file
            files["file"].close()

            if response.status_code == 200:
                result = response.json()

                # Update statistics
                self.total_requests += 1
                self.total_processing_time += processing_time

                # Extract and format the result
                formatted_result = self._format_result(result, processing_time)

                print(
                    f"🎤 Whisper.cpp result: '{formatted_result['text']}' "
                    f"(confidence: {formatted_result['confidence']:.2f}, "
                    f"time: {processing_time:.2f}s)"
                )

                return formatted_result
            else:
                print(
                    f"❌ Whisper.cpp server error: {response.status_code} - {response.text}"
                )
                self.failed_requests += 1
                return None

        except requests.exceptions.Timeout:
            print(f"❌ Whisper.cpp request timeout after {self.timeout}s")
            self.failed_requests += 1
            return None
        except requests.exceptions.RequestException as e:
            print(f"❌ Whisper.cpp request error: {e}")
            self.failed_requests += 1
            return None
        except Exception as e:
            print(f"❌ Unexpected error in whisper.cpp transcription: {e}")
            self.failed_requests += 1
            return None

    def _audio_data_to_temp_file(
        self, audio_data: bytes, sample_rate: int = 16000, channels: int = 1
    ) -> Optional[str]:
        """Convert raw audio data to a temporary WAV file"""
        try:
            # Create temporary file
            temp_fd, temp_path = tempfile.mkstemp(suffix=".wav")

            with os.fdopen(temp_fd, "wb") as temp_file:
                # Create WAV file
                with wave.open(temp_file, "wb") as wav_file:
                    wav_file.setnchannels(channels)
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(audio_data)

            return temp_path

        except Exception as e:
            print(f"❌ Error creating temp audio file: {e}")
            return None

    def _format_result(
        self, whisper_result: dict[str, Any], processing_time: float
    ) -> dict[str, Any]:
        """Format whisper.cpp result to match our expected format"""
        try:
            text = whisper_result.get("text", "").strip()

            # Extract segments if available
            segments = whisper_result.get("segments", [])

            # Calculate confidence score
            confidence = self._calculate_confidence(whisper_result)

            return {
                "text": text,
                "confidence": confidence,
                "processing_time": processing_time,
                "language": whisper_result.get("language", "unknown"),
                "detected_language": whisper_result.get("detected_language", "unknown"),
                "detected_language_probability": whisper_result.get(
                    "detected_language_probability", 0.0
                ),
                "is_final": True,
                "segments": segments,
                "duration": whisper_result.get("duration", 0.0),
            }

        except Exception as e:
            print(f"❌ Error formatting whisper.cpp result: {e}")
            return {
                "text": whisper_result.get("text", "").strip(),
                "confidence": 0.5,
                "processing_time": processing_time,
                "language": "unknown",
                "is_final": True,
                "segments": [],
            }

    def _calculate_confidence(self, whisper_result: dict[str, Any]) -> float:
        """Calculate confidence score from whisper.cpp result"""
        try:
            # If we have segments with confidence scores, use them
            segments = whisper_result.get("segments", [])
            if segments:
                total_confidence = 0
                total_duration = 0

                for segment in segments:
                    # Some whisper.cpp versions include avg_logprob or no_speech_prob
                    segment_confidence = 0.7  # Default confidence

                    # Use avg_logprob if available (higher is better, typically negative)
                    if "avg_logprob" in segment:
                        avg_logprob = segment["avg_logprob"]
                        # Convert logprob to confidence (rough approximation)
                        segment_confidence = max(
                            0.1, min(1.0, (avg_logprob + 1.0) * 0.5 + 0.5)
                        )

                    # Use no_speech_prob if available (lower is better)
                    if "no_speech_prob" in segment:
                        no_speech_prob = segment["no_speech_prob"]
                        segment_confidence *= 1.0 - no_speech_prob

                    # Weight by segment duration
                    duration = segment.get("end", 0) - segment.get("start", 0)
                    total_confidence += segment_confidence * duration
                    total_duration += duration

                if total_duration > 0:
                    return total_confidence / total_duration

            # Fallback: estimate based on text characteristics
            text = whisper_result.get("text", "").strip()
            if len(text) > 20:
                return 0.8
            elif len(text) > 5:
                return 0.6
            else:
                return 0.4

        except Exception as e:
            print(f"❌ Error calculating confidence: {e}")
            return 0.5

    def get_stats(self) -> dict[str, Any]:
        """Get client statistics"""
        avg_processing_time = 0
        if self.total_requests > 0:
            avg_processing_time = self.total_processing_time / self.total_requests

        success_rate = 0
        if self.total_requests + self.failed_requests > 0:
            success_rate = self.total_requests / (
                self.total_requests + self.failed_requests
            )

        return {
            "total_requests": self.total_requests,
            "failed_requests": self.failed_requests,
            "success_rate": success_rate,
            "total_processing_time": self.total_processing_time,
            "average_processing_time": avg_processing_time,
            "server_url": self.server_url,
        }


# Test function
def test_whisper_cpp_client():
    """Test the whisper.cpp client"""
    print("Testing WhisperCppClient...")

    client = WhisperCppClient()

    # Test with a sample audio file if available
    audio_samples_dir = "src/audio_samples"
    if os.path.exists(audio_samples_dir):
        wav_files = [f for f in os.listdir(audio_samples_dir) if f.endswith(".wav")]

        if wav_files:
            test_file = os.path.join(audio_samples_dir, wav_files[0])
            print(f"Testing with file: {test_file}")

            result = client.transcribe_file(test_file)
            if result:
                print("✅ Transcription successful:")
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

    # Show stats
    stats = client.get_stats()
    print(f"Client stats: {stats}")


if __name__ == "__main__":
    test_whisper_cpp_client()
