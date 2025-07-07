# ChatGPT Voice Mode Transcript Recorder

A real-time transcript recorder for ChatGPT voice conversations with dual audio capture, whisper.cpp streaming, and intelligent LLM deduplication. Built with a **fully modular frontend architecture** and clean service-oriented backend design.

## Features

### Core Functionality
- **Real-time transcription** using whisper.cpp streaming
- **Dual audio capture** - microphone and system audio simultaneously
- **Intelligent deduplication** using LLM processing to clean overlapping transcripts
- **Dual-panel interface** - compare raw vs processed transcripts
- **Database storage** with SQLite backend for persistent transcript storage
- **Session export** - download transcripts in JSON, TXT, or CSV formats
- **Session browser** - view and manage historical recording sessions
- **Dark mode interface** with real-time status indicators

### Architecture
- **Modular Frontend** - 8 focused JavaScript modules with event-driven communication
- **Service-Oriented Backend** - Clean separation of concerns with dedicated service layer
- **Event Bus System** - Loose coupling between frontend modules
- **State Management** - Centralized state store with reactive updates
- **Error Handling** - Comprehensive error handling and recovery mechanisms

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

### 2. Setup Virtual Environment and Install Dependencies

Create virtual environment:
```bash
uv venv
```

Install dependencies:
```bash
uv sync
```

Activate virtual environment (optional, uv handles this automatically):
```bash
source .venv/bin/activate
```

### 3. Build whisper.cpp with SDL2 Support

Prerequisites:
- macOS with Xcode command line tools
- Homebrew
- SDL2 (required for streaming functionality)

```bash
# Install SDL2 for streaming support
brew install sdl2 cmake

# Clone and build whisper.cpp with SDL2 support
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build with SDL2 support (required for whisper-stream)
rm -rf build
mkdir build
cd build
cmake .. -DWHISPER_SDL2=ON
make -j8

# Download a model
cd ..
./models/download-ggml-model.sh base.en

# Test installation (non-streaming)
./build/bin/whisper-cli -f samples/jfk.wav -m models/ggml-base.en.bin

# Test streaming functionality (required for the app)
./build/bin/whisper-stream -m models/ggml-base.en.bin -t 6 --step 0 --length 30000 -vth 0.6

cd ..
```

**Important:** The app requires `whisper-stream` binary which is only built when SDL2 support is enabled. If you see "whisper-stream not found" errors, make sure you built with `-DWHISPER_SDL2=ON`.

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
echo 'WHISPER_MODEL_PATH="./whisper.cpp/models/ggml-base.en.bin"' >> .env
echo 'WHISPER_STREAM_BINARY="./whisper.cpp/build/bin/whisper-stream"' >> .env
```

## Running the App

```bash
uv run python app.py
```

The server will automatically find an available port starting from 5001. Check the console output for the actual URL, typically: **http://localhost:5001** (or 5002, 5003, etc. if 5001 is in use)

## Usage

### Recording Workflow
1. Open the URL shown in the console (e.g., http://localhost:5001) in your browser
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
- **Database Inspector**: Browse historical sessions and export transcripts
- **Export Options**: Download transcripts in multiple formats (JSON, TXT, CSV)

### Session Management & Export

#### Database Inspector
1. Click **🗄️ Database Inspector** button
2. Browse tabs: **Raw Transcripts**, **Processed Transcripts**, **Recent Sessions**, **Session Browser**
3. View database statistics and recent activity

#### Session Export
1. Go to **Session Browser** tab in Database Inspector
2. Select a session from the list
3. Click **📤 Export Selected Session**
4. Choose export options:
   - **Format**: JSON (structured), TXT (readable), CSV (tabular)
   - **Content**: Raw only, Processed only, or Both
5. Click **⬇️ Download** to save the file

#### Export Formats
- **JSON**: Complete structured data with metadata, timestamps, and all transcript details
- **TXT**: Human-readable format with timestamps and source information
- **CSV**: Spreadsheet-compatible format for data analysis

#### API Endpoint
```bash
GET /api/sessions/<session_id>/export?format=<json|txt|csv>&content=<raw|processed|both>
```

**Example:**
```bash
curl "http://localhost:5001/api/sessions/session_20250704_233045/export?format=json&content=both" -o export.json
```

## Project Structure

### Backend Structure
```
src/
├── config/          # Configuration management
│   ├── __init__.py
│   └── settings.py  # AppConfig with environment variables
├── models/          # Database models and repositories
│   ├── __init__.py
│   ├── database.py  # Database connection and initialization
│   ├── repositories.py  # Repository pattern for data access
│   ├── session.py   # Session model
│   └── transcript.py    # Transcript models
├── services/        # Business logic layer
│   ├── __init__.py
│   ├── app_service.py      # Main coordinator service
│   ├── audio_service.py    # Audio capture and monitoring
│   ├── device_service.py   # Audio device management
│   ├── llm_service.py      # LLM processing coordination
│   ├── session_service.py  # Session management
│   └── transcript_service.py  # Transcript processing
├── audio_capture.py        # Audio capture utilities
├── llm_processor.py        # LLM processing engine
├── sdl_device_mapper.py    # SDL/PyAudio device mapping
└── whisper_stream_processor.py  # Whisper.cpp integration
```

### Frontend Structure
```
static/
├── css/
│   └── style.css           # Application styles and dark mode theme
└── js/
    ├── app-modular.js      # Main application orchestrator
    ├── app-monolithic-backup.js  # Legacy monolithic version (backup)
    ├── core/               # Core framework modules
    │   ├── event-bus.js    # Event communication system
    │   ├── state-store.js  # Centralized state management
    │   └── module-base.js  # Base class for all modules
    ├── config/
    │   └── module-config.js # Module configuration and dependencies
    └── modules/            # Feature modules
        ├── recording.js    # Recording control and state management
        ├── transcript.js   # Transcript display and management
        ├── llm.js         # LLM processing coordination
        ├── database.js    # Database operations and session browser
        ├── ui.js          # User interface controls and notifications
        ├── device.js      # Audio device management
        ├── sse.js         # Server-Sent Events handling
        └── utils.js       # Shared utilities and helpers

templates/
└── index.html              # Main application template
```

## Database Structure

The app uses SQLite with three main tables:

### Tables
- **`sessions`** - Session metadata with quality metrics
- **`raw_transcripts`** - Direct whisper.cpp output with timestamps and confidence scores
- **`processed_transcripts`** - LLM-cleaned transcripts with original transcript references

### Key Fields
- **Raw transcripts**: `id`, `session_id`, `text`, `timestamp`, `sequence_number`, `confidence`, `audio_source`
- **Processed transcripts**: `id`, `session_id`, `processed_text`, `original_transcript_ids`, `llm_model`, `processing_time`

## API Endpoints

### Session Management
- `GET /api/sessions` - List all recording sessions
- `GET /api/sessions/<session_id>/export` - Export session transcripts
- `POST /api/sessions/<session_id>/calculate-metrics` - Calculate session quality metrics

### Transcript Access
- `GET /api/raw-transcripts/<session_id>` - Get raw transcripts for session (paginated)
- `GET /api/processed-transcripts/<session_id>` - Get processed transcripts for session (paginated)

### Database Inspector
- `GET /api/database/stats` - Database statistics and recent sessions
- `GET /api/database/raw-transcripts` - All raw transcripts (paginated)
- `GET /api/database/processed-transcripts` - All processed transcripts (paginated)

### Recording Control
- `POST /api/start` - Start recording session
- `POST /api/stop` - Stop recording session
- `POST /api/process-llm` - Trigger LLM processing
- `GET /api/status` - Get current recording status

## Frontend Architecture

The application features a **fully modular frontend** that replaced a 3,397-line monolithic JavaScript file with 8 focused modules:

### Module Structure
```
static/js/
├── app-modular.js         # Main application orchestrator
├── core/
│   ├── event-bus.js       # Event communication system
│   ├── state-store.js     # Centralized state management
│   └── module-base.js     # Base class for all modules
├── config/
│   └── module-config.js   # Module configuration and dependencies
└── modules/
    ├── recording.js       # Recording control and state management
    ├── transcript.js      # Transcript display and management
    ├── llm.js            # LLM processing coordination
    ├── database.js       # Database operations and session browser
    ├── ui.js             # User interface controls and notifications
    ├── device.js         # Audio device management
    ├── sse.js            # Server-Sent Events handling
    └── utils.js          # Shared utilities and helpers
```

### Key Benefits
- **Maintainability**: Each module has a single, focused responsibility
- **Testability**: Modules can be tested in isolation
- **Scalability**: Easy to add new features without affecting existing code
- **Debugging**: Issues can be isolated to specific modules
- **Reusability**: Modules can be reused in other contexts

### Event-Driven Communication
- **EventBus**: Centralized event system for loose coupling between modules
- **State Store**: Reactive state management with subscription-based updates
- **Module Lifecycle**: Proper initialization, cleanup, and error handling

For detailed implementation information, see `docs/014-frontend_modularization_plan.md`.

## Development

### Code Quality
The project uses modern Python tooling for code quality:
- **ruff** - Fast linting and formatting
- **mypy** - Type checking (enabled in production)
- **pre-commit** - Automated quality checks

```bash
# Install development dependencies
uv sync --dev

# Install pre-commit hooks
uv run pre-commit install

# Run linting and formatting
uv run ruff check src/ app.py
uv run ruff format src/ app.py
```

### Backend Architecture
- **Configuration**: Centralized in `src/config/settings.py` with environment variable support
- **Database**: Repository pattern in `src/models/` for clean data access
- **Business Logic**: Service layer in `src/services/` with focused responsibilities
- **Controllers**: Flask routes (to be refactored from `app.py`)
- **Audio Processing**: whisper.cpp integration with streaming support
- **Real-time Communication**: Server-Sent Events (SSE) for live updates

## Troubleshooting

### Export Issues
- **Export button disabled**: Make sure a session is selected in the Session Browser
- **Empty export file**: Check if the session has transcripts in the database
- **Download not starting**: Verify the Flask server is running and accessible

### Common Issues
- **Port 5001 in use**: Kill existing processes with `lsof -ti:5001 | xargs kill -9`
- **No sessions visible**: Check if any recording sessions have been completed
- **Database errors**: Ensure SQLite database file has proper permissions
- **Duplicate transcripts**: Fixed in July 2025 - ensure you're using the latest modular frontend
- **Recording not stopping**: Fixed in July 2025 - backend now properly responds to stop commands

### File Locations
- **Database**: `transcripts.db` in project root
- **Exports**: Downloaded to browser's default download folder
- **Logs**: Console output in terminal running the Flask app

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
