#!/usr/bin/env python3
"""
ChatGPT Voice Mode Transcript Recorder
Main Flask Application
"""

import csv
import io
import json
import queue
import socket
import sqlite3
import threading
import time
from datetime import datetime
from typing import Any

from flask import Flask, Response, jsonify, render_template, request

# Import our custom modules
from src.audio_capture import AudioCapture
from src.llm_processor import LLMProcessor
from src.whisper_stream_processor import WhisperStreamProcessor

app = Flask(__name__)
app.config["SECRET_KEY"] = "your-secret-key-here"

# SSE streaming queue
stream_queue: queue.Queue[dict[str, Any]] = queue.Queue(
    maxsize=1000
)  # Prevent memory issues

# Global state
recording_state = {"is_recording": False, "session_id": None, "start_time": None}

# Auto-processing state
auto_processing_state = {
    "enabled": True,
    "interval_minutes": 2,
    "timer": None,
    "last_processing_time": None,
}

audio_capture = None
transcript_processor = None
mic_whisper_processor = None
system_whisper_processor = None
llm_processor = None

# Track sessions waiting for summary generation after stop recording
sessions_waiting_for_summary = set()


def on_whisper_transcript(event_data):
    """Callback for whisper streaming processor events"""
    try:
        if event_data["type"] == "raw_transcript":
            # Save raw transcript to database
            transcript_data = event_data["data"]
            save_raw_transcript(transcript_data)

            # Send via SSE
            stream_queue.put(
                {
                    "type": "raw_transcript",
                    "data": transcript_data,
                    "accumulated_count": event_data["accumulated_count"],
                },
                block=False,
            )

        elif event_data["type"] == "error":
            # Send error via SSE
            stream_queue.put(
                {
                    "type": "whisper_error",
                    "message": event_data["message"],
                    "session_id": event_data["session_id"],
                },
                block=False,
            )

    except queue.Full:
        print("⚠️ Stream queue full, dropping whisper event")
    except Exception as e:
        print(f"❌ Error in whisper callback: {e}")


def on_llm_result(event_data):
    """Callback for LLM processor events"""
    try:
        if event_data["type"] == "llm_processing_start":
            # Send processing start via SSE
            stream_queue.put(
                {
                    "type": "llm_processing_start",
                    "job_id": event_data["job_id"],
                    "session_id": event_data["session_id"],
                    "transcript_count": event_data["transcript_count"],
                },
                block=False,
            )

        elif event_data["type"] == "llm_processing_complete":
            # Save processed transcript to database
            result = event_data["result"]
            if result.get("status") == "success":
                save_processed_transcript(result)

            # Send completion via SSE
            stream_queue.put(
                {
                    "type": "llm_processing_complete",
                    "job_id": event_data["job_id"],
                    "result": result,
                },
                block=False,
            )

            # Check if this session is waiting for summary generation
            session_id = event_data.get("session_id")
            if session_id and session_id in sessions_waiting_for_summary:
                print(
                    f"📝 LLM processing complete for session {session_id}, checking if ready for summary..."
                )
                check_and_generate_summary_if_ready(session_id)

        elif event_data["type"] == "llm_processing_error":
            # Send error via SSE
            stream_queue.put(
                {
                    "type": "llm_processing_error",
                    "job_id": event_data["job_id"],
                    "error": event_data["error"],
                },
                block=False,
            )

    except queue.Full:
        print("⚠️ Stream queue full, dropping LLM event")
    except Exception as e:
        print(f"❌ Error in LLM callback: {e}")


def start_auto_processing_timer():
    """Start the auto-processing timer if enabled"""
    global auto_processing_state

    if not auto_processing_state["enabled"] or not recording_state["is_recording"]:
        return

    # Cancel existing timer if any
    stop_auto_processing_timer()

    interval_seconds = auto_processing_state["interval_minutes"] * 60
    auto_processing_state["timer"] = threading.Timer(
        interval_seconds, auto_process_transcripts
    )
    auto_processing_state["timer"].daemon = True
    auto_processing_state["timer"].start()

    print(
        f"🤖 Auto-processing timer started: {auto_processing_state['interval_minutes']} minutes"
    )


def stop_auto_processing_timer():
    """Stop the auto-processing timer"""
    global auto_processing_state

    if auto_processing_state["timer"]:
        auto_processing_state["timer"].cancel()
        auto_processing_state["timer"] = None
        print("🤖 Auto-processing timer stopped")


def auto_process_transcripts():
    """Automatically process accumulated transcripts"""
    global \
        mic_whisper_processor, \
        system_whisper_processor, \
        llm_processor, \
        auto_processing_state

    try:
        if not recording_state["is_recording"] or not auto_processing_state["enabled"]:
            return

        # Check if we have accumulated transcripts
        accumulated_transcripts = []
        if mic_whisper_processor:
            accumulated_transcripts.extend(
                mic_whisper_processor.get_accumulated_transcripts()
            )
        if system_whisper_processor:
            accumulated_transcripts.extend(
                system_whisper_processor.get_accumulated_transcripts()
            )

        if len(accumulated_transcripts) == 0:
            print("🤖 Auto-processing: No transcripts to process")
            # Restart timer for next interval
            start_auto_processing_timer()
            return

        print(
            f"🤖 Auto-processing: Processing {len(accumulated_transcripts)} transcripts"
        )

        # Sort transcripts by timestamp
        accumulated_transcripts.sort(key=lambda x: x.get("timestamp", ""))

        # Process with LLM asynchronously
        session_id = recording_state["session_id"]
        job_id = llm_processor.process_transcripts_async(
            accumulated_transcripts, session_id
        )

        # Clear accumulated transcripts after sending to LLM
        mic_whisper_processor.clear_accumulated_transcripts()
        if system_whisper_processor:
            system_whisper_processor.clear_accumulated_transcripts()

        # Update last processing time
        auto_processing_state["last_processing_time"] = datetime.now().isoformat()

        # Send auto-processing notification via SSE
        try:
            stream_queue.put(
                {
                    "type": "auto_processing_triggered",
                    "job_id": job_id,
                    "transcript_count": len(accumulated_transcripts),
                    "interval_minutes": auto_processing_state["interval_minutes"],
                    "timestamp": auto_processing_state["last_processing_time"],
                },
                block=False,
            )
        except queue.Full:
            print("⚠️ Stream queue full, dropping auto-processing notification")

        # Restart timer for next interval
        start_auto_processing_timer()

    except Exception as e:
        print(f"❌ Error in auto-processing: {e}")
        # Restart timer even on error
        start_auto_processing_timer()


@app.route("/")
def index():
    """Main transcript display page"""
    return render_template("index.html")


@app.route("/stream")
def stream():
    """Server-Sent Events endpoint for real-time updates"""

    def event_stream():
        heartbeat_counter = 0
        while True:
            try:
                # Get data from queue (blocks until available)
                data = stream_queue.get(timeout=1)
                yield f"data: {json.dumps(data)}\n\n"
            except queue.Empty:
                # Send heartbeat with periodic state validation
                heartbeat_counter += 1
                heartbeat_data = {
                    "type": "heartbeat",
                    "timestamp": datetime.now().isoformat(),
                }

                # Include state validation every 10 heartbeats (every ~10 seconds)
                if heartbeat_counter % 10 == 0:
                    heartbeat_data["state_sync"] = {
                        "is_recording": recording_state["is_recording"],
                        "session_id": recording_state["session_id"],
                        "start_time": recording_state["start_time"],
                    }
                    print(
                        f"🔄 Sending state sync heartbeat: {heartbeat_data['state_sync']}"
                    )

                yield f"data: {json.dumps(heartbeat_data)}\n\n"
            except Exception as e:
                print(f"SSE stream error: {e}")
                break

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.route("/api/status")
def get_status():
    """Get current recording status with detailed information"""
    global mic_whisper_processor, system_whisper_processor, audio_capture, llm_processor

    # Get processor states
    mic_active = False
    system_active = False
    mic_count = 0
    system_count = 0

    if mic_whisper_processor:
        mic_active = (
            mic_whisper_processor.is_streaming
            if hasattr(mic_whisper_processor, "is_streaming")
            else False
        )
        try:
            mic_transcripts = mic_whisper_processor.get_accumulated_transcripts()
            mic_count = len(mic_transcripts) if mic_transcripts else 0
        except Exception:
            mic_count = 0

    if system_whisper_processor:
        system_active = (
            system_whisper_processor.is_streaming
            if hasattr(system_whisper_processor, "is_streaming")
            else False
        )
        try:
            system_transcripts = system_whisper_processor.get_accumulated_transcripts()
            system_count = len(system_transcripts) if system_transcripts else 0
        except Exception:
            system_count = 0

    # Get audio capture state
    audio_capture_active = False
    if audio_capture:
        audio_capture_active = (
            audio_capture.is_recording
            if hasattr(audio_capture, "is_recording")
            else False
        )

    # Get LLM processor state
    llm_state = {
        "available": llm_processor is not None,
        "is_processing": False,
        "queue_length": 0,
        "total_processed": 0,
        "failed_requests": 0,
    }

    if llm_processor:
        llm_state.update(
            {
                "is_processing": llm_processor.is_processing,
                "queue_length": len(llm_processor.processing_queue),
                "total_processed": llm_processor.total_processed,
                "failed_requests": llm_processor.failed_requests,
            }
        )

    # Get processed transcript count for current session
    processed_count = 0
    if recording_state["session_id"]:
        try:
            session_transcripts = get_session_transcripts(
                recording_state["session_id"], "processed"
            )
            processed_count = len(session_transcripts.get("processed", []))
        except Exception:
            processed_count = 0

    return jsonify(
        {
            "is_recording": recording_state["is_recording"],
            "session_id": recording_state["session_id"],
            "start_time": recording_state["start_time"],
            "processors": {
                "microphone_active": mic_active,
                "system_active": system_active,
                "accumulated_transcripts": {
                    "microphone": mic_count,
                    "system": system_count,
                    "total": mic_count + system_count,
                },
            },
            "llm_processor": llm_state,
            "processed_transcripts": {"session_count": processed_count},
            "audio_capture_active": audio_capture_active,
            "server_timestamp": datetime.now().isoformat(),
        }
    )


@app.route("/api/start", methods=["POST"])
def start_recording():
    """Start recording and transcription with whisper.cpp streaming"""
    global \
        mic_whisper_processor, \
        system_whisper_processor, \
        llm_processor, \
        audio_capture, \
        recording_state

    try:
        if recording_state["is_recording"]:
            return jsonify({"error": "Already recording"}), 400

        # Get device selections from request
        device_data = request.get_json() or {}
        requested_mic_device = device_data.get("mic_device_id")
        requested_system_device_raw = device_data.get("system_device_id")

        print(f"🔍 Raw request data: {device_data}")
        print(
            f"🔍 Raw system device: {requested_system_device_raw} (type: {type(requested_system_device_raw)})"
        )

        # Handle output device selection (format: "output_X")
        requested_system_device = None
        is_output_device = False
        user_explicitly_disabled_system_audio = False

        if requested_system_device_raw is not None:
            if isinstance(
                requested_system_device_raw, str
            ) and requested_system_device_raw.startswith("output_"):
                requested_system_device = int(
                    requested_system_device_raw.replace("output_", "")
                )
                is_output_device = True
                print(
                    f"🎛️ Output device selected for system audio: {requested_system_device}"
                )
            else:
                requested_system_device = requested_system_device_raw
                print(
                    f"🎛️ Input device selected for system audio: {requested_system_device}"
                )
        else:
            # When system_device_id is not in the request, it means user selected "No system audio capture"
            user_explicitly_disabled_system_audio = True
            print(
                "🔍 User explicitly disabled system audio capture (no system_device_id in request)"
            )

        print(
            f"🎛️ Device selection request - Mic: {requested_mic_device}, System: {requested_system_device} ({'output' if is_output_device else 'input'})"
        )

        # Initialize SDL device mapper
        from src.sdl_device_mapper import SDLDeviceMapper

        device_mapper = SDLDeviceMapper()
        device_info = device_mapper.get_device_info()

        print(
            f"🔧 SDL Device Mapping: {device_info['sdl_device_count']} SDL devices, {device_info['mapped_devices']} mapped to PyAudio"
        )

        # Initialize audio capture for volume monitoring
        audio_capture = AudioCapture()
        audio_capture.callback = on_audio_chunk

        # Try to find and set audio devices using SDL device mapping
        try:
            # Get PyAudio devices for audio level monitoring
            input_devices, output_devices = audio_capture.list_devices()
            print(
                f"🎧 Found {len(input_devices)} PyAudio input devices, {len(output_devices)} output devices"
            )

            # Debug: Show SDL devices available for whisper.cpp
            print("📋 Available SDL devices for whisper.cpp:")
            for device in device_info["devices"]:
                print(
                    f"   SDL Device {device['sdl_id']}: {device['display_name']} (PyAudio: {device['pyaudio_id']})"
                )

            # Frontend now sends SDL device IDs, convert to PyAudio IDs for monitoring
            mic_sdl_id = requested_mic_device  # SDL device ID from frontend
            system_sdl_id = requested_system_device  # SDL device ID from frontend

            # Get corresponding PyAudio IDs for audio level monitoring
            mic_pyaudio_id = (
                device_mapper.get_pyaudio_device_id(mic_sdl_id)
                if mic_sdl_id is not None
                else None
            )
            system_pyaudio_id = (
                device_mapper.get_pyaudio_device_id(system_sdl_id)
                if system_sdl_id is not None
                else None
            )

            print(
                f"🎛️ Device mapping - Mic SDL:{mic_sdl_id}→PyAudio:{mic_pyaudio_id}, System SDL:{system_sdl_id}→PyAudio:{system_pyaudio_id}"
            )

            # Validate SDL devices exist
            available_sdl_ids = [device["sdl_id"] for device in device_info["devices"]]

            if mic_sdl_id is not None and mic_sdl_id not in available_sdl_ids:
                print(
                    f"⚠️  Requested microphone SDL device {mic_sdl_id} not found, auto-detecting..."
                )
                mic_sdl_id = None
                mic_pyaudio_id = None

            # Handle system audio device validation (now using SDL IDs)
            if system_sdl_id is not None and system_sdl_id not in available_sdl_ids:
                print(
                    f"⚠️  Requested system audio SDL device {system_sdl_id} not found, auto-detecting..."
                )
                system_sdl_id = None
                system_pyaudio_id = None

            # Auto-detect SDL devices if not specified or invalid
            if mic_sdl_id is None:
                # Look for microphone in SDL devices
                for device in device_info["devices"]:
                    device_name_lower = device["display_name"].lower()
                    if "airpods" in device_name_lower or (
                        "microphone" in device_name_lower
                        and "blackhole" not in device_name_lower
                    ):
                        mic_sdl_id = device["sdl_id"]
                        mic_pyaudio_id = device["pyaudio_id"]
                        print(
                            f"🎤 Auto-detected microphone: {device['display_name']} (SDL: {mic_sdl_id}, PyAudio: {mic_pyaudio_id})"
                        )
                        break

            if system_sdl_id is None and not user_explicitly_disabled_system_audio:
                # Look for system audio device in SDL devices (only if user didn't explicitly disable)
                for device in device_info["devices"]:
                    device_name_lower = device["display_name"].lower()
                    if (
                        "blackhole" in device_name_lower
                        or "loopback" in device_name_lower
                        or "soundflower" in device_name_lower
                    ):
                        system_sdl_id = device["sdl_id"]
                        system_pyaudio_id = device["pyaudio_id"]
                        print(
                            f"🔊 Auto-detected system audio: {device['display_name']} (SDL: {system_sdl_id}, PyAudio: {system_pyaudio_id})"
                        )
                        break

            # Print final device selection
            if mic_sdl_id is not None:
                mic_name = next(
                    (
                        device["display_name"]
                        for device in device_info["devices"]
                        if device["sdl_id"] == mic_sdl_id
                    ),
                    "Unknown",
                )
                print(
                    f"✅ Using microphone: {mic_name} (SDL: {mic_sdl_id}, PyAudio: {mic_pyaudio_id})"
                )
            else:
                print("⚠️  No microphone device available")

            if system_sdl_id is not None:
                sys_name = next(
                    (
                        device["display_name"]
                        for device in device_info["devices"]
                        if device["sdl_id"] == system_sdl_id
                    ),
                    "Unknown",
                )
                print(
                    f"✅ Using system audio: {sys_name} (SDL: {system_sdl_id}, PyAudio: {system_pyaudio_id})"
                )
            else:
                print("⚠️  No system audio device available")
                print("   To enable system audio capture:")
                print("   1. Install BlackHole: brew install blackhole-2ch")
                print("   2. Route audio through BlackHole using Multi-Output Device")

            # Set PyAudio devices for audio level monitoring
            audio_capture.set_devices(
                mic_device_id=mic_pyaudio_id, system_device_id=system_pyaudio_id
            )
            print(
                f"🎚️ Audio devices configured - Mic PyAudio: {mic_pyaudio_id}, System PyAudio: {system_pyaudio_id}"
            )

        except Exception as e:
            print(f"⚠️  Error setting up audio devices: {e}")

        # Initialize processors with SDL device IDs for whisper.cpp
        mic_whisper_processor = WhisperStreamProcessor(
            callback=on_whisper_transcript,
            audio_source="microphone",
            audio_device_id=mic_sdl_id,  # Use SDL device ID for whisper.cpp
            vad_config=vad_settings,  # Pass VAD configuration
        )

        # System audio processor (if system device is available and user didn't explicitly disable)
        system_whisper_processor = None
        if system_sdl_id is not None and not user_explicitly_disabled_system_audio:
            system_whisper_processor = WhisperStreamProcessor(
                callback=on_whisper_transcript,
                audio_source="system",
                audio_device_id=system_sdl_id,  # Use SDL device ID for whisper.cpp
                vad_config=vad_settings,  # Pass VAD configuration
            )
            print("🔊 System audio transcription enabled")
        elif user_explicitly_disabled_system_audio:
            print("🔇 System audio transcription disabled (user choice)")
        else:
            print("⚠️  System audio transcription disabled (no system audio device)")

        llm_processor = LLMProcessor(callback=on_llm_result)

        # Start recording
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_time = datetime.now()
        recording_state.update(
            {
                "is_recording": True,
                "session_id": session_id,
                "start_time": start_time.isoformat(),
            }
        )

        # Create session record in database
        create_session_record(session_id, start_time.isoformat())

        # Send recording started message via SSE
        try:
            stream_queue.put(
                {
                    "type": "recording_started",
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat(),
                    "message": "🎯 Whisper.cpp streaming started! Ready for transcription.",
                    "processor_type": "whisper_stream",
                },
                block=False,
            )
        except queue.Full:
            print("⚠️ Stream queue full, dropping message")

        # Start whisper.cpp streaming for microphone
        mic_success = mic_whisper_processor.start_streaming(session_id)

        # Start whisper.cpp streaming for system audio (if available)
        system_success = True
        if system_whisper_processor:
            print(
                f"🔧 Attempting to start system audio transcription with SDL device {system_sdl_id}"
            )
            system_success = system_whisper_processor.start_streaming(session_id)
            if system_success:
                print("🔊 System audio transcription started successfully")
            else:
                print("⚠️  System audio transcription failed to start")

        if not mic_success:
            recording_state["is_recording"] = False
            return jsonify(
                {
                    "error": "Failed to start whisper.cpp streaming for microphone",
                    "message": "Check that whisper.cpp binary and model are available",
                }
            ), 500

        # Report status
        active_sources = ["microphone"]
        if system_success and system_whisper_processor:
            active_sources.append("system")
        print(f"✅ Active transcription sources: {', '.join(active_sources)}")

        # Start audio capture for volume monitoring (separate from whisper.cpp)
        try:
            audio_capture.start_recording(session_id, callback=on_audio_chunk)
            print("🎚️ Audio level monitoring started")
        except Exception as e:
            print(f"⚠️ Audio level monitoring failed: {e}")
            # Don't fail the whole recording if audio monitoring fails

        # Start auto-processing timer if enabled
        if auto_processing_state["enabled"]:
            start_auto_processing_timer()

        return jsonify(
            {
                "success": True,
                "session_id": session_id,
                "message": "Whisper.cpp streaming started with audio monitoring",
                "processor_type": "whisper_stream",
            }
        )

    except Exception as e:
        recording_state["is_recording"] = False
        return jsonify({"error": str(e)}), 500


@app.route("/api/stop", methods=["POST"])
def stop_recording():
    """Stop whisper.cpp streaming and transcription"""
    global \
        mic_whisper_processor, \
        system_whisper_processor, \
        audio_capture, \
        recording_state

    try:
        if not recording_state["is_recording"]:
            return jsonify({"error": "Not currently recording"}), 400

        session_id = recording_state["session_id"]

        # Stop whisper streaming for both sources
        stats = {}
        if mic_whisper_processor:
            mic_stats = mic_whisper_processor.stop_streaming()
            stats["microphone"] = mic_stats

        if system_whisper_processor:
            system_stats = system_whisper_processor.stop_streaming()
            stats["system"] = system_stats
            print("🔊 System audio transcription stopped")

        # Stop audio capture
        if audio_capture:
            try:
                audio_capture.stop_recording()
                print("🎚️ Audio level monitoring stopped")
            except Exception as e:
                print(f"⚠️ Error stopping audio capture: {e}")

        # Stop auto-processing timer
        stop_auto_processing_timer()

        # Process any remaining raw transcripts before stopping
        print("📝 Processing any remaining raw transcripts before stopping...")
        try:
            process_remaining_transcripts_before_stop(session_id)
        except Exception as e:
            print(f"⚠️ Error processing remaining transcripts: {e}")

        # Update state
        recording_state.update(
            {"is_recording": False, "session_id": None, "start_time": None}
        )

        # Send recording stopped message via SSE
        try:
            stream_queue.put(
                {
                    "type": "recording_stopped",
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat(),
                    "message": "🛑 Whisper.cpp streaming stopped.",
                    "stats": stats,
                },
                block=False,
            )
        except queue.Full:
            print("⚠️ Stream queue full, dropping message")

        # Update session with end time and duration
        end_time = datetime.now()
        start_time_str = recording_state.get("start_time")
        if start_time_str:
            try:
                start_time = datetime.fromisoformat(start_time_str)
                duration_seconds = int((end_time - start_time).total_seconds())
                update_session_end_time(
                    session_id, end_time.isoformat(), duration_seconds
                )
                print(
                    f"📊 Session {session_id} ended. Duration: {duration_seconds} seconds"
                )
            except Exception as e:
                print(f"⚠️ Error calculating session duration: {e}")
                update_session_end_time(session_id, end_time.isoformat(), None)

        # Calculate and save session quality metrics
        calculate_and_save_session_metrics(session_id)

        # Mark session as waiting for summary generation after LLM processing completes
        print(
            "📝 Marking session for summary generation after LLM processing completes..."
        )
        sessions_waiting_for_summary.add(session_id)

        # Check if summary can be generated immediately (if no LLM processing is pending)
        check_and_generate_summary_if_ready(session_id)

        return jsonify(
            {
                "success": True,
                "message": "Whisper.cpp streaming and audio monitoring stopped",
                "session_id": session_id,
                "stats": stats,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pause", methods=["POST"])
def pause_recording():
    """Pause whisper.cpp streaming and transcription"""
    global mic_whisper_processor, system_whisper_processor, recording_state

    try:
        if not recording_state["is_recording"]:
            return jsonify({"error": "Not currently recording"}), 400

        # Pause both whisper processors
        results = {}

        if mic_whisper_processor:
            mic_result = mic_whisper_processor.pause_streaming()
            results["microphone"] = mic_result

        if system_whisper_processor:
            system_result = system_whisper_processor.pause_streaming()
            results["system"] = system_result

        # Check if any pause operation failed
        failed_operations = [
            k for k, v in results.items() if not v.get("success", False)
        ]

        if failed_operations:
            error_messages = [
                f"{k}: {results[k].get('error', 'Unknown error')}"
                for k in failed_operations
            ]
            return jsonify(
                {
                    "error": f"Failed to pause: {', '.join(error_messages)}",
                    "results": results,
                }
            ), 500

        # Send pause message via SSE
        try:
            stream_queue.put(
                {
                    "type": "recording_paused",
                    "session_id": recording_state["session_id"],
                    "timestamp": datetime.now().isoformat(),
                    "message": "⏸️ Recording paused",
                },
                block=False,
            )
        except queue.Full:
            print("⚠️ Stream queue full, dropping pause message")

        return jsonify(
            {"success": True, "message": "Recording paused", "results": results}
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/resume", methods=["POST"])
def resume_recording():
    """Resume whisper.cpp streaming and transcription"""
    global mic_whisper_processor, system_whisper_processor, recording_state

    try:
        if not recording_state["is_recording"]:
            return jsonify({"error": "Not currently recording"}), 400

        # Resume both whisper processors
        results = {}

        if mic_whisper_processor:
            mic_result = mic_whisper_processor.resume_streaming()
            results["microphone"] = mic_result

        if system_whisper_processor:
            system_result = system_whisper_processor.resume_streaming()
            results["system"] = system_result

        # Check if any resume operation failed
        failed_operations = [
            k for k, v in results.items() if not v.get("success", False)
        ]

        if failed_operations:
            error_messages = [
                f"{k}: {results[k].get('error', 'Unknown error')}"
                for k in failed_operations
            ]
            return jsonify(
                {
                    "error": f"Failed to resume: {', '.join(error_messages)}",
                    "results": results,
                }
            ), 500

        # Send resume message via SSE
        try:
            stream_queue.put(
                {
                    "type": "recording_resumed",
                    "session_id": recording_state["session_id"],
                    "timestamp": datetime.now().isoformat(),
                    "message": "▶️ Recording resumed",
                },
                block=False,
            )
        except queue.Full:
            print("⚠️ Stream queue full, dropping resume message")

        return jsonify(
            {"success": True, "message": "Recording resumed", "results": results}
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status", methods=["GET"])
def get_recording_status():
    """Get current recording and pause status"""
    global mic_whisper_processor, system_whisper_processor, recording_state

    try:
        status = {
            "is_recording": recording_state["is_recording"],
            "session_id": recording_state.get("session_id"),
            "start_time": recording_state.get("start_time"),
        }

        # Add pause status if recording
        if recording_state["is_recording"]:
            mic_status = (
                mic_whisper_processor.get_streaming_status()
                if mic_whisper_processor
                else {}
            )
            system_status = (
                system_whisper_processor.get_streaming_status()
                if system_whisper_processor
                else {}
            )

            status.update(
                {
                    "microphone": mic_status,
                    "system": system_status,
                    "is_paused": mic_status.get("is_paused", False)
                    or system_status.get("is_paused", False),
                }
            )

        return jsonify(status)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions")
def get_sessions():
    """Get list of recording sessions with transcript counts"""
    try:
        # Get query parameters
        bookmarked_filter = request.args.get("bookmarked")
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get all sessions from raw_transcripts (for backward compatibility)
        cursor.execute(
            """
            SELECT
                session_id,
                COUNT(*) as raw_transcript_count,
                MIN(timestamp) as transcript_start_time,
                MAX(timestamp) as transcript_end_time,
                COUNT(DISTINCT audio_source) as audio_sources
            FROM raw_transcripts
            GROUP BY session_id
        """
        )

        transcript_sessions = {row[0]: row for row in cursor.fetchall()}

        # Get session records from sessions table (preferred source)
        cursor.execute(
            """
            SELECT id, start_time, end_time, duration, total_segments, total_words, avg_confidence, bookmarked, summary, keywords, summary_generated_at
            FROM sessions
            ORDER BY start_time DESC
        """
        )

        session_records = {row[0]: row for row in cursor.fetchall()}

        # Get processed transcript counts for all sessions at once
        cursor.execute(
            """
            SELECT session_id, COUNT(*) as processed_count
            FROM processed_transcripts
            GROUP BY session_id
        """
        )
        processed_counts = {row[0]: row[1] for row in cursor.fetchall()}

        # Combine data, preferring sessions table when available
        sessions = []
        all_session_ids = set(transcript_sessions.keys()) | set(session_records.keys())

        for session_id in all_session_ids:
            transcript_data = transcript_sessions.get(session_id)
            session_data = session_records.get(session_id)
            processed_count = processed_counts.get(session_id, 0)

            # Use session table data if available, otherwise fall back to transcript data
            if session_data:
                start_time = session_data[1]
                end_time = session_data[2]
                duration = session_data[3]
                total_segments = session_data[4] or 0
                total_words = session_data[5] or 0
                avg_confidence = session_data[6] or 0.0
                bookmarked = bool(session_data[7]) if len(session_data) > 7 else False
                summary = session_data[8] if len(session_data) > 8 else None
                keywords_json = session_data[9] if len(session_data) > 9 else None
                summary_generated_at = (
                    session_data[10] if len(session_data) > 10 else None
                )

                # Parse keywords JSON
                keywords = []
                if keywords_json:
                    try:
                        keywords = json.loads(keywords_json)
                    except (json.JSONDecodeError, TypeError):
                        keywords = []
            else:
                start_time = transcript_data[2] if transcript_data else None
                end_time = transcript_data[3] if transcript_data else None
                duration = None
                total_segments = 0
                total_words = 0
                avg_confidence = 0.0
                bookmarked = False
                summary = None
                keywords = []
                summary_generated_at = None

            sessions.append(
                {
                    "session_id": session_id,
                    "raw_transcript_count": transcript_data[1]
                    if transcript_data
                    else 0,
                    "processed_transcript_count": processed_count,
                    "start_time": start_time,
                    "end_time": end_time,
                    "duration": duration,
                    "audio_sources": transcript_data[4] if transcript_data else 0,
                    "total_segments": total_segments,
                    "total_words": total_words,
                    "avg_confidence": avg_confidence,
                    "bookmarked": bookmarked,
                    "summary": summary,
                    "keywords": keywords,
                    "summary_generated_at": summary_generated_at,
                    "display_name": f"Session {session_id.replace('session_', '')}",
                }
            )

        # Apply bookmark filtering if requested
        if bookmarked_filter == "true":
            sessions = [s for s in sessions if s["bookmarked"]]
        elif bookmarked_filter == "false":
            sessions = [s for s in sessions if not s["bookmarked"]]

        # Sort by start time (most recent first)
        sessions.sort(key=lambda x: x["start_time"] or "", reverse=True)

        conn.close()

        return jsonify(
            {"success": True, "sessions": sessions, "total_sessions": len(sessions)}
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/transcript/<session_id>")
def get_transcript(session_id):
    """Get transcript for a specific session (legacy endpoint)"""
    try:
        # TODO: Implement database query for transcript
        transcript = []
        return jsonify({"transcript": transcript})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/llm-status")
def get_llm_status():
    """Get LLM processor status and queue information"""
    global llm_processor

    try:
        if not llm_processor:
            return jsonify(
                {"success": False, "error": "LLM processor not available"}
            ), 503

        # Get queue status
        queue_status = llm_processor.get_queue_status()

        # Get processor stats
        stats = llm_processor.get_stats()

        return jsonify(
            {
                "success": True,
                "is_processing": llm_processor.is_processing,
                "queue_length": len(queue_status),
                "queue_jobs": queue_status,
                "stats": stats,
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/process-llm", methods=["POST"])
def process_llm():
    """Trigger LLM processing of accumulated transcripts"""
    global mic_whisper_processor, system_whisper_processor, llm_processor

    try:
        data = request.get_json()
        session_id = data.get("session_id")

        if not session_id:
            return jsonify({"error": "session_id required"}), 400

        if not mic_whisper_processor:
            return jsonify({"error": "Whisper processor not initialized"}), 400

        # Get accumulated transcripts from both sources
        accumulated_transcripts = []

        # Add microphone transcripts
        mic_transcripts = mic_whisper_processor.get_accumulated_transcripts()
        accumulated_transcripts.extend(mic_transcripts)

        # Add system audio transcripts if available
        if system_whisper_processor:
            system_transcripts = system_whisper_processor.get_accumulated_transcripts()
            accumulated_transcripts.extend(system_transcripts)

        if not accumulated_transcripts:
            return jsonify({"error": "No transcripts to process"}), 400

        # Sort transcripts by timestamp to maintain chronological order
        accumulated_transcripts.sort(key=lambda x: x.get("timestamp", ""))

        # Process with LLM asynchronously
        job_id = llm_processor.process_transcripts_async(
            accumulated_transcripts, session_id
        )

        # Clear accumulated transcripts after sending to LLM
        mic_whisper_processor.clear_accumulated_transcripts()
        if system_whisper_processor:
            system_whisper_processor.clear_accumulated_transcripts()

        return jsonify(
            {
                "success": True,
                "job_id": job_id,
                "transcript_count": len(accumulated_transcripts),
                "message": "LLM processing started",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto-processing/settings", methods=["GET"])
def get_auto_processing_settings():
    """Get current auto-processing settings"""
    try:
        return jsonify(
            {
                "success": True,
                "settings": {
                    "enabled": auto_processing_state["enabled"],
                    "interval_minutes": auto_processing_state["interval_minutes"],
                    "last_processing_time": auto_processing_state[
                        "last_processing_time"
                    ],
                    "is_timer_active": auto_processing_state["timer"] is not None,
                },
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto-processing/settings", methods=["POST"])
def update_auto_processing_settings():
    """Update auto-processing settings"""
    global auto_processing_state

    try:
        data = request.get_json()

        if "enabled" in data:
            auto_processing_state["enabled"] = bool(data["enabled"])

        if "interval_minutes" in data:
            interval = int(data["interval_minutes"])
            if interval in [2, 5, 10]:  # Only allow valid intervals
                auto_processing_state["interval_minutes"] = interval
            else:
                return jsonify(
                    {"error": "Invalid interval. Must be 2, 5, or 10 minutes"}
                ), 400

        # Restart timer with new settings if recording is active
        if recording_state["is_recording"]:
            if auto_processing_state["enabled"]:
                start_auto_processing_timer()
            else:
                stop_auto_processing_timer()

        return jsonify(
            {
                "success": True,
                "settings": {
                    "enabled": auto_processing_state["enabled"],
                    "interval_minutes": auto_processing_state["interval_minutes"],
                    "last_processing_time": auto_processing_state[
                        "last_processing_time"
                    ],
                    "is_timer_active": auto_processing_state["timer"] is not None,
                },
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Global VAD settings state
vad_settings = {
    "use_fixed_interval": False,  # Default to VAD mode
    "vad_threshold": 0.6  # Default VAD threshold
}


@app.route("/api/vad-settings", methods=["GET"])
def get_vad_settings():
    """Get current VAD settings"""
    try:
        return jsonify({"success": True, "settings": vad_settings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/vad-settings", methods=["POST"])
def update_vad_settings():
    """Update VAD settings"""
    global vad_settings

    try:
        data = request.get_json()

        if "use_fixed_interval" in data:
            vad_settings["use_fixed_interval"] = bool(data["use_fixed_interval"])

        if "vad_threshold" in data:
            threshold = float(data["vad_threshold"])
            # Validate threshold range (0.1 to 1.0)
            if 0.1 <= threshold <= 1.0:
                vad_settings["vad_threshold"] = threshold
            else:
                return jsonify(
                    {"error": "VAD threshold must be between 0.1 and 1.0"}
                ), 400

        return jsonify(
            {
                "success": True,
                "settings": vad_settings,
                "message": "VAD settings updated successfully",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/raw-transcripts/<session_id>")
def get_raw_transcripts(session_id):
    """Get raw transcripts for a specific session with pagination"""
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 50))
        offset = (page - 1) * limit

        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get total count for this session
        cursor.execute(
            "SELECT COUNT(*) FROM raw_transcripts WHERE session_id = ?", (session_id,)
        )
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute(
            """
            SELECT id, text, timestamp, sequence_number, confidence, processing_time, audio_source
            FROM raw_transcripts
            WHERE session_id = ?
            ORDER BY sequence_number
            LIMIT ? OFFSET ?
        """,
            (session_id, limit, offset),
        )

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append(
                {
                    "id": row[0],
                    "text": row[1],
                    "timestamp": row[2],
                    "sequence_number": row[3],
                    "confidence": row[4],
                    "processing_time": row[5],
                    "audio_source": row[6],
                }
            )

        conn.close()

        return jsonify(
            {
                "success": True,
                "session_id": session_id,
                "transcripts": transcripts,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "total_pages": (total_count + limit - 1) // limit,
                },
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/processed-transcripts/<session_id>")
def get_processed_transcripts(session_id):
    """Get processed transcripts for a specific session with pagination"""
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
        offset = (page - 1) * limit

        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get total count for this session
        cursor.execute(
            "SELECT COUNT(*) FROM processed_transcripts WHERE session_id = ?",
            (session_id,),
        )
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute(
            """
            SELECT id, processed_text, original_transcript_ids,
                   original_transcript_count, llm_model, processing_time, timestamp
            FROM processed_transcripts
            WHERE session_id = ?
            ORDER BY timestamp
            LIMIT ? OFFSET ?
        """,
            (session_id, limit, offset),
        )

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append(
                {
                    "id": row[0],
                    "processed_text": row[1],
                    "original_transcript_ids": json.loads(row[2]),
                    "original_transcript_count": row[3],
                    "llm_model": row[4],
                    "processing_time": row[5],
                    "timestamp": row[6],
                }
            )

        conn.close()

        return jsonify(
            {
                "success": True,
                "session_id": session_id,
                "transcripts": transcripts,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "total_pages": (total_count + limit - 1) // limit,
                },
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/toggle-display", methods=["POST"])
def toggle_display():
    """Toggle display settings for transcript panels"""
    try:
        data = request.get_json()
        panel_type = data.get("panel_type")  # 'raw' or 'processed'
        visible = data.get("visible", True)

        if panel_type not in ["raw", "processed"]:
            return jsonify(
                {"error": 'Invalid panel_type. Must be "raw" or "processed"'}
            ), 400

        # Store display preferences (could be in session or database)
        # For now, just return success - frontend will handle the toggle

        return jsonify(
            {
                "success": True,
                "panel_type": panel_type,
                "visible": visible,
                "message": f"{panel_type.title()} panel {'shown' if visible else 'hidden'}",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/<session_id>/calculate-metrics", methods=["POST"])
def calculate_session_metrics_endpoint(session_id):
    """Calculate and save quality metrics for a session"""
    try:
        calculate_and_save_session_metrics(session_id)
        metrics = get_session_quality_metrics(session_id)

        return jsonify({"success": True, "session_id": session_id, "metrics": metrics})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/<session_id>/bookmark", methods=["POST"])
def toggle_session_bookmark(session_id):
    """Toggle bookmark status for a session"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Check if session exists in sessions table
        cursor.execute(
            "SELECT id, bookmarked FROM sessions WHERE id = ?", (session_id,)
        )
        session = cursor.fetchone()

        if not session:
            # Check if session exists in raw_transcripts (legacy sessions)
            cursor.execute(
                "SELECT session_id, MIN(timestamp) FROM raw_transcripts WHERE session_id = ?",
                (session_id,),
            )
            raw_session = cursor.fetchone()

            if not raw_session:
                conn.close()
                return jsonify({"error": "Session not found"}), 404

            # Create session record for legacy session
            start_time = raw_session[1]
            cursor.execute(
                "INSERT INTO sessions (id, start_time, bookmarked) VALUES (?, ?, ?)",
                (
                    session_id,
                    start_time,
                    True,
                ),  # Default to bookmarked since user is trying to bookmark it
            )
            new_bookmarked = True
            message = "Session bookmarked (legacy session migrated)"
        else:
            # Toggle bookmark status for existing session
            current_bookmarked = bool(session[1])
            new_bookmarked = not current_bookmarked

            cursor.execute(
                "UPDATE sessions SET bookmarked = ? WHERE id = ?",
                (new_bookmarked, session_id),
            )
            message = f"Session {'bookmarked' if new_bookmarked else 'unbookmarked'}"

        conn.commit()
        conn.close()

        return jsonify(
            {
                "success": True,
                "session_id": session_id,
                "bookmarked": new_bookmarked,
                "message": message,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/<session_id>/generate-summary", methods=["POST"])
def generate_session_summary_endpoint(session_id):
    """Manually generate summary for a session"""
    try:
        # Use the session service to generate summary
        import queue

        from src.services.session_service import SessionService

        # Create a temporary session service for this operation
        temp_queue = queue.Queue()
        session_service = SessionService(temp_queue)

        result = session_service.generate_summary_for_session(session_id)

        if result["success"]:
            return jsonify(
                {
                    "success": True,
                    "summary": result["summary"],
                    "keywords": result["keywords"],
                    "message": result["message"],
                }
            )
        else:
            return jsonify({"success": False, "error": result["error"]}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/<session_id>/export")
def export_session(session_id):
    """Export session transcripts in various formats"""
    try:
        # Get query parameters
        export_format = request.args.get("format", "json").lower()
        content_type = request.args.get("content", "both").lower()

        # Validate parameters
        if export_format not in ["json", "txt", "csv"]:
            return jsonify({"error": "Invalid format. Must be json, txt, or csv"}), 400

        if content_type not in ["raw", "processed", "both"]:
            return jsonify(
                {"error": "Invalid content type. Must be raw, processed, or both"}
            ), 400

        # Get session transcripts
        transcripts = get_session_transcripts(session_id, content_type)

        if not transcripts:
            return jsonify({"error": "No transcripts found for this session"}), 404

        # Get session metadata
        session_metadata = get_session_metadata(session_id)

        # Generate export data based on format
        if export_format == "json":
            export_data = generate_json_export(
                session_id, transcripts, session_metadata
            )
            response = Response(
                json.dumps(export_data, indent=2),
                mimetype="application/json",
                headers={
                    "Content-Disposition": f"attachment; filename=session_{session_id}_{content_type}.json"
                },
            )
        elif export_format == "txt":
            export_data = generate_txt_export(session_id, transcripts, session_metadata)
            response = Response(
                export_data,
                mimetype="text/plain",
                headers={
                    "Content-Disposition": f"attachment; filename=session_{session_id}_{content_type}.txt"
                },
            )
        elif export_format == "csv":
            export_data = generate_csv_export(session_id, transcripts, session_metadata)
            response = Response(
                export_data,
                mimetype="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=session_{session_id}_{content_type}.csv"
                },
            )

        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/database/stats")
def get_database_stats():
    """Get database statistics for inspection"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get counts from all tables
        cursor.execute("SELECT COUNT(*) FROM raw_transcripts")
        raw_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM processed_transcripts")
        processed_count = cursor.fetchone()[0]

        # Get actual session count from raw_transcripts (more accurate than sessions table)
        cursor.execute("SELECT COUNT(DISTINCT session_id) FROM raw_transcripts")
        sessions_count = cursor.fetchone()[0]

        # Also get sessions table count for reference
        cursor.execute("SELECT COUNT(*) FROM sessions")
        sessions_table_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM transcripts")
        legacy_count = cursor.fetchone()[0]

        # Get recent sessions
        cursor.execute(
            """
            SELECT DISTINCT session_id, COUNT(*) as transcript_count,
                   MIN(timestamp) as first_transcript, MAX(timestamp) as last_transcript
            FROM raw_transcripts
            GROUP BY session_id
            ORDER BY last_transcript DESC
            LIMIT 10
        """
        )
        recent_sessions = []
        for row in cursor.fetchall():
            recent_sessions.append(
                {
                    "session_id": row[0],
                    "transcript_count": row[1],
                    "first_transcript": row[2],
                    "last_transcript": row[3],
                }
            )

        conn.close()

        return jsonify(
            {
                "success": True,
                "stats": {
                    "raw_transcripts": raw_count,
                    "processed_transcripts": processed_count,
                    "sessions": sessions_count,
                    "sessions_table": sessions_table_count,
                    "legacy_transcripts": legacy_count,
                },
                "recent_sessions": recent_sessions,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/database/raw-transcripts")
def get_all_raw_transcripts():
    """Get all raw transcripts with pagination"""
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 50))
        offset = (page - 1) * limit

        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get total count
        cursor.execute("SELECT COUNT(*) FROM raw_transcripts")
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute(
            """
            SELECT id, session_id, text, timestamp, sequence_number, confidence, processing_time, audio_source
            FROM raw_transcripts
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        """,
            (limit, offset),
        )

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append(
                {
                    "id": row[0],
                    "session_id": row[1],
                    "text": row[2],
                    "timestamp": row[3],
                    "sequence_number": row[4],
                    "confidence": row[5],
                    "processing_time": row[6],
                    "audio_source": row[7],
                }
            )

        conn.close()

        return jsonify(
            {
                "success": True,
                "transcripts": transcripts,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "total_pages": (total_count + limit - 1) // limit,
                },
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/database/processed-transcripts")
def get_all_processed_transcripts():
    """Get all processed transcripts with pagination"""
    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
        offset = (page - 1) * limit

        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get total count
        cursor.execute("SELECT COUNT(*) FROM processed_transcripts")
        total_count = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute(
            """
            SELECT id, session_id, processed_text, original_transcript_ids,
                   original_transcript_count, llm_model, processing_time, timestamp
            FROM processed_transcripts
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        """,
            (limit, offset),
        )

        transcripts = []
        for row in cursor.fetchall():
            transcripts.append(
                {
                    "id": row[0],
                    "session_id": row[1],
                    "processed_text": row[2],
                    "original_transcript_ids": json.loads(row[3]),
                    "original_transcript_count": row[4],
                    "llm_model": row[5],
                    "processing_time": row[6],
                    "timestamp": row[7],
                }
            )

        conn.close()

        return jsonify(
            {
                "success": True,
                "transcripts": transcripts,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total_count": total_count,
                    "total_pages": (total_count + limit - 1) // limit,
                },
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/audio-devices")
def get_audio_devices():
    """Get list of available audio devices using SDL device mapping"""
    try:
        from src.sdl_device_mapper import SDLDeviceMapper

        mapper = SDLDeviceMapper()
        device_info = mapper.get_device_info()

        # Format devices for frontend dropdown
        input_devices = []
        for device in device_info["devices"]:
            input_devices.append(
                {
                    "id": device["sdl_id"],  # Use SDL ID for whisper.cpp
                    "name": device["display_name"],
                    "pyaudio_id": device["pyaudio_id"],  # For audio level monitoring
                    "available_for_whisper": device["available_for_whisper"],
                    "available_for_monitoring": device["available_for_monitoring"],
                }
            )

        return jsonify(
            {
                "success": True,
                "input_devices": input_devices,
                "output_devices": [],  # Not needed since we use SDL devices
                "device_mapping_info": {
                    "sdl_devices": device_info["sdl_device_count"],
                    "pyaudio_devices": device_info["pyaudio_device_count"],
                    "mapped_devices": device_info["mapped_devices"],
                },
                "system_audio_note": "Devices shown are SDL devices that whisper.cpp can use directly",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


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


def on_audio_chunk(
    audio_data, source="microphone", audio_level=None, is_transcription=False
):
    """Callback for when new audio data is available"""
    global transcript_processor

    # Initialize transcript tracking for deduplication
    if not hasattr(on_audio_chunk, "last_transcript"):
        on_audio_chunk.last_transcript = {}
    if not hasattr(on_audio_chunk, "transcript_history"):
        on_audio_chunk.transcript_history = {}

    # Track recent transcriptions to avoid duplicates
    if not hasattr(on_audio_chunk, "recent_transcripts"):
        on_audio_chunk.recent_transcripts = {}
    if not hasattr(on_audio_chunk, "last_cleanup"):
        on_audio_chunk.last_cleanup = time.time()

    # Handle audio level updates
    if audio_level is not None:
        level_data = {"type": "audio_level", "timestamp": datetime.now().isoformat()}
        if source == "microphone":
            level_data["microphone_level"] = audio_level
            # Console log for microphone levels (show percentage and bar visualization)
            percentage = audio_level * 100
            bar_length = int(percentage / 2)  # Scale to 50 chars max
            bar = "█" * bar_length + "░" * (50 - bar_length)
            print(f"🎤 Mic Level: {percentage:5.1f}% |{bar}|")
        elif source == "system":
            level_data["system_level"] = audio_level
            # Console log for system audio levels (show percentage and bar visualization)
            percentage = audio_level * 100
            bar_length = int(percentage / 2)  # Scale to 50 chars max
            bar = "█" * bar_length + "░" * (50 - bar_length)
            print(f"🔊 Sys Level: {percentage:5.1f}% |{bar}|")

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
            transcript_result = transcript_processor.process_audio_chunk(audio_data)

            if transcript_result and transcript_result.get("text", "").strip():
                current_text = transcript_result["text"].strip()
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
                        "type": "transcript_update",
                        "session_id": recording_state["session_id"],
                        "timestamp": datetime.now().isoformat(),
                        "source": source,
                        "text": new_content,  # Deduplicated new content
                        "raw_text": current_text,  # Full raw transcript
                        "confidence": transcript_result.get("confidence", 0),
                        "is_final": transcript_result.get("is_final", False),
                        "is_deduplicated": True,
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


def create_session_record(session_id, start_time):
    """Create a new session record in the database"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO sessions (id, start_time)
            VALUES (?, ?)
        """,
            (session_id, start_time),
        )

        conn.commit()
        conn.close()
        print(f"📊 Created session record: {session_id}")
        return True

    except Exception as e:
        print(f"❌ Error creating session record: {e}")
        return False


def update_session_end_time(session_id, end_time, duration_seconds):
    """Update session with end time and duration"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE sessions SET end_time = ?, duration = ?
            WHERE id = ?
        """,
            (end_time, duration_seconds, session_id),
        )

        conn.commit()
        conn.close()
        print(f"📊 Updated session {session_id} end time and duration")
        return True

    except Exception as e:
        print(f"❌ Error updating session end time: {e}")
        return False


def init_database():
    """Initialize SQLite database with dual transcript support"""
    conn = sqlite3.connect("transcripts.db")
    cursor = conn.cursor()

    # Create sessions table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration INTEGER,
            total_segments INTEGER DEFAULT 0,
            raw_transcript_count INTEGER DEFAULT 0,
            processed_transcript_count INTEGER DEFAULT 0,
            total_words INTEGER DEFAULT 0,
            avg_confidence REAL DEFAULT 0.0,
            confidence_count INTEGER DEFAULT 0,
            confidence_sum REAL DEFAULT 0.0,
            bookmarked BOOLEAN DEFAULT 0,
            summary TEXT,
            keywords TEXT,
            summary_generated_at TEXT
        )
    """
    )

    # Create raw_transcripts table for whisper.cpp output
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS raw_transcripts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            confidence REAL,
            processing_time REAL,
            audio_source TEXT NOT NULL DEFAULT 'unknown',
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
    """
    )

    # Create processed_transcripts table for LLM output
    cursor.execute(
        """
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
    """
    )

    # Create legacy transcripts table (keep for backward compatibility)
    cursor.execute(
        """
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
    """
    )

    # Migration: Add audio_source column to existing raw_transcripts table if it doesn't exist
    try:
        cursor.execute(
            'ALTER TABLE raw_transcripts ADD COLUMN audio_source TEXT NOT NULL DEFAULT "unknown"'
        )
        print("✅ Added audio_source column to raw_transcripts table")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("ℹ️  audio_source column already exists in raw_transcripts table")
        else:
            print(f"⚠️  Error adding audio_source column: {e}")

    # Create indexes for better performance (after migration)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_raw_transcripts_session ON raw_transcripts(session_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_processed_transcripts_session ON processed_transcripts(session_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_raw_transcripts_timestamp ON raw_transcripts(timestamp)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_processed_transcripts_timestamp ON processed_transcripts(timestamp)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_raw_transcripts_audio_source ON raw_transcripts(audio_source)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_bookmarked ON sessions(bookmarked)"
    )

    # Add quality metrics columns to existing sessions table if they don't exist
    try:
        cursor.execute("ALTER TABLE sessions ADD COLUMN total_words INTEGER DEFAULT 0")
        print("ℹ️  Added total_words column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN avg_confidence REAL DEFAULT 0.0"
        )
        print("ℹ️  Added avg_confidence column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN confidence_count INTEGER DEFAULT 0"
        )
        print("ℹ️  Added confidence_count column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN confidence_sum REAL DEFAULT 0.0"
        )
        print("ℹ️  Added confidence_sum column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Add summary columns to existing sessions table if they don't exist
    try:
        cursor.execute("ALTER TABLE sessions ADD COLUMN summary TEXT")
        print("ℹ️  Added summary column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE sessions ADD COLUMN keywords TEXT")
        print("ℹ️  Added keywords column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE sessions ADD COLUMN summary_generated_at TEXT")
        print("ℹ️  Added summary_generated_at column to sessions table")
    except sqlite3.OperationalError:
        pass  # Column already exists

    conn.commit()
    conn.close()


def save_raw_transcript(transcript_data):
    """Save raw transcript from whisper.cpp to database"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO raw_transcripts
            (id, session_id, text, timestamp, sequence_number, confidence, processing_time, audio_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                transcript_data["id"],
                transcript_data["session_id"],
                transcript_data["text"],
                transcript_data["timestamp"],
                transcript_data["sequence_number"],
                transcript_data.get("confidence"),
                transcript_data.get("processing_time"),
                transcript_data.get("audio_source", "unknown"),
            ),
        )

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error saving raw transcript: {e}")
        return False


def save_processed_transcript(processed_data):
    """Save LLM-processed transcript to database"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Convert transcript IDs list to JSON string
        transcript_ids_json = json.dumps(processed_data["original_transcript_ids"])

        cursor.execute(
            """
            INSERT INTO processed_transcripts
            (id, session_id, processed_text, original_transcript_ids,
             original_transcript_count, llm_model, processing_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                processed_data["id"],
                processed_data["session_id"],
                processed_data["processed_text"],
                transcript_ids_json,
                processed_data["original_transcript_count"],
                processed_data["llm_model"],
                processed_data["processing_time"],
                processed_data["timestamp"],
            ),
        )

        conn.commit()
        conn.close()
        return True

    except Exception as e:
        print(f"Error saving processed transcript: {e}")
        return False


def get_session_transcripts(session_id, transcript_type="both"):
    """Get transcripts for a session"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        result = {}

        if transcript_type in ["raw", "both"]:
            cursor.execute(
                """
                SELECT id, text, timestamp, sequence_number, confidence, processing_time, audio_source
                FROM raw_transcripts
                WHERE session_id = ?
                ORDER BY sequence_number
            """,
                (session_id,),
            )

            raw_transcripts = []
            for row in cursor.fetchall():
                raw_transcripts.append(
                    {
                        "id": row[0],
                        "text": row[1],
                        "timestamp": row[2],
                        "sequence_number": row[3],
                        "confidence": row[4],
                        "processing_time": row[5],
                        "audio_source": row[6],
                    }
                )
            result["raw"] = raw_transcripts

        if transcript_type in ["processed", "both"]:
            cursor.execute(
                """
                SELECT id, processed_text, original_transcript_ids,
                       original_transcript_count, llm_model, processing_time, timestamp
                FROM processed_transcripts
                WHERE session_id = ?
                ORDER BY timestamp
            """,
                (session_id,),
            )

            processed_transcripts = []
            for row in cursor.fetchall():
                processed_transcripts.append(
                    {
                        "id": row[0],
                        "processed_text": row[1],
                        "original_transcript_ids": json.loads(row[2]),
                        "original_transcript_count": row[3],
                        "llm_model": row[4],
                        "processing_time": row[5],
                        "timestamp": row[6],
                    }
                )
            result["processed"] = processed_transcripts

        conn.close()
        return result

    except Exception as e:
        print(f"Error getting session transcripts: {e}")
        return {}


def calculate_and_save_session_metrics(session_id):
    """Calculate quality metrics from raw transcripts and save to sessions table"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get all raw transcripts for this session
        cursor.execute(
            """
            SELECT text, confidence FROM raw_transcripts
            WHERE session_id = ?
            ORDER BY sequence_number
        """,
            (session_id,),
        )

        transcripts = cursor.fetchall()

        if not transcripts:
            return

        # Calculate metrics
        total_segments = len(transcripts)
        total_words = 0
        confidence_sum = 0.0
        confidence_count = 0

        for text, confidence in transcripts:
            # Count words (simple split by whitespace)
            if text:
                total_words += len(text.split())

            # Sum confidence scores
            if confidence is not None:
                confidence_sum += confidence
                confidence_count += 1

        # Calculate average confidence
        avg_confidence = (
            confidence_sum / confidence_count if confidence_count > 0 else 0.0
        )

        # Update sessions table with calculated metrics
        cursor.execute(
            """
            UPDATE sessions SET
                total_segments = ?,
                total_words = ?,
                avg_confidence = ?,
                confidence_count = ?,
                confidence_sum = ?
            WHERE id = ?
        """,
            (
                total_segments,
                total_words,
                avg_confidence,
                confidence_count,
                confidence_sum,
                session_id,
            ),
        )

        conn.commit()
        conn.close()

        print(
            f"📊 Updated session {session_id} metrics: {total_segments} segments, {total_words} words, {avg_confidence:.2f} avg confidence"
        )

    except Exception as e:
        print(f"❌ Error calculating session metrics: {e}")


def get_session_quality_metrics(session_id):
    """Get quality metrics for a session from the database"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT total_segments, total_words, avg_confidence, confidence_count, confidence_sum
            FROM sessions
            WHERE id = ?
        """,
            (session_id,),
        )

        result = cursor.fetchone()
        conn.close()

        if result:
            return {
                "total_segments": result[0] or 0,
                "total_words": result[1] or 0,
                "avg_confidence": result[2] or 0.0,
                "confidence_count": result[3] or 0,
                "confidence_sum": result[4] or 0.0,
            }
        else:
            return None

    except Exception as e:
        print(f"❌ Error getting session metrics: {e}")
        return None


def get_session_metadata(session_id):
    """Get session metadata for export"""
    try:
        conn = sqlite3.connect("transcripts.db")
        cursor = conn.cursor()

        # Get session info from sessions table including bookmark status
        cursor.execute(
            """
            SELECT start_time, end_time, duration, total_segments, total_words, avg_confidence, bookmarked
            FROM sessions
            WHERE id = ?
        """,
            (session_id,),
        )

        session_row = cursor.fetchone()

        # Get additional info from raw_transcripts
        cursor.execute(
            """
            SELECT MIN(timestamp) as first_transcript, MAX(timestamp) as last_transcript,
                   COUNT(*) as raw_count, COUNT(DISTINCT audio_source) as audio_sources
            FROM raw_transcripts
            WHERE session_id = ?
        """,
            (session_id,),
        )

        transcript_row = cursor.fetchone()

        # Get processed transcript count
        cursor.execute(
            """
            SELECT COUNT(*) FROM processed_transcripts WHERE session_id = ?
        """,
            (session_id,),
        )

        processed_count = cursor.fetchone()[0]

        conn.close()

        metadata = {
            "session_id": session_id,
            "export_timestamp": datetime.now().isoformat(),
            "raw_transcript_count": transcript_row[2] if transcript_row else 0,
            "processed_transcript_count": processed_count,
            "audio_sources": transcript_row[3] if transcript_row else 0,
            "first_transcript": transcript_row[0] if transcript_row else None,
            "last_transcript": transcript_row[1] if transcript_row else None,
        }

        # Add session table data if available
        if session_row:
            metadata.update(
                {
                    "start_time": session_row[0],
                    "end_time": session_row[1],
                    "duration": session_row[2],
                    "total_segments": session_row[3],
                    "total_words": session_row[4],
                    "avg_confidence": session_row[5],
                    "bookmarked": bool(session_row[6]),
                }
            )
        else:
            # If no session row found, default bookmark status to false
            metadata["bookmarked"] = False

        return metadata

    except Exception as e:
        print(f"Error getting session metadata: {e}")
        return {
            "session_id": session_id,
            "export_timestamp": datetime.now().isoformat(),
        }


def generate_json_export(session_id, transcripts, metadata):
    """Generate JSON export format"""
    export_data = {"metadata": metadata, "transcripts": transcripts}
    return export_data


def generate_txt_export(session_id, transcripts, metadata):
    """Generate plain text export format"""
    lines = []

    # Header
    lines.append(f"Session Export: {session_id}")
    lines.append(f"Export Date: {metadata.get('export_timestamp', 'Unknown')}")
    lines.append(f"Bookmarked: {'Yes' if metadata.get('bookmarked', False) else 'No'}")
    lines.append(f"Raw Transcripts: {metadata.get('raw_transcript_count', 0)}")
    lines.append(
        f"Processed Transcripts: {metadata.get('processed_transcript_count', 0)}"
    )
    lines.append("=" * 80)
    lines.append("")

    # Raw transcripts
    if "raw" in transcripts and transcripts["raw"]:
        lines.append("RAW TRANSCRIPTS")
        lines.append("-" * 40)
        for transcript in transcripts["raw"]:
            timestamp = transcript.get("timestamp", "Unknown")
            audio_source = transcript.get("audio_source", "unknown")
            confidence = transcript.get("confidence")
            conf_str = f" (confidence: {confidence:.2f})" if confidence else ""
            lines.append(f"[{timestamp}] [{audio_source}]{conf_str}")
            lines.append(transcript.get("text", ""))
            lines.append("")

    # Processed transcripts
    if "processed" in transcripts and transcripts["processed"]:
        lines.append("PROCESSED TRANSCRIPTS")
        lines.append("-" * 40)
        for transcript in transcripts["processed"]:
            timestamp = transcript.get("timestamp", "Unknown")
            llm_model = transcript.get("llm_model", "Unknown")
            original_count = transcript.get("original_transcript_count", 0)
            lines.append(
                f"[{timestamp}] [LLM: {llm_model}] (from {original_count} raw transcripts)"
            )
            lines.append(transcript.get("processed_text", ""))
            lines.append("")

    return "\n".join(lines)


def generate_csv_export(session_id, transcripts, metadata):
    """Generate CSV export format"""

    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(
        [
            "Type",
            "Timestamp",
            "Text",
            "Audio_Source",
            "Confidence",
            "LLM_Model",
            "Original_Count",
        ]
    )

    # Write raw transcripts
    if "raw" in transcripts and transcripts["raw"]:
        for transcript in transcripts["raw"]:
            writer.writerow(
                [
                    "raw",
                    transcript.get("timestamp", ""),
                    transcript.get("text", ""),
                    transcript.get("audio_source", ""),
                    transcript.get("confidence", ""),
                    "",  # No LLM model for raw
                    "",  # No original count for raw
                ]
            )

    # Write processed transcripts
    if "processed" in transcripts and transcripts["processed"]:
        for transcript in transcripts["processed"]:
            writer.writerow(
                [
                    "processed",
                    transcript.get("timestamp", ""),
                    transcript.get("processed_text", ""),
                    "",  # No audio source for processed
                    "",  # No confidence for processed
                    transcript.get("llm_model", ""),
                    transcript.get("original_transcript_count", ""),
                ]
            )

    return output.getvalue()


def check_and_generate_summary_if_ready(session_id):
    """Check if a session is ready for summary generation and generate if ready."""
    global llm_processor, sessions_waiting_for_summary

    try:
        if session_id not in sessions_waiting_for_summary:
            return  # Session not waiting for summary

        # Check if there are any pending LLM processing jobs for this session
        if llm_processor:
            queue_status = llm_processor.get_queue_status()
            pending_jobs = [
                job
                for job in queue_status
                if job.get("session_id") == session_id
                and job.get("status") in ["queued", "processing"]
            ]

            if pending_jobs:
                print(
                    f"📝 Session {session_id} still has {len(pending_jobs)} pending LLM jobs, waiting..."
                )
                return  # Still processing, wait for completion

        # No pending jobs, ready to generate summary
        print(f"📝 Session {session_id} ready for summary generation!")
        sessions_waiting_for_summary.remove(session_id)

        # Generate summary asynchronously
        generate_session_summary_async(session_id)

    except Exception as e:
        print(f"❌ Error checking summary readiness for session {session_id}: {e}")
        # Remove from waiting list to prevent infinite waiting
        sessions_waiting_for_summary.discard(session_id)


def process_remaining_transcripts_before_stop(session_id):
    """Process any remaining raw transcripts before stopping the session."""
    global mic_whisper_processor, system_whisper_processor, llm_processor

    try:
        # Get accumulated transcripts from both processors
        accumulated_transcripts = []

        if mic_whisper_processor:
            mic_transcripts = mic_whisper_processor.get_accumulated_transcripts()
            accumulated_transcripts.extend(mic_transcripts)
            print(f"📝 Found {len(mic_transcripts)} accumulated mic transcripts")

        if system_whisper_processor:
            system_transcripts = system_whisper_processor.get_accumulated_transcripts()
            accumulated_transcripts.extend(system_transcripts)
            print(f"📝 Found {len(system_transcripts)} accumulated system transcripts")

        if accumulated_transcripts:
            print(
                f"📝 Processing {len(accumulated_transcripts)} remaining transcripts for session {session_id}"
            )

            # Sort transcripts by timestamp to maintain chronological order
            accumulated_transcripts.sort(key=lambda x: x.get("timestamp", ""))

            # Process with LLM synchronously (wait for completion)
            if llm_processor:
                job_id = llm_processor.process_transcripts_async(
                    accumulated_transcripts, session_id
                )
                print(
                    f"📝 Started LLM processing job {job_id} for remaining transcripts"
                )

                # Clear accumulated transcripts after sending to LLM
                if mic_whisper_processor:
                    mic_whisper_processor.clear_accumulated_transcripts()
                if system_whisper_processor:
                    system_whisper_processor.clear_accumulated_transcripts()
            else:
                print("⚠️ No LLM processor available for remaining transcripts")
        else:
            print("📝 No remaining transcripts to process")

    except Exception as e:
        print(f"❌ Error processing remaining transcripts: {e}")


def generate_session_summary_async(session_id):
    """Generate session summary asynchronously after session ends."""
    import queue
    import threading

    from src.services.session_service import SessionService

    def _generate_summary():
        try:
            # Create a temporary session service for this operation
            temp_queue = queue.Queue()
            session_service = SessionService(temp_queue)

            # Wait a bit for any pending LLM processing to complete
            import time

            time.sleep(2)

            print(f"📝 Generating summary for session {session_id}...")
            result = session_service.generate_summary_for_session(session_id)

            if result["success"]:
                print(
                    f"✅ Summary generated for session {session_id}: {result['summary'][:100]}..."
                )

                # Send summary event via SSE
                try:
                    stream_queue.put(
                        {
                            "type": "session_summary_generated",
                            "session_id": session_id,
                            "summary": result["summary"],
                            "keywords": result["keywords"],
                            "message": "📝 Session summary generated",
                            "timestamp": datetime.now().isoformat(),
                        },
                        block=False,
                    )
                except queue.Full:
                    print("⚠️ Stream queue full, dropping summary event")
            else:
                print(
                    f"❌ Failed to generate summary for session {session_id}: {result['error']}"
                )

                # Send error event via SSE
                try:
                    stream_queue.put(
                        {
                            "type": "session_summary_error",
                            "session_id": session_id,
                            "error": result["error"],
                            "message": "❌ Failed to generate session summary",
                            "timestamp": datetime.now().isoformat(),
                        },
                        block=False,
                    )
                except queue.Full:
                    print("⚠️ Stream queue full, dropping summary error event")

        except Exception as e:
            print(f"❌ Error in summary generation thread: {e}")

    # Start summary generation in a separate thread to avoid blocking the stop response
    summary_thread = threading.Thread(target=_generate_summary, daemon=True)
    summary_thread.start()


def find_available_port(start_port=5001, max_attempts=10):
    """Find an available port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        try:
            # Try to bind to the port to check if it's available
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', port))
                return port
        except OSError:
            # Port is in use, try the next one
            continue

    # If no port found in range, raise an exception
    raise RuntimeError(f"No available port found in range {start_port}-{start_port + max_attempts - 1}")


if __name__ == "__main__":
    # Initialize database
    init_database()

    # Find an available port
    try:
        port = find_available_port(start_port=5001, max_attempts=10)
        print("🎯 ChatGPT Voice Mode Transcript Recorder")
        print("=" * 50)
        print("Starting Flask server with SSE...")
        print(f"Open http://localhost:{port} in your browser")
        print(f"SSE stream available at http://localhost:{port}/stream")
        print("=" * 50)

        # Run the app (regular Flask, no SocketIO)
        app.run(debug=True, host="0.0.0.0", port=port, threaded=True)

    except RuntimeError as e:
        print(f"❌ Error starting server: {e}")
        print("Please check that ports 5001-5010 are not all in use by other applications.")
        exit(1)
