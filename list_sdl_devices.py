#!/usr/bin/env python3
"""
Simple script to list SDL devices that whisper.cpp can see
"""

import os
import re
import subprocess


def list_sdl_devices():
    """Get SDL device list from whisper.cpp"""

    stream_binary = "./whisper.cpp/build/bin/whisper-stream"
    model_path = "./whisper.cpp/models/ggml-base.en.bin"

    if not os.path.exists(stream_binary):
        print(f"❌ whisper-stream not found at {stream_binary}")
        return []

    if not os.path.exists(model_path):
        print(f"❌ Model not found at {model_path}")
        return []

    # Run whisper-stream briefly to get device list
    cmd = [
        stream_binary,
        "-m",
        model_path,
        "-t",
        "1",
        "--step",
        "0",
        "--length",
        "1000",
        "-vth",
        "0.9",
    ]

    try:
        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )

        # Let it initialize and capture device enumeration
        import time

        time.sleep(3)
        process.terminate()

        output, _ = process.communicate(timeout=5)

        # Parse SDL devices
        sdl_devices = []
        for line in output.split("\n"):
            if "Capture device #" in line:
                match = re.search(r"Capture device #(\d+): \'([^\']+)\'", line)
                if match:
                    device_id = int(match.group(1))
                    device_name = match.group(2)
                    sdl_devices.append((device_id, device_name))

        return sdl_devices

    except Exception as e:
        print(f"❌ Error: {e}")
        return []


def list_pyaudio_devices():
    """Get PyAudio device list for comparison"""
    try:
        import pyaudio

        audio = pyaudio.PyAudio()

        pyaudio_devices = []
        for i in range(audio.get_device_count()):
            try:
                device_info = audio.get_device_info_by_index(i)
                if device_info["maxInputChannels"] > 0:
                    pyaudio_devices.append((i, device_info["name"]))
            except Exception:
                pass

        audio.terminate()
        return pyaudio_devices

    except ImportError:
        print("⚠️  PyAudio not available")
        return []


def main():
    print("🔍 Audio Device Comparison")
    print("=" * 40)

    # SDL devices
    print("SDL Devices (whisper.cpp sees):")
    sdl_devices = list_sdl_devices()
    if sdl_devices:
        for device_id, device_name in sdl_devices:
            print(f"   {device_id}: {device_name}")
    else:
        print("   No SDL devices found")

    print()

    # PyAudio devices
    print("PyAudio Devices (Flask app sees):")
    pyaudio_devices = list_pyaudio_devices()
    if pyaudio_devices:
        for device_id, device_name in pyaudio_devices:
            print(f"   {device_id}: {device_name}")
    else:
        print("   No PyAudio devices found")

    print()
    print("=" * 40)
    print(f"SDL found: {len(sdl_devices)} devices")
    print(f"PyAudio found: {len(pyaudio_devices)} devices")


if __name__ == "__main__":
    main()
