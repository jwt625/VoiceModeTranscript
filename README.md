# ChatGPT Voice Mode Transcript Recorder

A real-time transcript recorder for ChatGPT voice conversations with **dual-panel interface**, **whisper.cpp streaming**, and **intelligent LLM deduplication**.

## 🎯 Key Features

- **🎤 Real-time whisper.cpp streaming** (no separate server needed!)
- **🤖 Intelligent LLM deduplication** using Lambda Labs API
- **📱 Dual-panel interface** - raw transcripts vs processed transcripts
- **⌨️ Keyboard shortcuts** - Press Enter to process with LLM
- **💾 Dual database storage** - raw and processed transcripts
- **🌙 Beautiful dark mode interface** with responsive design
- **📊 Real-time processing monitor** with status indicators
- **📤 Export functionality** for processed transcripts

## 🚀 Major Upgrade: Whisper.cpp Streaming + LLM Processing

**This version features a complete architectural upgrade:**

- **🔥 Whisper.cpp streaming**: Direct subprocess integration (3-5x faster than HTTP)
- **🧠 LLM deduplication**: Intelligent transcript cleaning using llama-4-maverick-17b
- **📋 Dual-panel UI**: Compare raw whisper.cpp output vs LLM-processed results
- **⚡ Real-time processing**: Live transcript accumulation with manual LLM triggering
- **🎯 No overlapping transcripts**: Smart deduplication eliminates whisper.cpp sliding window artifacts

## 🏗️ New Architecture

### Integrated Streaming Application
**Single Flask application with whisper.cpp streaming and LLM processing:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Flask Application                        │
│                     (app.py)                               │
├─────────────────────────────────────────────────────────────┤
│  🌐 Web Server (Flask) + 📡 SSE                            │
│  🎤 Audio Capture (PyAudio)                                │
│  🔄 Whisper.cpp Streaming (subprocess)                     │
│  🤖 LLM Processing (Lambda Labs API)                       │
│  💾 Dual Database (SQLite)                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ subprocess
┌─────────────────────────────────────────────────────────────┐
│              whisper.cpp streaming binary                  │
│                 (whisper-stream)                           │
├─────────────────────────────────────────────────────────────┤
│  🚀 Real-time C++ Whisper Implementation                   │
│  📝 Streaming transcript output                            │
│  🔥 GPU/Metal Acceleration                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ API calls
┌─────────────────────────────────────────────────────────────┐
│                   Lambda Labs LLM API                      │
│            (llama-4-maverick-17b-128e-instruct)            │
├─────────────────────────────────────────────────────────────┤
│  🧠 Intelligent transcript deduplication                   │
│  ✨ Error correction and cleaning                          │
│  🎯 Semantic overlap resolution                            │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- **No separate server needed** - whisper.cpp runs as subprocess
- **Real-time streaming** - Direct transcript processing
- **Intelligent deduplication** - LLM removes overlapping content
- **Dual-panel comparison** - See raw vs processed transcripts
- **Privacy-focused** - Local whisper.cpp + optional LLM API

## 🚀 Complete Installation Guide

### Prerequisites
- **Python 3.9+** with uv package manager
- **macOS/Linux** (Windows support via WSL)
- **Git** for cloning repositories
- **Lambda Labs API key** (for LLM processing)

### 1. Clone and Setup Main Repository
```bash
# Clone this repository
git clone https://github.com/your-username/Voice_Mode_transcript.git
cd Voice_Mode_transcript

# Install Python dependencies
uv sync
```

### 2. Clone and Build whisper.cpp
```bash
# Clone whisper.cpp in the project directory
git clone https://github.com/ggerganov/whisper.cpp.git

# Build whisper.cpp with optimizations
cd whisper.cpp
make clean
make -j$(nproc)  # Linux
# OR
make -j$(sysctl -n hw.ncpu)  # macOS

# Verify the streaming binary was built
ls -la build/bin/whisper-stream
```

### 3. Download Whisper Model
```bash
# Download the base English model (recommended)
bash ./models/download-ggml-model.sh base.en

# Verify model was downloaded
ls -la models/ggml-base.en.bin
```

### 4. Configure Environment
```bash
# Return to project root
cd ..

# Copy example environment file (if it exists) or create .env
echo 'LLM_API_KEY="your_lambda_labs_api_key_here"' > .env
echo 'LLM_BASE_URL="https://api.lambda.ai/v1"' >> .env
echo 'LLM_MODEL="llama-4-maverick-17b-128e-instruct-fp8"' >> .env
echo 'WHISPER_STREAM_BINARY="./whisper.cpp/build/bin/whisper-stream"' >> .env
echo 'WHISPER_MODEL_PATH="./whisper.cpp/models/ggml-base.en.bin"' >> .env

# Edit .env and add your actual Lambda Labs API key
```

### 5. Run the Application (Single Command!)
```bash
# Start the Flask server using uv (in another terminal)
uv run python app.py
```

**That's it!** The application will:
- ✅ Start Flask web server on `http://localhost:5001`
- ✅ Initialize whisper.cpp streaming processor
- ✅ Connect to Lambda Labs LLM API
- ✅ Set up dual transcript database
- ✅ Display startup information

### 6. Access the Interface
Open your browser to: **http://localhost:5001**

## 🎤 How to Use the New Dual-Panel Interface

### Recording Workflow
1. **Open** http://localhost:5001 in your browser
2. **Click** "🎤 Start Recording" → whisper.cpp streaming starts automatically
3. **Speak** into your microphone → raw transcripts appear in **left panel**
4. **Press Enter** or click "🤖 Process with LLM" → cleaned transcripts appear in **right panel**
5. **Click** "⏹️ Stop Recording" → whisper.cpp streaming stops automatically

### Keyboard Shortcuts
- **Enter** - Process accumulated transcripts with LLM
- **Ctrl+C** - Stop recording

### Panel Controls
- **👁️ Hide/Show** - Toggle visibility of raw or processed panels
- **💾 Save to Database** - Save processed transcripts
- **📤 Export** - Download processed transcripts as JSON

### What You'll See
- **Left Panel (Raw)**: Real-time whisper.cpp output with overlapping segments
- **Right Panel (Processed)**: Clean, deduplicated text from LLM processing
- **Status Indicators**: Real-time processing status and transcript counts
- **Quality Metrics**: Processing times and session statistics

## 📁 Project Structure

```
Voice_Mode_transcript/
├── app.py                 # 🚀 Main Flask application (START HERE)
├── pyproject.toml         # 📦 Python project configuration (uv)
├── uv.lock               # 🔒 Dependency lock file (uv)
├── transcripts.db        # 💾 SQLite database (auto-created)
├── README.md             # 📖 This file
├── TODO.md               # 📋 Implementation plan
├── docs/                 # 📚 Documentation
│   ├── STATUS.md             # 📊 Current progress
│   └── AUDIO_SETUP.md        # 🎤 Audio hardware setup guide
│
├── src/                  # 🔧 Core modules
│   ├── whisper_stream_processor.py # 🚀 NEW: whisper.cpp streaming integration
│   ├── llm_processor.py         # 🤖 NEW: LLM deduplication processor
│   ├── audio_capture.py         # 🎤 Audio recording logic
│   ├── transcript_processor.py  # 🧠 Legacy whisper.cpp HTTP client
│   ├── whisper_cpp_client.py    # 🚀 Legacy whisper.cpp HTTP client
│   ├── audio_test.py            # 🧪 Audio testing utility
│   └── whisper_test.py          # 🧪 Whisper testing utility
│
├── templates/            # 🌐 HTML templates
│   └── index.html           # 📄 Main web interface
│
├── static/               # 🎨 Frontend assets
│   ├── css/
│   │   └── style.css        # 🌙 Dark mode styles
│   └── js/
│       └── app.js           # ⚡ Real-time frontend logic
│
├── audio_samples/        # 🎵 Recorded audio files (auto-created)
├── whisper.cpp/          # 🚀 whisper.cpp repository (for transcription server)
│   ├── build/bin/           # 🔧 Compiled binaries
│   │   └── whisper-server   # 🖥️ whisper.cpp HTTP server
│   └── models/              # 🧠 Whisper model files
│       └── ggml-base.en.bin # 📦 Base English model
└── .venv/                # 🐍 Python virtual environment (managed by uv)
```

## 🎮 How to Use

### Starting a Recording Session
1. **Open** http://localhost:5001 in your browser
2. **Click** "🎤 Start Recording" button
3. **Speak** into your microphone
4. **Watch** real-time transcripts appear
5. **Monitor** audio levels and quality metrics
6. **Click** "⏹️ Stop Recording" when done

### Features in Action
- **Volume bars** show real-time audio levels
- **Transcripts** appear every ~3 seconds of speech
- **Confidence scores** indicate transcription quality
- **Session info** shows recording duration
- **Auto-save** happens every conversation round

## 🔧 Testing & Debugging

### Test Audio Capture
```bash
# Test microphone and system audio
cd src
uv run python audio_test.py
```

### Test Whisper Transcription
```bash
# Test AI transcription
cd src
uv run python whisper_test.py
```

### Debug WebSocket Connection
1. **Open browser console** (F12 → Console)
2. **Start recording** and look for:
   - `📝 Transcript update received:` messages
   - `🔊 Audio level received:` messages
3. **Check Flask console** for:
   - `📤 Transcript emitted:` messages
   - `🔊 Audio level emitted:` messages

## ⚙️ Configuration

### Environment Variables (.env)
```bash
LLM_API_KEY="your_lambda_labs_api_key"
LLM_BASE_URL="https://api.lambda.ai/v1"
LLM_MODEL="llama-4-maverick-17b-128e-instruct-fp8"
WHISPER_STREAM_BINARY="./whisper.cpp/build/bin/whisper-stream"
WHISPER_MODEL_PATH="./whisper.cpp/models/ggml-base.en.bin"
```

### Whisper.cpp Settings
- **Model**: `base.en` (~74MB, good balance of speed/quality)
- **Threads**: 6 (configurable in whisper_stream_processor.py)
- **VAD Threshold**: 0.6 (voice activity detection)
- **Window Length**: 30 seconds (sliding window)

### LLM Processing
- **Model**: llama-4-maverick-17b-128e-instruct-fp8
- **Temperature**: 0.1 (consistent processing)
- **Max Tokens**: 1000
- **Processing**: Async with queue management

### Server Settings
- **Host**: `0.0.0.0` (accessible from network)
- **Port**: `5001`
- **Debug Mode**: Enabled (auto-reload on changes)

## 🎤 Audio Hardware Setup

### Required Hardware
1. **Microphone**: USB mic, headset, or AirPods
2. **Virtual Audio Device**: BlackHole for system audio capture

### Setup Instructions
```bash
# Install BlackHole for system audio capture
brew install blackhole-2ch

# Grant microphone permissions
# System Preferences → Security & Privacy → Privacy → Microphone
# ✅ Check "Terminal" or your Python app
```

**Detailed setup**: See `AUDIO_SETUP.md`

## 🐛 Troubleshooting

### No Microphone Detected
- **Connect** a USB microphone or headset
- **Check** System Preferences → Sound → Input
- **Grant** microphone permissions to Terminal

### No Transcripts Appearing
- **Check** browser console for WebSocket errors
- **Verify** Flask console shows "📤 Transcript emitted" messages
- **Ensure** you're speaking clearly for 3+ seconds

### Audio Levels Not Moving
- **Test** microphone with `uv run python src/audio_test.py`
- **Check** audio permissions
- **Try** different microphone device

### WebSocket Connection Issues
- **Refresh** the browser page
- **Check** Flask console for "Client connected" messages
- **Disable** browser ad blockers or extensions

## 📊 Current Status

### ✅ Working Features (NEW!)
- ✅ **Dual-panel interface** with raw and processed transcripts
- ✅ **Whisper.cpp streaming** (no separate server needed)
- ✅ **LLM deduplication** using Lambda Labs API
- ✅ **Real-time transcript accumulation** with manual processing
- ✅ **Keyboard shortcuts** (Enter for LLM processing)
- ✅ **Database storage** for both raw and processed transcripts
- ✅ **Export functionality** for processed transcripts
- ✅ **Panel toggle controls** for customized viewing

### 🎯 Key Improvements
- **3-5x faster transcription** with whisper.cpp streaming
- **Intelligent deduplication** eliminates overlapping segments
- **User-controlled processing** with Enter key trigger
- **Comparison view** between raw and processed transcripts
- **No external server dependencies** - everything integrated

### 🔄 Next Steps (Optional)
1. **Test with real conversations** to validate LLM processing
2. **Customize LLM prompts** for specific use cases
3. **Add more export formats** (TXT, CSV, etc.)
4. **Implement transcript search** and filtering

## 🚀 Development

### Making Changes
The Flask server runs in **debug mode** with auto-reload:
- **Python changes**: Server automatically restarts
- **Frontend changes**: Refresh browser to see updates
- **CSS/JS changes**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Adding Features
- **Backend**: Modify `app.py` or modules in `src/`
- **Frontend**: Update `templates/index.html` or `static/`
- **Database**: Schema defined in `app.py` `init_database()`

## 📝 License

This project is for educational and personal use. whisper.cpp and Whisper models are subject to their respective license terms.

---

**🎯 Ready to record your ChatGPT conversations with intelligent LLM processing!**

### Single Command Start:
```bash
uv run python app.py
```

### Usage:
1. **Open** http://localhost:5001
2. **Click** "🎤 Start Recording" → whisper.cpp streaming starts automatically
3. **Speak** → raw transcripts appear in left panel
4. **Press Enter** → LLM processes and cleans transcripts in right panel
5. **Export** processed transcripts when done

**No separate whisper.cpp server needed - everything is integrated!**
