#!/bin/bash

# Whisper.cpp Streaming Demo Script with VAD (Voice Activity Detection)
# This script runs the whisper-stream tool with VAD for more efficient transcription

WHISPER_DIR="./whisper.cpp"
MODEL_PATH="$WHISPER_DIR/models/ggml-base.en.bin"
STREAM_BIN="$WHISPER_DIR/build/bin/whisper-stream"

echo "🎤 Whisper.cpp Streaming Speech-to-Text Demo (VAD Mode)"
echo "======================================================="

# Check if the binary exists
if [ ! -f "$STREAM_BIN" ]; then
    echo "❌ Error: whisper-stream binary not found at $STREAM_BIN"
    echo "Please make sure whisper.cpp is built with SDL2 support."
    exit 1
fi

# Check if the model exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "❌ Error: Model not found at $MODEL_PATH"
    echo "Please download the model first."
    exit 1
fi

echo "✅ Found whisper-stream binary"
echo "✅ Found model: $MODEL_PATH"
echo ""
echo "🎯 Starting VAD-enabled speech transcription..."
echo "💡 Speak into your microphone - transcription will appear when speech is detected"
echo "🔇 VAD will detect silence and only transcribe speech segments"
echo "🛑 Press Ctrl+C to stop"
echo ""
echo "📝 LIVE TRANSCRIPT:"
echo "=================="

# Run the streaming demo with VAD (Voice Activity Detection)
# --step 0 enables sliding window mode with VAD
# -vth 0.6 sets VAD threshold (higher = more sensitive to silence)
"$STREAM_BIN" \
    -m "$MODEL_PATH" \
    -t 6 \
    --step 0 \
    --length 30000 \
    -vth 0.6 \
    2>/dev/null

echo ""
echo "👋 VAD streaming demo ended."
