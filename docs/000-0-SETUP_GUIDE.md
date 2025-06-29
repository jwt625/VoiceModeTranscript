# Detailed Setup Guide

## Audio Hardware Setup

### Required Hardware
1. **Microphone**: USB mic, headset, or AirPods
2. **Virtual Audio Device**: BlackHole for system audio capture

### macOS Audio Setup

#### Install BlackHole
```bash
brew install blackhole-2ch
```

#### Configure Multi-Output Device
1. Open **Audio MIDI Setup** (Applications → Utilities)
2. Click **+** → **Create Multi-Output Device**
3. Check both your **speakers/headphones** and **BlackHole 2ch**
4. Right-click the Multi-Output Device → **Use This Device For Sound Output**
5. Set this Multi-Output Device as your **system audio output** in System Preferences → Sound

#### Grant Microphone Permissions
- System Preferences → Security & Privacy → Privacy → Microphone
- ✅ Check "Terminal" or your Python app

### Device Selection in App
- **Microphone**: Select your physical microphone device
- **System Audio**: Select "BlackHole 2ch" to capture system audio output

## Configuration

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
- **Max Tokens**: 5000
- **Processing**: Async with queue management

## Testing & Debugging

### Test Audio Capture
```bash
cd src
uv run python audio_test.py
```

### Test Whisper Transcription
```bash
cd src
uv run python whisper_test.py
```

### Debug WebSocket Connection
1. Open browser console (F12 → Console)
2. Start recording and look for:
   - `📝 Transcript update received:` messages
   - `🔊 Audio level received:` messages
3. Check Flask console for:
   - `📤 Transcript emitted:` messages
   - `🔊 Audio level emitted:` messages

## Troubleshooting

### No Microphone Detected
- Connect a USB microphone or headset
- Check System Preferences → Sound → Input
- Grant microphone permissions to Terminal

### No Transcripts Appearing
- Check browser console for WebSocket errors
- Verify Flask console shows "📤 Transcript emitted" messages
- Ensure you're speaking clearly for 3+ seconds

### Audio Levels Not Moving
- Test microphone with `uv run python src/audio_test.py`
- Check audio permissions
- Try different microphone device

### System Audio Not Captured
- Verify BlackHole 2ch is installed
- Check Multi-Output Device is configured correctly
- Ensure system audio output is set to Multi-Output Device
- Select "BlackHole 2ch" in the app for system audio capture

### WebSocket Connection Issues
- Refresh the browser page
- Check Flask console for "Client connected" messages
- Disable browser ad blockers or extensions

## Development

### Making Changes
The Flask server runs in debug mode with auto-reload:
- **Python changes**: Server automatically restarts
- **Frontend changes**: Refresh browser to see updates
- **CSS/JS changes**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Adding Features
- **Backend**: Modify `app.py` or modules in `src/`
- **Frontend**: Update `templates/index.html` or `static/`
- **Database**: Schema defined in `app.py` `init_database()`

### Project Structure
```
Voice_Mode_transcript/
├── app.py                 # Main Flask application
├── pyproject.toml         # Python project configuration (uv)
├── transcripts.db        # SQLite database (auto-created)
├── src/                  # Core modules
│   ├── whisper_stream_processor.py # whisper.cpp streaming integration
│   ├── llm_processor.py         # LLM deduplication processor
│   ├── sdl_device_mapper.py     # SDL/PyAudio device mapping
│   └── audio_capture.py         # Audio recording logic
├── templates/            # HTML templates
├── static/               # Frontend assets (CSS/JS)
├── whisper.cpp/          # whisper.cpp repository
└── docs/                 # Documentation
```
