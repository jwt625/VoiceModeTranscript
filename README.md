# ChatGPT Voice Mode Transcript Recorder

A real-time transcript recorder for ChatGPT voice conversations with dual audio capture, whisper.cpp streaming, and intelligent LLM deduplication. Built with a clean, modular architecture using service-oriented design.

## Features

- **Real-time transcription** using whisper.cpp streaming
- **Dual audio capture** - microphone and system audio simultaneously
- **Intelligent deduplication** using LLM processing to clean overlapping transcripts
- **Dual-panel interface** - compare raw vs processed transcripts
- **Database storage** with SQLite backend for persistent transcript storage
- **Session export** - download transcripts in JSON, TXT, or CSV formats
- **Session browser** - view and manage historical recording sessions
- **Dark mode interface** with real-time status indicators
- **Modular architecture** - clean separation of concerns with service layer

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
echo 'WHISPER_MODEL_PATH="./whisper.cpp/models/ggml-base.en.bin"' >> .env
echo 'WHISPER_EXECUTABLE="./whisper.cpp/main"' >> .env
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

### Architecture
- **Configuration**: Centralized in `src/config/settings.py` with environment variable support
- **Database**: Repository pattern in `src/models/` for clean data access
- **Business Logic**: Service layer in `src/services/` with focused responsibilities
- **Controllers**: Flask routes (to be refactored from `app.py`)

## Troubleshooting

### Export Issues
- **Export button disabled**: Make sure a session is selected in the Session Browser
- **Empty export file**: Check if the session has transcripts in the database
- **Download not starting**: Verify the Flask server is running and accessible

### Common Issues
- **Port 5001 in use**: Kill existing processes with `lsof -ti:5001 | xargs kill -9`
- **No sessions visible**: Check if any recording sessions have been completed
- **Database errors**: Ensure SQLite database file has proper permissions

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
