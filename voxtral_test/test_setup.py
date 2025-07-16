#!/usr/bin/env python3
"""
Quick setup test for Voxtral environment
"""

import os


def test_setup():
    """Test that everything is set up correctly"""

    print("🧪 Voxtral-Mini-3B-2507 Setup Test")
    print("=" * 40)

    # Test 1: Check dependencies
    print("📦 Testing Dependencies...")
    try:
        import vllm

        print(f"✅ vLLM: {vllm.__version__}")
    except ImportError as e:
        print(f"❌ vLLM: {e}")
        return False

    try:
        import mistral_common

        print(f"✅ mistral_common: {mistral_common.__version__}")
    except ImportError as e:
        print(f"❌ mistral_common: {e}")
        return False

    try:
        from mistral_common.audio import Audio

        print("✅ mistral_common.audio: Available")
    except ImportError as e:
        print(f"❌ mistral_common.audio: {e}")
        return False

    try:
        from openai import OpenAI

        print("✅ OpenAI client: Available")
    except ImportError as e:
        print(f"❌ OpenAI client: {e}")
        return False

    # Test 2: Check audio file
    print("\n🎤 Testing Audio File...")
    audio_file = "../whisper.cpp/samples/jfk.wav"
    if os.path.exists(audio_file):
        print(f"✅ Audio file found: {audio_file}")

        # Test loading
        try:
            audio = Audio.from_file(audio_file, strict=False)
            print(f"✅ Audio loaded: {audio.duration:.1f}s duration")
        except Exception as e:
            print(f"❌ Audio loading failed: {e}")
            return False
    else:
        print(f"❌ Audio file not found: {audio_file}")
        return False

    # Test 3: Check transcription request creation
    print("\n🤖 Testing Request Creation...")
    try:
        from mistral_common.protocol.instruct.messages import RawAudio
        from mistral_common.protocol.transcription.request import TranscriptionRequest

        raw_audio = RawAudio.from_audio(audio)
        req = TranscriptionRequest(
            model="mistralai/Voxtral-Mini-3B-2507",
            audio=raw_audio,
            language="en",
            temperature=0.0,
        ).to_openai(exclude=("top_p", "seed"))

        print("✅ Transcription request created successfully")
        print(f"   Model: {req['model']}")
        print(f"   Language: {req['language']}")

    except Exception as e:
        print(f"❌ Request creation failed: {e}")
        return False

    # Test 4: Check understanding request creation
    print("\n🧠 Testing Understanding Request...")
    try:
        from mistral_common.protocol.instruct.messages import (
            AudioChunk,
            TextChunk,
            UserMessage,
        )

        audio_chunk = AudioChunk.from_audio(audio)
        text_chunk = TextChunk(text="What is this audio about?")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()

        print("✅ Understanding request created successfully")
        print(
            f"   Content types: {[type(c).__name__ for c in user_msg['content'] if isinstance(user_msg['content'], list)]}"
        )

    except Exception as e:
        print(f"❌ Understanding request failed: {e}")
        return False

    print("\n🎉 All tests passed!")
    print("\n🚀 Ready to start Voxtral server:")
    print("   python start_voxtral_server.py")
    print("\n🧪 Then test transcription:")
    print("   python test_voxtral_transcription.py")
    print("   python test_voxtral_understanding.py")

    return True


if __name__ == "__main__":
    test_setup()
