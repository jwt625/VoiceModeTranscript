# Voxtral-Mini-3B-2507 Testing Environment

This directory contains a complete testing setup for **Voxtral-Mini-3B-2507**, Mistral AI's new audio-text-to-text model with transcription and understanding capabilities.

## 🎯 What is Voxtral?

Voxtral-Mini-3B-2507 is a 3B parameter model that enhances Ministral 3B with audio capabilities:

- **Dedicated transcription mode** with automatic language detection
- **Audio understanding** for Q&A, summarization, and content analysis
- **Multilingual support** (8 languages: EN, ES, FR, PT, HI, DE, NL, IT)
- **Long-form context** (32k tokens) - handles up to 30 min transcription, 40 min understanding
- **Function calling from voice** (experimental)
- **Retains text capabilities** from Ministral 3B backbone

## 🖥️ System Requirements & Compatibility

**Your Mac mini M4 Pro Setup:**
- ✅ **GPU Memory**: ~9.5 GB required (you have 24 GB unified memory)
- ✅ **Python**: 3.9+ (using existing project venv)
- ✅ **Dependencies**: All installed in parent project's virtual environment

**Memory Analysis:**
- Voxtral-Mini-3B: ~9.5 GB ✅ (fits comfortably)
- Voxtral-Small-24B: ~55 GB ❌ (would require 31 GB more than available)

## 📦 Installation Status

**✅ Complete Setup:**
- vLLM 0.9.2 with audio support
- mistral_common 1.8.0 with audio capabilities
- OpenAI client for API communication
- All dependencies installed in parent project's `.venv`

**🧹 Cleaned Up:**
- Removed redundant local `.venv` (was empty and unused)
- Tests use parent project's virtual environment via `uv run`

## 🚀 Quick Start

### 1. Get the Voxtral Model

**Option A: Manual Download (No Authentication Required)**

**Easy Download (Recommended):**
```bash
python download_model.py
```
This script will download all required files (~9.4 GB total) with progress bars.

**Manual Download with curl:**
```bash
# Create models directory
mkdir -p models/voxtral-mini-3b

# Download model files manually
cd models/voxtral-mini-3b

# Download the main model file (~9.35 GB)
curl -L -o consolidated.safetensors "https://huggingface.co/mistralai/Voxtral-Mini-3B-2507/resolve/main/consolidated.safetensors"

# Download configuration files
curl -L -o params.json "https://huggingface.co/mistralai/Voxtral-Mini-3B-2507/resolve/main/params.json"
curl -L -o tekken.json "https://huggingface.co/mistralai/Voxtral-Mini-3B-2507/resolve/main/tekken.json"
curl -L -o README.md "https://huggingface.co/mistralai/Voxtral-Mini-3B-2507/resolve/main/README.md"

cd ../..
```

**Option B: Hugging Face Authentication**
If you prefer automatic download, set up authentication:

```bash
# Quick setup script
python setup_hf_auth.py

# Manual setup
export HF_TOKEN='your_huggingface_token_here'
# OR
huggingface-cli login
```

**To get a token:**
1. Create account at https://huggingface.co/join
2. Go to https://huggingface.co/settings/tokens
3. Create new token with 'Read' permissions
4. Copy the token and set it as HF_TOKEN

### 2. Verify Setup
```bash
python test_setup.py
```
**Expected output:** All dependency checks pass, JFK audio loads successfully

### 3. Start vLLM Server
```bash
python start_voxtral_server.py
```
**What happens:**
- Checks for local model first (in `models/voxtral-mini-3b/`)
- If local model not found, checks Hugging Face authentication
- Downloads model if needed (~9.4 GB, first time only)
- Starts server on `http://localhost:8000`
- Shows startup progress and memory usage
- Takes 1-2 minutes to fully initialize

**💡 Tip:** If you downloaded the model manually, the script will automatically detect and use it!

### 3. Test Transcription (in another terminal)
```bash
python test_voxtral_transcription.py
```
**Tests:**
- Basic audio-to-text conversion
- Request structure validation
- Server connectivity with proper timeouts

### 4. Test Audio Understanding
```bash
python test_voxtral_understanding.py
```
**Tests:**
- Content analysis ("What is the main topic?")
- Speaker identification
- Summarization capabilities
- Language detection
- Q&A with audio context

## 📁 File Structure

```
voxtral_test/
├── README.md                      # This file
├── download_model.py              # Manual model download script
├── setup_hf_auth.py              # Hugging Face authentication setup helper
├── test_setup.py                  # Dependency and setup verification
├── start_voxtral_server.py        # vLLM server startup script
├── test_voxtral_transcription.py  # Basic transcription testing
├── test_voxtral_understanding.py  # Advanced audio understanding tests
├── VOXTRAL_README.md             # Detailed technical documentation
└── models/                        # Local model storage (created by download_model.py)
    └── voxtral-mini-3b/           # Model files go here
        ├── consolidated.safetensors
        ├── params.json
        ├── tekken.json
        └── README.md
```

## 🎤 Test Audio Sample

**Using:** `../whisper.cpp/samples/jfk.wav`
- **Content**: JFK's "Ask not what your country can do for you..." speech
- **Duration**: 11 seconds
- **Language**: English
- **Quality**: Clear, ideal for testing

## 🧪 Test Results Summary

### ✅ Setup Verification (test_setup.py)
- vLLM 0.9.2: ✅ Available
- mistral_common 1.8.0: ✅ Available
- Audio loading: ✅ JFK sample loads (11.0s duration)
- Request creation: ✅ Both transcription and understanding requests work
- Timeout handling: ✅ Fixed - no more hanging on server checks

### 🔧 Technical Improvements Made

1. **Fixed timeout issues**: Server connection tests now timeout properly (5 seconds) instead of hanging
2. **Improved error handling**: Distinguishes between connection errors and API timeouts
3. **Socket pre-check**: Quick port availability check before API calls
4. **Clean environment**: Removed redundant virtual environment
5. **Path corrections**: Fixed audio file paths for proper directory structure

## 🌍 Multilingual Testing

**Supported Languages:**
- 🇺🇸 English (tested with JFK sample)
- 🇪🇸 Spanish
- 🇫🇷 French
- 🇵🇹 Portuguese
- 🇮🇳 Hindi
- 🇩🇪 German
- 🇳🇱 Dutch
- 🇮🇹 Italian

**To test other languages:** Add audio files to `../whisper.cpp/samples/` directory

## 📊 Expected Performance

**Based on your M4 Pro hardware:**
- **Model download**: ~6-7 GB (first time only)
- **Server startup**: 1-2 minutes initially
- **Transcription speed**: ~1-3 seconds for 11-second audio
- **Understanding speed**: ~3-5 seconds for analysis
- **Memory usage**: ~9.5 GB during inference (well within your 24 GB)

## 🔄 Comparison with Current Setup

| Feature | whisper.cpp | Voxtral-Mini-3B |
|---------|-------------|-----------------|
| **Transcription** | ✅ Excellent | ✅ Excellent |
| **Understanding** | ❌ No | ✅ Yes (Q&A, summarization) |
| **Languages** | 99+ | 8 (optimized) |
| **Memory** | ~1-2 GB | ~9.5 GB |
| **Speed** | Very fast | Fast |
| **Integration** | Direct binary | API server |

## 🚨 Troubleshooting

### Authentication Error (401 Unauthorized)
**Most common issue:** Missing Hugging Face token
```bash
# Check if token is set
echo $HF_TOKEN

# Set token if missing
export HF_TOKEN='your_token_here'

# Or login via CLI
huggingface-cli login
```

### Server Won't Start
```bash
# Check vLLM installation
python -c "import vllm; print('vLLM:', vllm.__version__)"

# Reinstall if needed (from parent directory)
cd .. && uv pip install -U "vllm[audio]" --prerelease=allow --index-strategy unsafe-best-match --extra-index-url https://wheels.vllm.ai/nightly
```

### Port 8000 Already in Use
- **Common cause**: VS Code or other development tools
- **Solution**: Kill the process or use a different port
- **Check what's using port**: `lsof -i :8000`

### Audio File Not Found
```bash
# Verify audio file exists
ls -la ../whisper.cpp/samples/jfk.wav

# Test audio loading
python -c "from mistral_common.audio import Audio; Audio.from_file('../whisper.cpp/samples/jfk.wav')"
```

### Timeout Issues
- ✅ **Fixed**: Tests now timeout properly after 5 seconds
- **Socket check**: Verifies port availability first
- **API timeout**: Prevents hanging on unresponsive servers

## 🎯 Next Steps

After successful testing, you could:

1. **Compare accuracy** with your current whisper.cpp setup
2. **Evaluate understanding features** for enhanced transcript processing
3. **Test real-time performance** for live transcription
4. **Integrate into Voice Mode app** as alternative transcription backend
5. **Explore function calling** capabilities for voice-driven workflows

## 📝 Development Notes

- **Environment**: Uses parent project's `.venv` (no local venv needed)
- **Dependencies**: All managed via `uv` in parent project
- **Testing**: Comprehensive setup verification before server testing
- **Error handling**: Robust timeout and connection error management
- **Documentation**: Both technical (VOXTRAL_README.md) and user-friendly (this file)

---

**Ready to test!** 🚀 Start with `python test_setup.py` to verify everything is working.
