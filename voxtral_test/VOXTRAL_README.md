# Voxtral-Mini-3B-2507 Testing Environment

This directory contains test scripts for evaluating the **Voxtral-Mini-3B-2507** model - Mistral AI's new audio-text-to-text model with transcription and understanding capabilities.

## 🎯 What is Voxtral?

Voxtral-Mini-3B-2507 is a 3B parameter model that combines:
- **Dedicated transcription mode** with automatic language detection
- **Audio understanding** for Q&A and summarization
- **Multilingual support** (8 languages: EN, ES, FR, PT, HI, DE, NL, IT)
- **Long-form context** (32k tokens) - up to 30 min transcription, 40 min understanding
- **Built on Ministral 3B** with enhanced audio capabilities

## 🖥️ System Requirements

- **GPU Memory**: ~9.5 GB (✅ Your Mac mini M4 Pro with 24 GB unified memory is sufficient)
- **Python**: 3.9+
- **Dependencies**: vLLM with audio support, mistral_common[audio]

## 📦 Installation

Dependencies are already installed in this virtual environment:
- ✅ vLLM 0.9.2 with audio support
- ✅ mistral_common 1.8.0 with audio
- ✅ OpenAI client for API calls

## 🚀 Quick Start

### 1. Start the vLLM Server
```bash
python start_voxtral_server.py
```

This will:
- Download the Voxtral-Mini-3B-2507 model (first time only)
- Start the vLLM server on `http://localhost:8000`
- Show startup progress and status

### 2. Test Transcription
```bash
python test_voxtral_transcription.py
```

This will:
- Load the JFK audio sample
- Test basic transcription capabilities
- Show request structure and results

### 3. Test Audio Understanding
```bash
python test_voxtral_understanding.py
```

This will:
- Test content analysis and summarization
- Test language detection
- Test Q&A capabilities with audio

## 📁 Test Files

- **`start_voxtral_server.py`** - Server startup script with monitoring
- **`test_voxtral_transcription.py`** - Basic transcription testing
- **`test_voxtral_understanding.py`** - Advanced audio understanding tests
- **Audio Sample**: `../Voice_Mode_transcript/whisper.cpp/samples/jfk.wav`

## 🎤 Sample Audio

The tests use the JFK sample from whisper.cpp:
- **File**: `jfk.wav` (classic "Ask not what your country can do for you..." speech)
- **Duration**: ~11 seconds
- **Language**: English
- **Quality**: Clear, good for testing

## 🧪 Test Scenarios

### Transcription Tests
- ✅ Basic audio-to-text conversion
- ✅ Language detection (automatic)
- ✅ Temperature settings (0.0 for transcription)

### Understanding Tests
- ✅ Content analysis ("What is the main topic?")
- ✅ Speaker identification
- ✅ Summarization
- ✅ Language detection
- ✅ Q&A with audio context

## 🌍 Multilingual Support

Voxtral supports 8 languages:
- 🇺🇸 English
- 🇪🇸 Spanish
- 🇫🇷 French
- 🇵🇹 Portuguese
- 🇮🇳 Hindi
- 🇩🇪 German
- 🇳🇱 Dutch
- 🇮🇹 Italian

To test other languages, add audio files to the samples directory.

## 🔧 Configuration

### Server Settings
- **Model**: `mistralai/Voxtral-Mini-3B-2507`
- **Tokenizer**: Mistral mode
- **Config**: Mistral format
- **Port**: 8000 (default)

### Inference Settings
- **Transcription**: `temperature=0.0` (deterministic)
- **Understanding**: `temperature=0.2, top_p=0.95` (slightly creative)

## 🚨 Troubleshooting

### Server Won't Start
```bash
# Check if vLLM is installed
python -c "import vllm; print('vLLM installed')"

# Reinstall if needed
uv pip install -U "vllm[audio]" --prerelease=allow --index-strategy unsafe-best-match --extra-index-url https://wheels.vllm.ai/nightly
```

### Memory Issues
- Voxtral-Mini needs ~9.5 GB GPU memory
- Your M4 Pro has 24 GB unified memory (plenty!)
- Close other GPU-intensive apps if needed

### Audio File Issues
```bash
# Check if audio file exists
ls -la ../Voice_Mode_transcript/whisper.cpp/samples/jfk.wav

# Test audio loading
python -c "from mistral_common.audio import Audio; Audio.from_file('../Voice_Mode_transcript/whisper.cpp/samples/jfk.wav')"
```

## 📊 Expected Performance

Based on your M4 Pro hardware:
- **Model Loading**: 1-2 minutes (first time)
- **Transcription**: ~1-3 seconds for 11-second audio
- **Understanding**: ~3-5 seconds for analysis
- **Memory Usage**: ~9.5 GB during inference

## 🔄 Comparison with whisper.cpp

| Feature | whisper.cpp | Voxtral-Mini-3B |
|---------|-------------|-----------------|
| Transcription | ✅ Excellent | ✅ Excellent |
| Understanding | ❌ No | ✅ Yes |
| Summarization | ❌ No | ✅ Yes |
| Q&A | ❌ No | ✅ Yes |
| Languages | 99+ | 8 (optimized) |
| Memory | ~1-2 GB | ~9.5 GB |
| Speed | Very fast | Fast |

## 🎯 Next Steps

After testing, you could:
1. **Compare accuracy** with your current whisper.cpp setup
2. **Test real-time streaming** (if supported)
3. **Integrate into your Voice Mode app** as an alternative transcription backend
4. **Evaluate understanding features** for enhanced transcript processing

## 📝 Notes

- First run will download the model (~6-7 GB)
- Server startup takes 1-2 minutes initially
- Model supports up to 30-minute audio files
- Understanding mode can handle 40-minute audio
- Function calling is experimental (not in Mini version)

Ready to test! 🚀
