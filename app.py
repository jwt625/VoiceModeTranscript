#!/usr/bin/env python3
"""
ChatGPT Voice Mode Transcript Recorder
Main Flask Application
"""

from flask import Flask, render_template, request, jsonify, Response
import os
import json
import sqlite3
from datetime import datetime
import threading
import time
import queue

# Import our custom modules
from src.audio_capture import AudioCapture
from src.transcript_processor import TranscriptProcessor

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# SSE streaming queue
stream_queue = queue.Queue(maxsize=1000)  # Prevent memory issues

# Global state
recording_state = {
    'is_recording': False,
    'session_id': None,
    'start_time': None
}

audio_capture = None
transcript_processor = None

@app.route('/')
def index():
    """Main transcript display page"""
    return render_template('index.html')

@app.route('/stream')
def stream():
    """Server-Sent Events endpoint for real-time updates"""
    def event_stream():
        while True:
            try:
                # Get data from queue (blocks until available)
                data = stream_queue.get(timeout=1)
                yield f"data: {json.dumps(data)}\n\n"
            except queue.Empty:
                # Send heartbeat to keep connection alive
                yield "data: {\"type\": \"heartbeat\"}\n\n"
            except Exception as e:
                print(f"SSE stream error: {e}")
                break

    return Response(event_stream(),
                   mimetype='text/event-stream',
                   headers={
                       'Cache-Control': 'no-cache',
                       'Connection': 'keep-alive',
                       'Access-Control-Allow-Origin': '*'
                   })

@app.route('/api/status')
def get_status():
    """Get current recording status"""
    return jsonify({
        'is_recording': recording_state['is_recording'],
        'session_id': recording_state['session_id'],
        'start_time': recording_state['start_time']
    })

@app.route('/api/start', methods=['POST'])
def start_recording():
    """Start recording and transcription"""
    global audio_capture, transcript_processor, recording_state
    
    try:
        if recording_state['is_recording']:
            return jsonify({'error': 'Already recording'}), 400
        
        # Initialize components
        audio_capture = AudioCapture()
        transcript_processor = TranscriptProcessor()
        
        # Check audio devices
        input_devices, output_devices = audio_capture.list_devices()
        if not input_devices:
            return jsonify({
                'error': 'No microphone detected',
                'message': 'Please connect a microphone and check audio permissions'
            }), 400
        
        # Start recording
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        recording_state.update({
            'is_recording': True,
            'session_id': session_id,
            'start_time': datetime.now().isoformat()
        })
        
        # Send recording started message via SSE
        try:
            stream_queue.put({
                'type': 'transcript_update',
                'session_id': session_id,
                'timestamp': datetime.now().isoformat(),
                'source': 'system',
                'text': '🎯 Recording started! SSE connection working.',
                'confidence': 1.0,
                'is_final': True
            }, block=False)
        except queue.Full:
            print("⚠️ Stream queue full, dropping message")

        # Clear any previous transcript state for new session
        if hasattr(on_audio_chunk, 'last_transcript'):
            on_audio_chunk.last_transcript.clear()
            print("🧹 Cleared previous transcript state")

        # Reinitialize transcript processor to clear any internal state
        transcript_processor = TranscriptProcessor()
        print("🔄 Reinitialized transcript processor")

        # Start audio capture in background thread
        def audio_thread():
            audio_capture.start_recording(
                session_id=session_id,
                callback=on_audio_chunk
            )

        threading.Thread(target=audio_thread, daemon=True).start()
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Recording started'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stop', methods=['POST'])
def stop_recording():
    """Stop recording and transcription"""
    global audio_capture, recording_state
    
    try:
        if not recording_state['is_recording']:
            return jsonify({'error': 'Not currently recording'}), 400
        
        # Stop audio capture
        if audio_capture:
            audio_capture.stop_recording()
        
        # Update state
        recording_state.update({
            'is_recording': False,
            'session_id': None,
            'start_time': None
        })
        
        return jsonify({
            'success': True,
            'message': 'Recording stopped'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions')
def get_sessions():
    """Get list of recording sessions"""
    try:
        # TODO: Implement database query for sessions
        sessions = []
        return jsonify({'sessions': sessions})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transcript/<session_id>')
def get_transcript(session_id):
    """Get transcript for a specific session"""
    try:
        # TODO: Implement database query for transcript
        transcript = []
        return jsonify({'transcript': transcript})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def extract_new_content(last_text, current_text):
    """Extract new content from current transcription compared to last one"""
    return current_text
    # if not last_text:
    #     return current_text

    # if not current_text:
    #     return ""

    # # Clean up texts for comparison
    # last_clean = last_text.strip()
    # current_clean = current_text.strip()

    # # If texts are identical, definitely no new content
    # if current_clean.lower() == last_clean.lower():
    #     return ""

    # # If current text is shorter than last, likely no new content
    # if len(current_clean) < len(last_clean):
    #     return ""

    # # Split into words for better comparison
    # last_words = last_clean.lower().split()
    # current_words = current_clean.lower().split()

    # # If current has fewer or same words, likely no new content
    # if len(current_words) <= len(last_words):
    #     return ""

    # # Find the longest common subsequence of words
    # # This handles cases where whisper.cpp produces different but overlapping transcriptions

    # # Simple approach: check if last_text words appear in current_text
    # # and extract everything after the last matching word
    # last_words_str = ' '.join(last_words)
    # current_words_str = ' '.join(current_words)

    # # Check if last text is a substring of current text
    # if last_words_str in current_words_str:
    #     # Find where last text ends and extract the rest
    #     end_pos = current_words_str.find(last_words_str) + len(last_words_str)
    #     remaining = current_words_str[end_pos:].strip()
    #     if remaining:
    #         return remaining

    # # Alternative: check for word-level overlap at the end of last_text and beginning of current_text
    # max_overlap_words = min(len(last_words), len(current_words))
    # best_overlap = 0

    # # Look for overlapping words between end of last and start of current
    # for i in range(1, min(max_overlap_words + 1, 10)):  # Limit to 10 words for performance
    #     last_suffix = last_words[-i:]
    #     current_prefix = current_words[:i]

    #     if last_suffix == current_prefix:
    #         best_overlap = i

    # if best_overlap > 0:
    #     # Extract words after the overlap
    #     new_words = current_words[best_overlap:]
    #     if new_words:
    #         return ' '.join(new_words)

    # # If no overlap found but current is significantly longer, treat as new content
    # if len(current_words) > len(last_words) + 2:  # At least 3 more words
    #     return current_clean

    # return ""

def on_audio_chunk(audio_data, source='microphone', audio_level=None, is_transcription=False):
    """Callback for when new audio data is available"""
    global transcript_processor

    # Initialize transcript tracking for deduplication
    if not hasattr(on_audio_chunk, 'last_transcript'):
        on_audio_chunk.last_transcript = {}
    if not hasattr(on_audio_chunk, 'transcript_history'):
        on_audio_chunk.transcript_history = {}

    # Track recent transcriptions to avoid duplicates
    if not hasattr(on_audio_chunk, 'recent_transcripts'):
        on_audio_chunk.recent_transcripts = {}
    if not hasattr(on_audio_chunk, 'last_cleanup'):
        on_audio_chunk.last_cleanup = time.time()

    # Handle audio level updates
    if audio_level is not None:
        level_data = {
            'type': 'audio_level',
            'timestamp': datetime.now().isoformat()
        }
        if source == 'microphone':
            level_data['microphone_level'] = audio_level
        elif source == 'system':
            level_data['system_level'] = audio_level

        # Send audio level via SSE queue
        try:
            stream_queue.put(level_data, block=False)
            # print(f"🔊 Audio level queued: {level_data}")
        except queue.Full:
            # Skip if queue is full (audio levels are frequent)
            pass

    # Handle transcription processing
    if is_transcription and transcript_processor:
        try:
            # Process audio chunk with whisper.cpp
            transcript_result = transcript_processor.process_audio_chunk(
                audio_data
            )

            if transcript_result and transcript_result.get('text', '').strip():
                current_text = transcript_result['text'].strip()
                print(f"📝 Raw transcript ({source}): {current_text}")

                # Get the last transcript for this source
                last_text = on_audio_chunk.last_transcript.get(source, "")

                # Extract new content by finding what's new compared to the last transcript
                new_content = extract_new_content(last_text, current_text)

                if new_content:
                    print(f"✨ New content ({source}): {new_content}")

                    # Update the last transcript for this source
                    on_audio_chunk.last_transcript[source] = current_text

                    # Send both new content and full text via SSE queue
                    transcript_data = {
                        'type': 'transcript_update',
                        'session_id': recording_state['session_id'],
                        'timestamp': datetime.now().isoformat(),
                        'source': source,
                        'text': new_content,  # Deduplicated new content
                        'raw_text': current_text,  # Full raw transcript
                        'confidence': transcript_result.get('confidence', 0),
                        'is_final': transcript_result.get('is_final', False),
                        'is_deduplicated': True
                    }
                    try:
                        stream_queue.put(transcript_data, block=False)
                        print(f"📤 New transcript queued: {transcript_data}")
                    except queue.Full:
                        print("⚠️ Stream queue full, dropping transcript")
                else:
                    print(f"🔄 Duplicate content ignored ({source})")
        except Exception as e:
            print(f"Error processing transcript: {e}")

# SSE doesn't need connection handlers - connections are automatic

def init_database():
    """Initialize SQLite database"""
    conn = sqlite3.connect('transcripts.db')
    cursor = conn.cursor()
    
    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration INTEGER,
            total_segments INTEGER DEFAULT 0
        )
    ''')
    
    # Create transcripts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            source TEXT NOT NULL,
            text TEXT NOT NULL,
            confidence REAL,
            is_final BOOLEAN DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
    ''')
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    # Initialize database
    init_database()
    
    print("🎯 ChatGPT Voice Mode Transcript Recorder")
    print("=" * 50)
    print("Starting Flask server with SSE...")
    print("Open http://localhost:5001 in your browser")
    print("SSE stream available at http://localhost:5001/stream")
    print("=" * 50)

    # Run the app (regular Flask, no SocketIO)
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)
