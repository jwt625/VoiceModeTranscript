#!/usr/bin/env python3
"""
Test script for Voxtral-Mini-3B-2507 audio understanding capabilities
"""

import os
import sys
from pathlib import Path

from mistral_common.protocol.instruct.messages import TextChunk, AudioChunk, UserMessage
from mistral_common.audio import Audio
from openai import OpenAI

def test_voxtral_understanding():
    """Test Voxtral audio understanding with JFK sample"""
    
    print("🧠 Testing Voxtral-Mini-3B-2507 Audio Understanding")
    print("=" * 50)
    
    # Audio file path
    audio_file = "../whisper.cpp/samples/jfk.wav"
    
    if not os.path.exists(audio_file):
        print(f"❌ Audio file not found: {audio_file}")
        return
    
    try:
        # Check if server is running
        client = OpenAI(
            api_key="EMPTY",
            base_url="http://localhost:8000/v1",
        )
        
        models = client.models.list()
        if not models.data:
            print("❌ No models available. Is the vLLM server running?")
            print("💡 Start server with: python start_voxtral_server.py")
            return
        
        model = models.data[0].id
        print(f"🤖 Using model: {model}")
        
        # Load and prepare audio
        print(f"🔊 Loading audio: {audio_file}")
        audio = Audio.from_file(audio_file, strict=False)
        
        def file_to_chunk(file_path: str) -> AudioChunk:
            audio = Audio.from_file(file_path, strict=False)
            return AudioChunk.from_audio(audio)
        
        # Test 1: Basic transcription question
        print("\n📝 Test 1: Basic Transcription")
        print("-" * 30)
        
        audio_chunk = file_to_chunk(audio_file)
        text_chunk = TextChunk(text="Please transcribe this audio.")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()
        
        response = client.chat.completions.create(
            model=model,
            messages=[user_msg],
            temperature=0.2,
            top_p=0.95,
        )
        
        print(f"🎯 Response: {response.choices[0].message.content}")
        
        # Test 2: Content analysis
        print("\n🔍 Test 2: Content Analysis")
        print("-" * 30)
        
        text_chunk = TextChunk(text="What is the main topic of this speech? Who is the speaker?")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()
        
        response = client.chat.completions.create(
            model=model,
            messages=[user_msg],
            temperature=0.2,
            top_p=0.95,
        )
        
        print(f"🎯 Response: {response.choices[0].message.content}")
        
        # Test 3: Summarization
        print("\n📋 Test 3: Summarization")
        print("-" * 30)
        
        text_chunk = TextChunk(text="Please provide a brief summary of this audio in one sentence.")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()
        
        response = client.chat.completions.create(
            model=model,
            messages=[user_msg],
            temperature=0.2,
            top_p=0.95,
        )
        
        print(f"🎯 Response: {response.choices[0].message.content}")
        
        # Test 4: Language detection
        print("\n🌍 Test 4: Language Detection")
        print("-" * 30)
        
        text_chunk = TextChunk(text="What language is being spoken in this audio?")
        user_msg = UserMessage(content=[audio_chunk, text_chunk]).to_openai()
        
        response = client.chat.completions.create(
            model=model,
            messages=[user_msg],
            temperature=0.2,
            top_p=0.95,
        )
        
        print(f"🎯 Response: {response.choices[0].message.content}")
        
        print("\n✅ All tests completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

def test_multilingual_capabilities():
    """Test multilingual capabilities if other audio files are available"""
    
    print("\n🌐 Testing Multilingual Capabilities")
    print("=" * 50)
    
    # Check for other audio files in the samples directory
    samples_dir = Path("../whisper.cpp/samples")
    audio_files = list(samples_dir.glob("*.wav")) + list(samples_dir.glob("*.mp3"))
    
    print(f"📁 Found {len(audio_files)} audio files:")
    for audio_file in audio_files:
        print(f"   - {audio_file.name}")
    
    if len(audio_files) == 1:
        print("💡 Only JFK sample available. For multilingual testing, add more audio files to:")
        print(f"   {samples_dir}")
        print("🌍 Voxtral supports: English, Spanish, French, Portuguese, Hindi, German, Dutch, Italian")

if __name__ == "__main__":
    test_voxtral_understanding()
    test_multilingual_capabilities()
