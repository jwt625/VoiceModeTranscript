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
from src.whisper_stream_processor import WhisperStreamProcessor
from src.llm_processor import LLMProcessor

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
whisper_processor = None
llm_processor = None


def on_whisper_transcript(event_data):
    """Callback for whisper streaming processor events"""
    try:
        if event_data['type'] == 'raw_transcript':
            # Save raw transcript to database
            transcript_data = event_data['data']
            save_raw_transcript(transcript_data)

            # Send via SSE
            stream_queue.put({
                'type': 'raw_transcript',
                'data': transcript_data,
                'accumulated_count': event_data['accumulated_count']
            }, block=False)

        elif event_data['type'] == 'error':
            # Send error via SSE
            stream_queue.put({
                'type': 'whisper_error',
                'message': event_data['message'],
                'session_id': event_data['session_id']
            }, block=False)

    except queue.Full:
        print("⚠️ Stream queue full, dropping whisper event")
    except Exception as e:
        print(f"❌ Error in whisper callback: {e}")


def on_llm_result(event_data):
    """Callback for LLM processor events"""
    try:
        if event_data['type'] == 'llm_processing_start':
            # Send processing start via SSE
            stream_queue.put({
                'type': 'llm_processing_start',
                'job_id': event_data['job_id'],
                'session_id': event_data['session_id'],
                'transcript_count': event_data['transcript_count']
            }, block=False)

        elif event_data['type'] == 'llm_processing_complete':
            # Save processed transcript to database
            result = event_data['result']
            if result.get('status') == 'success':
                save_processed_transcript(result)

            # Send completion via SSE
            stream_queue.put({
                'type': 'llm_processing_complete',
                'job_id': event_data['job_id'],
                'result': result
            }, block=False)

        elif event_data['type'] == 'llm_processing_error':
            # Send error via SSE
            stream_queue.put({
                'type': 'llm_processing_error',
                'job_id': event_data['job_id'],
                'error': event_data['error']
            }, block=False)

    except queue.Full:
        print("⚠️ Stream queue full, dropping LLM event")
    except Exception as e:
        print(f"❌ Error in LLM callback: {e}")


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
    """Start recording and transcription with whisper.cpp streaming"""
    global whisper_processor, llm_processor, recording_state

    try:
        if recording_state['is_recording']:
            return jsonify({'error': 'Already recording'}), 400

        # Initialize processors
        whisper_processor = WhisperStreamProcessor(callback=on_whisper_transcript)
        llm_processor = LLMProcessor(callback=on_llm_result)

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
                'type': 'recording_started',
                'session_id': session_id,
                'timestamp': datetime.now().isoformat(),
                'message': '🎯 Whisper.cpp streaming started! Ready for transcription.',
                'processor_type': 'whisper_stream'
            }, block=False)
        except queue.Full:
            print("⚠️ Stream queue full, dropping message")

        # Start whisper.cpp streaming
        success = whisper_processor.start_streaming(session_id)

        if not success:
            recording_state['is_recording'] = False
            return jsonify({
                'error': 'Failed to start whisper.cpp streaming',
                'message': 'Check that whisper.cpp binary and model are available'
            }), 500

        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Whisper.cpp streaming started',
            'processor_type': 'whisper_stream'
        })

    except Exception as e:
        recording_state['is_recording'] = False
        return jsonify({'error': str(e)}), 500

@app.route('/api/stop', methods=['POST'])
def stop_recording():
    """Stop whisper.cpp streaming and transcription"""
    global whisper_processor, recording_state

    try:
        if not recording_state['is_recording']:
            return jsonify({'error': 'Not currently recording'}), 400

        session_id = recording_state['session_id']

        # Stop whisper streaming
        stats = {}
        if whisper_processor:
            stats = whisper_processor.stop_streaming()

        # Update state
        recording_state.update({
            'is_recording': False,
            'session_id': None,
            'start_time': None
        })

        # Send recording stopped message via SSE
        try:
            stream_queue.put({
                'type': 'recording_stopped',
                'session_id': session_id,
                'timestamp': datetime.now().isoformat(),
                'message': '🛑 Whisper.cpp streaming stopped.',
                'stats': stats
            }, block=False)
        except queue.Full:
            print("⚠️ Stream queue full, dropping message")

        return jsonify({
            'success': True,
            'message': 'Whisper.cpp streaming stopped',
            'session_id': session_id,
            'stats': stats
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
    """Get transcript for a specific session (legacy endpoint)"""
    try:
        # TODO: Implement database query for transcript
        transcript = []
        return jsonify({'transcript': transcript})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/process-llm', methods=['POST'])
def process_llm():
    """Trigger LLM processing of accumulated transcripts"""
    global whisper_processor, llm_processor

    try:
        data = request.get_json()
        session_id = data.get('session_id')

        if not session_id:
            return jsonify({'error': 'session_id required'}), 400

        if not whisper_processor:
            return jsonify({'error': 'Whisper processor not initialized'}), 400

        # Get accumulated transcripts
        accumulated_transcripts = whisper_processor.get_accumulated_transcripts()

        if not accumulated_transcripts:
            return jsonify({'error': 'No transcripts to process'}), 400

        # Process with LLM asynchronously
        job_id = llm_processor.process_transcripts_async(accumulated_transcripts, session_id)

        # Clear accumulated transcripts after sending to LLM
        whisper_processor.clear_accumulated_transcripts()

        return jsonify({
            'success': True,
            'job_id': job_id,
            'transcript_count': len(accumulated_transcripts),
            'message': 'LLM processing started'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/raw-transcripts/<session_id>')
def get_raw_transcripts(session_id):
    """Get raw transcripts for a specific session"""
    try:
        transcripts = get_session_transcripts(session_id, 'raw')
        return jsonify({
            'session_id': session_id,
            'transcripts': transcripts.get('raw', []),
            'count': len(transcripts.get('raw', []))
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/processed-transcripts/<session_id>')
def get_processed_transcripts(session_id):
    """Get processed transcripts for a specific session"""
    try:
        transcripts = get_session_transcripts(session_id, 'processed')
        return jsonify({
            'session_id': session_id,
            'transcripts': transcripts.get('processed', []),
            'count': len(transcripts.get('processed', []))
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/toggle-display', methods=['POST'])
def toggle_display():
    """Toggle display settings for transcript panels"""
    try:
        data = request.get_json()
        panel_type = data.get('panel_type')  # 'raw' or 'processed'
        visible = data.get('visible', True)

        if panel_type not in ['raw', 'processed']:
            return jsonify({'error': 'Invalid panel_type. Must be "raw" or "processed"'}), 400

        # Store display preferences (could be in session or database)
        # For now, just return success - frontend will handle the toggle

        return jsonify({
            'success': True,
            'panel_type': panel_type,
            'visible': visible,
            'message': f'{panel_type.title()} panel {"shown" if visible else "hidden"}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/database/stats')
def get_database_stats():
    """Get database statistics for inspection"""
    try:
        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        # Get counts from all tables
        cursor.execute('SELECT COUNT(*) FROM raw_transcripts')
        raw_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM processed_transcripts')
        processed_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM sessions')
        sessions_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM transcripts')
        legacy_count = cursor.fetchone()[0]

        # Get recent sessions
        cursor.execute('''
            SELECT DISTINCT session_id, COUNT(*) as transcript_count,
                   MIN(timestamp) as first_transcript, MAX(timestamp) as last_transcript
            FROM raw_transcripts
            GROUP BY session_id
            ORDER BY last_transcript DESC
            LIMIT 10
        ''')
        recent_sessions = []
        for row in cursor.fetchall():
            recent_sessions.append({
                'session_id': row[0],
                'transcript_count': row[1],
                'first_transcript': row[2],
                'last_transcript': row[3]
            })

        conn.close()

        return jsonify({
            'success': True,
            'stats': {
                'raw_transcripts': raw_count,
                'processed_transcripts': processed_count,
                'sessions': sessions_count,
                'legacy_transcripts': legacy_count
            },
            'recent_sessions': recent_sessions
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/database/raw-transcripts')
def get_all_raw_transcripts():
    """Get all raw transcripts with pagination"""
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        offset = (page - 1) * limit

        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        # Get total count
        cursor.execute('SELECT COUNT(*) FROM raw_transcripts')
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute('''
            SELECT id, session_id, text, timestamp, sequence_number, confidence, processing_time
            FROM raw_transcripts
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append({
                'id': row[0],
                'session_id': row[1],
                'text': row[2],
                'timestamp': row[3],
                'sequence_number': row[4],
                'confidence': row[5],
                'processing_time': row[6]
            })

        conn.close()

        return jsonify({
            'success': True,
            'transcripts': transcripts,
            'pagination': {
                'page': page,
                'limit': limit,
                'total_count': total_count,
                'total_pages': (total_count + limit - 1) // limit
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/database/processed-transcripts')
def get_all_processed_transcripts():
    """Get all processed transcripts with pagination"""
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        offset = (page - 1) * limit

        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        # Get total count
        cursor.execute('SELECT COUNT(*) FROM processed_transcripts')
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute('''
            SELECT id, session_id, processed_text, original_transcript_ids,
                   original_transcript_count, llm_model, processing_time, timestamp
            FROM processed_transcripts
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append({
                'id': row[0],
                'session_id': row[1],
                'processed_text': row[2],
                'original_transcript_ids': json.loads(row[3]),
                'original_transcript_count': row[4],
                'llm_model': row[5],
                'processing_time': row[6],
                'timestamp': row[7]
            })

        conn.close()

        return jsonify({
            'success': True,
            'transcripts': transcripts,
            'pagination': {
                'page': page,
                'limit': limit,
                'total_count': total_count,
                'total_pages': (total_count + limit - 1) // limit
            }
        })

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
    """Initialize SQLite database with dual transcript support"""
    conn = sqlite3.connect('transcripts.db')
    cursor = conn.cursor()

    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration INTEGER,
            total_segments INTEGER DEFAULT 0,
            raw_transcript_count INTEGER DEFAULT 0,
            processed_transcript_count INTEGER DEFAULT 0
        )
    ''')

    # Create raw_transcripts table for whisper.cpp output
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS raw_transcripts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            confidence REAL,
            processing_time REAL,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
    ''')

    # Create processed_transcripts table for LLM output
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS processed_transcripts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            processed_text TEXT NOT NULL,
            original_transcript_ids TEXT NOT NULL,
            original_transcript_count INTEGER NOT NULL,
            llm_model TEXT NOT NULL,
            processing_time REAL NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
    ''')

    # Create legacy transcripts table (keep for backward compatibility)
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

    # Create indexes for better performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_raw_transcripts_session ON raw_transcripts(session_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_processed_transcripts_session ON processed_transcripts(session_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_raw_transcripts_timestamp ON raw_transcripts(timestamp)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_processed_transcripts_timestamp ON processed_transcripts(timestamp)')

    conn.commit()
    conn.close()


def save_raw_transcript(transcript_data):
    """Save raw transcript from whisper.cpp to database"""
    try:
        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO raw_transcripts
            (id, session_id, text, timestamp, sequence_number, confidence, processing_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            transcript_data['id'],
            transcript_data['session_id'],
            transcript_data['text'],
            transcript_data['timestamp'],
            transcript_data['sequence_number'],
            transcript_data.get('confidence'),
            transcript_data.get('processing_time')
        ))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error saving raw transcript: {e}")
        return False


def save_processed_transcript(processed_data):
    """Save LLM-processed transcript to database"""
    try:
        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        # Convert transcript IDs list to JSON string
        transcript_ids_json = json.dumps(processed_data['original_transcript_ids'])

        cursor.execute('''
            INSERT INTO processed_transcripts
            (id, session_id, processed_text, original_transcript_ids,
             original_transcript_count, llm_model, processing_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            processed_data['id'],
            processed_data['session_id'],
            processed_data['processed_text'],
            transcript_ids_json,
            processed_data['original_transcript_count'],
            processed_data['llm_model'],
            processed_data['processing_time'],
            processed_data['timestamp']
        ))

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error saving processed transcript: {e}")
        return False


def get_session_transcripts(session_id, transcript_type='both'):
    """Get transcripts for a session"""
    try:
        conn = sqlite3.connect('transcripts.db')
        cursor = conn.cursor()

        result = {}

        if transcript_type in ['raw', 'both']:
            cursor.execute('''
                SELECT id, text, timestamp, sequence_number, confidence, processing_time
                FROM raw_transcripts
                WHERE session_id = ?
                ORDER BY sequence_number
            ''', (session_id,))

            raw_transcripts = []
            for row in cursor.fetchall():
                raw_transcripts.append({
                    'id': row[0],
                    'text': row[1],
                    'timestamp': row[2],
                    'sequence_number': row[3],
                    'confidence': row[4],
                    'processing_time': row[5]
                })
            result['raw'] = raw_transcripts

        if transcript_type in ['processed', 'both']:
            cursor.execute('''
                SELECT id, processed_text, original_transcript_ids,
                       original_transcript_count, llm_model, processing_time, timestamp
                FROM processed_transcripts
                WHERE session_id = ?
                ORDER BY timestamp
            ''', (session_id,))

            processed_transcripts = []
            for row in cursor.fetchall():
                processed_transcripts.append({
                    'id': row[0],
                    'processed_text': row[1],
                    'original_transcript_ids': json.loads(row[2]),
                    'original_transcript_count': row[3],
                    'llm_model': row[4],
                    'processing_time': row[5],
                    'timestamp': row[6]
                })
            result['processed'] = processed_transcripts

        conn.close()
        return result

    except Exception as e:
        print(f"Error getting session transcripts: {e}")
        return {}


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
