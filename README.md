# ChatGPT Voice Mode Transcript Recorder

A real-time transcript recorder for ChatGPT voice conversations with dual audio capture, whisper.cpp streaming, and intelligent LLM deduplication.

## Features

- **Real-time transcription** using whisper.cpp streaming
- **Dual audio capture** - microphone and system audio simultaneously
- **Intelligent deduplication** using LLM processing to clean overlapping transcripts
- **Dual-panel interface** - compare raw vs processed transcripts
- **Database storage** with export functionality
- **Dark mode interface** with real-time status indicators

## Prerequisites

- **Python 3.9+** with uv package manager
- **macOS/Linux** (Windows support via WSL)
- **Git** for cloning repositories
- **Lambda Labs API key** (for LLM processing)
- **BlackHole 2ch** (for system audio capture)

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/jwt625/Voice_Mode_transcript.git
cd Voice_Mode_transcript
```

### 2. Install Dependencies
```bash
uv sync
```

### 3. Build whisper.cpp
```bash
# Clone and build whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make clean
make -j$(sysctl -n hw.ncpu)  # macOS
# make -j$(nproc)  # Linux

# Download model
bash ./models/download-ggml-model.sh base.en
cd ..
```

### 4. Setup Audio (macOS)
```bash
# Install BlackHole for system audio capture
brew install blackhole-2ch
```

**Configure Multi-Output Device:**
1. Open **Audio MIDI Setup** (Applications → Utilities)
2. Click **+** → **Create Multi-Output Device**
3. Check both your **speakers/headphones** and **BlackHole 2ch**
4. Set this Multi-Output Device as your **system audio output**
5. In the app, select **BlackHole 2ch** for system audio capture

### 5. Configure Environment
```bash
# Create .env file
echo 'LLM_API_KEY="your_lambda_labs_api_key_here"' > .env
echo 'LLM_BASE_URL="https://api.lambda.ai/v1"' >> .env
echo 'LLM_MODEL="llama-4-maverick-17b-128e-instruct-fp8"' >> .env
echo 'WHISPER_STREAM_BINARY="./whisper.cpp/build/bin/whisper-stream"' >> .env
echo 'WHISPER_MODEL_PATH="./whisper.cpp/models/ggml-base.en.bin"' >> .env
```

## Running the App

```bash
uv run python app.py
```

Open your browser to: **http://localhost:5001**

## Usage

### Recording Workflow
1. Open http://localhost:5001 in your browser
2. Select microphone and system audio devices
3. Click "Start Recording"
4. Speak into your microphone → raw transcripts appear in left panel
5. Press **Enter** or click "Process with LLM" → cleaned transcripts appear in right panel
6. Click "Stop Recording" when done

### Keyboard Shortcuts
- **Enter** - Process accumulated transcripts with LLM
- **Spacebar** - Manual LLM processing trigger

### Interface
- **Left Panel**: Real-time whisper.cpp output with overlapping segments
- **Right Panel**: Clean, deduplicated text from LLM processing
- **Export**: Download processed transcripts as JSON

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

For detailed setup guides, troubleshooting, and development information, see the `docs/` directory.
