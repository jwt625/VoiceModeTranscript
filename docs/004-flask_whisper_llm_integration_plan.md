# Flask Frontend Integration Plan: Whisper.cpp + LLM Deduplication

## Overview

This plan outlines the integration of the proven `test_llm_deduplication.py` system into the existing Flask frontend, replacing the current inferior whisper.cpp HTTP server approach with the superior streaming whisper.cpp + LLM deduplication system.

## Current State Analysis

### ✅ What Works Well (Keep)
- **Flask SSE Architecture** - Real-time updates via Server-Sent Events
- **Database Integration** - SQLite storage with session management
- **Frontend UI** - Clean interface with controls and status indicators
- **Audio Capture** - PyAudio-based microphone and system audio capture

### ❌ What Needs Replacement (Upgrade)
- **Whisper.cpp HTTP Server** - Slower, less accurate than streaming approach
- **Single Transcript Display** - No raw vs processed comparison
- **No LLM Processing** - Missing intelligent deduplication and merging
- **No Manual Trigger** - Lacks user control over processing timing

## Target Architecture

### New Dual-Panel Interface
```
┌─────────────────────────────────────────────────────────────┐
│ Controls: [🎤 Start] [⏹️ Stop] [🤖 Process with LLM] [🗑️ Clear] │
├─────────────────────┬───────────────────────────────────────┤
│   RAW TRANSCRIPTS   │     PROCESSED TRANSCRIPTS             │
│                     │                                       │
│ [Toggle Show/Hide]  │ [Toggle Show/Hide]                    │
│                     │                                       │
│ • Transcript 1      │ ✨ LLM Processed Result:              │
│ • Transcript 2      │                                       │
│ • Transcript 3      │ Clean, deduplicated text from LLM... │
│ • [Accumulating...] │                                       │
│                     │ [Save to Database] [Export]           │
└─────────────────────┴───────────────────────────────────────┘
```

## Implementation Phases

## Phase 1: Backend Integration Foundation
**Duration: 2-3 hours**

### 1.1 Create Whisper.cpp Streaming Processor
- [ ] Create `src/whisper_stream_processor.py` based on `test_llm_deduplication.py`
- [ ] Adapt `LLMTranscriptProcessor` class for Flask integration
- [ ] Remove standalone functionality, keep core processing logic
- [ ] Add Flask-compatible callback system for real-time updates

### 1.2 Create LLM Integration Module
- [ ] Create `src/llm_processor.py` for Lambda Labs API integration
- [ ] Extract LLM processing logic from test file
- [ ] Add error handling and retry logic for production use
- [ ] Implement async processing to avoid blocking Flask

### 1.3 Database Schema Updates
- [ ] Add `raw_transcripts` table for storing individual whisper.cpp outputs
- [ ] Add `processed_transcripts` table for LLM-processed results
- [ ] Add `transcript_sessions` table linking raw and processed transcripts
- [ ] Update existing schema to support dual transcript types

### 1.4 Environment Configuration
- [ ] Add LLM API configuration to `.env` template
- [ ] Update requirements with `openai` and `python-dotenv` dependencies
- [ ] Add whisper.cpp streaming binary path configuration

## Phase 2: Flask Route Updates
**Duration: 1-2 hours**

### 2.1 New API Endpoints
- [ ] `POST /api/process-llm` - Trigger LLM processing of accumulated transcripts
- [ ] `GET /api/raw-transcripts/<session_id>` - Fetch raw transcripts for session
- [ ] `GET /api/processed-transcripts/<session_id>` - Fetch processed transcripts
- [ ] `POST /api/toggle-display` - Toggle raw/processed panel visibility

### 2.2 Modified Existing Endpoints
- [ ] Update `/api/start-recording` to initialize whisper.cpp streaming
- [ ] Modify `/stream` SSE to send both raw and processed transcript events
- [ ] Update `/api/stop-recording` to handle accumulated transcripts
- [ ] Enhance `/api/save-transcript` to save both raw and processed versions

### 2.3 SSE Event Types
```python
# New SSE event types
{
    "type": "raw_transcript",
    "data": {"text": "...", "timestamp": "...", "count": 5}
}
{
    "type": "llm_processing_start",
    "data": {"transcript_count": 5}
}
{
    "type": "llm_processing_complete",
    "data": {"processed_text": "...", "original_count": 5}
}
{
    "type": "transcript_saved",
    "data": {"session_id": "...", "type": "processed"}
}
```

## Phase 3: Frontend UI Overhaul
**Duration: 2-3 hours**

### 3.1 HTML Template Updates (`templates/index.html`)
- [ ] Replace single transcript container with dual-panel layout
- [ ] Add "Process with LLM" button with keyboard shortcut (Enter)
- [ ] Add toggle buttons for showing/hiding each panel
- [ ] Add transcript counter and processing status indicators
- [ ] Add save/export buttons for processed transcripts

### 3.2 CSS Styling Updates (`static/css/style.css`)
- [ ] Create responsive dual-panel layout (50/50 split)
- [ ] Style raw transcript list with accumulation indicators
- [ ] Style processed transcript display with LLM branding
- [ ] Add loading animations for LLM processing
- [ ] Add toggle button styles and panel visibility states

### 3.3 JavaScript Frontend Logic (`static/js/app.js`)
- [ ] Add `RawTranscriptManager` class for handling whisper.cpp output
- [ ] Add `LLMProcessingManager` class for triggering and displaying LLM results
- [ ] Implement keyboard listener for Enter key (LLM processing trigger)
- [ ] Add panel toggle functionality
- [ ] Update SSE handlers for new event types

## Phase 4: Core Processing Integration
**Duration: 3-4 hours**

### 4.1 Replace Audio Processing Pipeline
- [ ] Modify `src/audio_capture.py` to work with whisper.cpp streaming
- [ ] Update `app.py` to use `WhisperStreamProcessor` instead of `TranscriptProcessor`
- [ ] Implement subprocess management for whisper.cpp streaming binary
- [ ] Add proper cleanup and error handling for streaming processes

### 4.2 Real-time Transcript Flow
```python
# New processing flow
Audio Capture → Whisper.cpp Stream → Raw Transcript → SSE → Frontend
                                          ↓
                                   Accumulate in Buffer
                                          ↓
                              User Triggers LLM Processing
                                          ↓
                                 LLM API → Processed Result → Database → SSE → Frontend
```

### 4.3 Session Management Updates
- [ ] Track both raw and processed transcripts per session
- [ ] Implement transcript accumulation state management
- [ ] Add session cleanup for interrupted processing
- [ ] Handle concurrent sessions and processing queues

## Phase 5: Database Integration & Persistence
**Duration: 1-2 hours**

### 5.1 Database Operations
- [ ] Implement `save_raw_transcript()` function
- [ ] Implement `save_processed_transcript()` function
- [ ] Add `get_session_transcripts()` with type filtering
- [ ] Implement transcript export functionality (JSON, TXT formats)

### 5.2 Data Models
```python
# Raw transcript entry
{
    "id": "uuid",
    "session_id": "session_uuid",
    "text": "whisper.cpp output",
    "timestamp": "2024-01-01T12:00:00Z",
    "confidence": 0.85,
    "processing_time": 0.15
}

# Processed transcript entry
{
    "id": "uuid",
    "session_id": "session_uuid",
    "raw_transcript_ids": ["uuid1", "uuid2", "uuid3"],
    "processed_text": "LLM cleaned and merged text",
    "llm_model": "llama-4-maverick-17b-128e-instruct-fp8",
    "processing_time": 2.3,
    "timestamp": "2024-01-01T12:00:05Z"
}
```

## Phase 6: Testing & Polish
**Duration: 2-3 hours**

### 6.1 Integration Testing
- [ ] Test complete flow: Audio → Raw → LLM → Processed → Database
- [ ] Test error handling: LLM API failures, whisper.cpp crashes
- [ ] Test UI responsiveness during LLM processing
- [ ] Test session persistence and recovery

### 6.2 User Experience Polish
- [ ] Add progress indicators for LLM processing
- [ ] Implement auto-scroll for transcript panels
- [ ] Add keyboard shortcuts documentation
- [ ] Implement transcript search functionality
- [ ] Add export options (copy to clipboard, download file)

### 6.3 Performance Optimization
- [ ] Optimize SSE message frequency
- [ ] Implement transcript pagination for long sessions
- [ ] Add configurable LLM processing batch sizes
- [ ] Optimize database queries for large transcript volumes

## Configuration & Dependencies

### New Dependencies
```bash
# Add to requirements
openai>=1.0.0          # For Lambda Labs API
python-dotenv>=1.0.0   # For environment variables
```

### Environment Variables
```bash
# Add to .env
LLM_API_KEY=your_lambda_labs_api_key
LLM_BASE_URL=https://api.lambda.ai/v1
LLM_MODEL=llama-4-maverick-17b-128e-instruct-fp8
WHISPER_STREAM_BINARY=./whisper.cpp/build/bin/whisper-stream
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-base.en.bin
```

## Success Metrics

### Technical Metrics
- [ ] Raw transcripts display in real-time (< 1s delay)
- [ ] LLM processing completes within 5-10 seconds for 5-10 transcripts
- [ ] No transcript loss during LLM processing
- [ ] Database saves both raw and processed transcripts correctly
- [ ] UI remains responsive during all operations

### User Experience Metrics
- [ ] Users can easily toggle between raw and processed views
- [ ] Enter key reliably triggers LLM processing
- [ ] Clear visual feedback during processing states
- [ ] Processed transcripts show significant quality improvement over raw
- [ ] Export functionality works for both transcript types

## Risk Mitigation

### Technical Risks
- **Whisper.cpp streaming stability** → Implement process monitoring and auto-restart
- **LLM API rate limits** → Add request queuing and retry logic
- **Memory usage with long sessions** → Implement transcript pagination
- **Database performance** → Add indexing and query optimization

### User Experience Risks
- **Confusing dual-panel interface** → Add clear labeling and help text
- **Lost transcripts during processing** → Implement robust state management
- **Slow LLM processing** → Add progress indicators and cancel options

## Future Enhancements (Post-MVP)

- [ ] Multiple LLM provider support (OpenAI, Anthropic, local models)
- [ ] Real-time collaborative transcript editing
- [ ] Advanced transcript search and filtering
- [ ] Automated transcript summarization
- [ ] Integration with external note-taking apps
- [ ] Voice activity detection for auto-triggering LLM processing
