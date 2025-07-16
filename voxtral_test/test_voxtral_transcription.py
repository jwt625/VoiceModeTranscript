#!/usr/bin/env python3
"""
Test script for Voxtral-Mini-3B-2507 transcription capabilities
"""

import os
import sys
from pathlib import Path

import httpx

# Add the parent directory to the path to access audio samples
sys.path.append(str(Path(__file__).parent.parent))

from mistral_common.audio import Audio
from mistral_common.protocol.instruct.messages import RawAudio
from mistral_common.protocol.transcription.request import TranscriptionRequest
from openai import OpenAI


def test_voxtral_transcription():
    """Test Voxtral transcription with JFK sample"""

    print("🎯 Testing Voxtral-Mini-3B-2507 Transcription")
    print("=" * 50)

    # Audio file path
    audio_file = "../whisper.cpp/samples/jfk.wav"

    if not os.path.exists(audio_file):
        print(f"❌ Audio file not found: {audio_file}")
        return

    print(f"📁 Audio file: {audio_file}")

    try:
        # Load audio
        print("🔊 Loading audio file...")
        audio = Audio.from_file(audio_file, strict=False)
        print("✅ Audio loaded successfully")
        print(f"   Duration: {audio.duration:.2f} seconds")
        # Note: Audio object may not have sample_rate attribute in this version

        # Prepare audio for transcription
        raw_audio = RawAudio.from_audio(audio)

        # Note: This will fail without a running vLLM server
        # We'll create the request to show the structure
        print("\n🤖 Preparing transcription request...")

        # Create transcription request
        req = TranscriptionRequest(
            model="mistralai/Voxtral-Mini-3B-2507",
            audio=raw_audio,
            language="en",
            temperature=0.0,
        ).to_openai(exclude=("top_p", "seed"))

        print("✅ Transcription request prepared successfully")
        print(f"   Model: {req['model']}")
        print(f"   Language: {req['language']}")
        print(f"   Temperature: {req['temperature']}")

        print("\n📝 Request structure:")
        for key, value in req.items():
            if key != "file":  # Don't print the binary audio data
                print(f"   {key}: {value}")

        print("\n⚠️  To complete transcription, you need to:")
        print("1. Start vLLM server:")
        print(
            "   vllm serve mistralai/Voxtral-Mini-3B-2507 --tokenizer_mode mistral --config_format mistral --load_format mistral"
        )
        print("2. Run the client code with OpenAI client pointing to vLLM server")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()


def test_voxtral_server_connection():
    """Test connection to vLLM server (if running)"""

    print("\n🌐 Testing vLLM Server Connection")
    print("=" * 50)

    # First, do a quick socket check
    import socket

    try:
        print("🔍 Checking if port 8000 is open...")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)  # 2 second timeout
        result = sock.connect_ex(("localhost", 8000))
        sock.close()

        if result != 0:
            print("❌ Port 8000 is not open - vLLM server not running")
            print("💡 To start the server, run:")
            print("   python start_voxtral_server.py")
            return

        print("✅ Port 8000 is open, testing API...")

    except Exception as e:
        print(f"❌ Socket check failed: {e}")
        print("💡 To start the server, run:")
        print("   python start_voxtral_server.py")
        return

    try:
        # Try to connect to local vLLM server with proper timeout
        client = OpenAI(
            api_key="EMPTY",
            base_url="http://localhost:8000/v1",
            http_client=httpx.Client(timeout=3.0),
        )

        print("🔍 Checking server API status...")
        models = client.models.list()

        if models.data:
            print("✅ vLLM server is running!")
            print("📋 Available models:")
            for model in models.data:
                print(f"   - {model.id}")

            # Test transcription with JFK sample
            audio_file = "../whisper.cpp/samples/jfk.wav"
            if os.path.exists(audio_file):
                print(f"\n🎤 Testing transcription with {audio_file}")

                audio = Audio.from_file(audio_file, strict=False)
                raw_audio = RawAudio.from_audio(audio)

                req = TranscriptionRequest(
                    model=models.data[0].id,
                    audio=raw_audio,
                    language="en",
                    temperature=0.0,
                ).to_openai(exclude=("top_p", "seed"))

                print("🚀 Sending transcription request...")
                response = client.audio.transcriptions.create(**req)

                print("✅ Transcription completed!")
                print(f"📝 Result: {response.text}")

        else:
            print("⚠️  Server responded but no models found")

    except (ConnectionError, httpx.ConnectError, httpx.TimeoutException):
        print("❌ vLLM server not running or not accessible: Connection failed")
        print("💡 To start the server, run:")
        print(
            "   vllm serve mistralai/Voxtral-Mini-3B-2507 --tokenizer_mode mistral --config_format mistral --load_format mistral"
        )
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print("💡 To start the server, run:")
        print(
            "   vllm serve mistralai/Voxtral-Mini-3B-2507 --tokenizer_mode mistral --config_format mistral --load_format mistral"
        )


if __name__ == "__main__":
    test_voxtral_transcription()
    test_voxtral_server_connection()
