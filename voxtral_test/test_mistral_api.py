#!/usr/bin/env python3
"""
Alternative: Test Voxtral using Mistral API instead of local vLLM
"""

import os
from pathlib import Path

from mistral_common.audio import Audio
from mistral_common.protocol.instruct.messages import AudioChunk, TextChunk, UserMessage
from openai import OpenAI


def test_mistral_api():
    """Test Voxtral using Mistral's hosted API"""

    print("🌐 Testing Voxtral via Mistral API")
    print("=" * 50)

    # Check for API key
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("❌ MISTRAL_API_KEY not found")
        print("\n📋 To use Mistral API:")
        print("1. Get API key from https://console.mistral.ai/")
        print("2. Set environment variable:")
        print("   export MISTRAL_API_KEY='your_api_key_here'")
        print("3. Run this script again")
        return

    print(f"✅ API key found (length: {len(api_key)})")

    # Initialize client
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.mistral.ai/v1",
    )

    # Check available models
    try:
        models = client.models.list()
        voxtral_models = [m for m in models.data if "voxtral" in m.id.lower()]

        if not voxtral_models:
            print("❌ No Voxtral models found in your account")
            print("💡 Voxtral might not be available in your region/plan yet")
            return

        print(f"✅ Found Voxtral models: {[m.id for m in voxtral_models]}")
        model_id = voxtral_models[0].id

    except Exception as e:
        print(f"❌ Error accessing Mistral API: {e}")
        return

    # Test with audio file
    audio_file = Path("../whisper.cpp/samples/jfk.wav")
    if not audio_file.exists():
        print(f"❌ Audio file not found: {audio_file}")
        print("💡 Make sure you have the JFK sample from whisper.cpp setup")
        return

    print(f"🔊 Loading audio: {audio_file}")

    try:
        # Load audio
        audio = Audio.from_file(str(audio_file), strict=False)
        audio_chunk = AudioChunk.from_audio(audio)

        # Create message with audio and text
        text_chunk = TextChunk(text="Please transcribe this audio.")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()

        print("🚀 Sending request to Mistral API...")

        # Make API call
        response = client.chat.completions.create(
            model=model_id,
            messages=[user_msg],
            temperature=0.0,  # For transcription
        )

        result = response.choices[0].message.content
        print("\n✅ Transcription Result:")
        print("-" * 30)
        print(result)
        print("-" * 30)

        # Test understanding
        print("\n🧠 Testing audio understanding...")
        understanding_msg = UserMessage(
            content=[
                audio_chunk,
                TextChunk(text="What is the main message of this speech?"),
            ]
        ).to_openai()

        response = client.chat.completions.create(
            model=model_id,
            messages=[understanding_msg],
            temperature=0.2,  # For understanding
            top_p=0.95,
        )

        understanding = response.choices[0].message.content
        print("\n✅ Understanding Result:")
        print("-" * 30)
        print(understanding)
        print("-" * 30)

        print("\n🎉 Mistral API test completed successfully!")

    except Exception as e:
        print(f"❌ Error during API test: {e}")


def show_setup_instructions():
    """Show setup instructions for Mistral API"""
    print("🌐 Mistral API Setup Instructions")
    print("=" * 50)
    print("1. Go to https://console.mistral.ai/")
    print("2. Create an account or sign in")
    print("3. Navigate to API Keys section")
    print("4. Create a new API key")
    print("5. Set environment variable:")
    print("   export MISTRAL_API_KEY='your_api_key_here'")
    print("6. Run: python test_mistral_api.py")
    print("\n💰 Note: Mistral API is a paid service")
    print("📊 Pricing: https://mistral.ai/pricing")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--setup":
        show_setup_instructions()
    else:
        # Check dependencies
        try:
            from mistral_common.audio import Audio
            from mistral_common.protocol.instruct.messages import AudioChunk
        except ImportError as e:
            print(f"❌ Missing dependency: {e}")
            print("📦 Install with: pip install mistral_common[audio]")
            sys.exit(1)

        test_mistral_api()
