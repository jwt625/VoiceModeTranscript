# Whisper.cpp Streaming Setup Guide

## ✅ Setup Complete!

Your whisper.cpp installation is ready and working! The model has been successfully tested.

## 🎯 Quick Start

### Option 1: Basic Streaming (Continuous)
```bash
./run_whisper_stream.sh
```

### Option 2: VAD Mode (Voice Activity Detection - More Efficient)
```bash
./run_whisper_stream_vad.sh
```

## 🔧 Microphone Permission Issue (macOS)

If you see "couldn't open an audio device for capture" error, this is a macOS permission issue. Here's how to fix it:

### Method 1: Grant Terminal Microphone Access
1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Click on **Microphone** in the left sidebar
3. Find **Terminal** in the list and check the box to enable it
4. If Terminal isn't listed, click the **+** button and add `/Applications/Utilities/Terminal.app`
5. Restart Terminal and try again

### Method 2: Run from Applications folder
Sometimes running from a different location helps:
```bash
# Copy the binary to a more accessible location
cp ./whisper.cpp/build/bin/whisper-stream /tmp/whisper-stream
/tmp/whisper-stream -m ./whisper.cpp/models/ggml-base.en.bin -t 8 --step 500 --length 5000
```

### Method 3: Check Audio Devices
```bash
# List audio devices (if you have system_profiler)
system_profiler SPAudioDataType
```

## 📊 Performance Settings Explained

### Basic Mode (`run_whisper_stream.sh`)
- **step**: 500ms - Transcribes every 0.5 seconds
- **length**: 5000ms - Uses 5 seconds of audio buffer
- **threads**: 8 - Uses 8 CPU threads
- **keep**: 200ms - Keeps 200ms from previous chunk

### VAD Mode (`run_whisper_stream_vad.sh`)
- **step**: 0 - Enables sliding window with VAD
- **length**: 30000ms - Uses 30 seconds of audio buffer
- **vad-threshold**: 0.6 - Voice activity detection sensitivity
- More efficient - only processes when speech is detected

## 🎛️ Manual Usage

```bash
# Basic streaming
./whisper.cpp/build/bin/whisper-stream \
    -m ./whisper.cpp/models/ggml-base.en.bin \
    -t 8 --step 500 --length 5000

# VAD mode
./whisper.cpp/build/bin/whisper-stream \
    -m ./whisper.cpp/models/ggml-base.en.bin \
    -t 6 --step 0 --length 30000 -vth 0.6

# With specific capture device
./whisper.cpp/build/bin/whisper-stream \
    -m ./whisper.cpp/models/ggml-base.en.bin \
    -c 1 -t 8 --step 500 --length 5000
```

## 🔍 Troubleshooting

### Test the Model (Non-streaming)
```bash
./whisper.cpp/build/bin/whisper-cli \
    -m ./whisper.cpp/models/ggml-base.en.bin \
    -f ./whisper.cpp/samples/jfk.wav
```

### Check Available Models
```bash
ls -la ./whisper.cpp/models/
```

### Download Different Models
```bash
# Faster but less accurate
./whisper.cpp/models/download-ggml-model.sh tiny.en

# More accurate but slower
./whisper.cpp/models/download-ggml-model.sh small.en
```

## 🚀 Expected Performance

- **Real-time transcription** with ~500ms latency
- **GPU acceleration** on Apple Silicon (Metal)
- **Local processing** - no internet required
- **High accuracy** with base.en model

## 📝 Notes

- The setup is complete and the model works (tested with JFK sample)
- The only remaining issue is microphone permissions on macOS
- Once permissions are granted, streaming should work perfectly
- VAD mode is recommended for better efficiency
