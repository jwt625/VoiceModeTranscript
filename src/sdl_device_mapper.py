#!/usr/bin/env python3
"""
SDL Device Mapper
Maps between PyAudio devices (for audio level monitoring) and SDL devices (for whisper.cpp)
"""

import os
import re
import subprocess
from typing import Any, Optional

import pyaudio


class SDLDeviceMapper:
    def __init__(self):
        self.stream_binary = os.getenv(
            "WHISPER_STREAM_BINARY", "./whisper.cpp/build/bin/whisper-stream"
        )
        self.model_path = os.getenv(
            "WHISPER_MODEL_PATH", "./whisper.cpp/models/ggml-base.en.bin"
        )

    def get_sdl_devices(self) -> list[tuple[int, str]]:
        """Get SDL device list from whisper.cpp"""

        if not os.path.exists(self.stream_binary):
            print(f"❌ whisper-stream not found at {self.stream_binary}")
            return []

        if not os.path.exists(self.model_path):
            print(f"❌ Model not found at {self.model_path}")
            return []

        # Run whisper-stream briefly to get device list
        cmd = [
            self.stream_binary,
            "-m",
            self.model_path,
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
            print(f"❌ Error getting SDL devices: {e}")
            return []

    def get_pyaudio_devices(self) -> list[tuple[int, str]]:
        """Get PyAudio device list for audio level monitoring"""
        try:
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

        except Exception as e:
            print(f"❌ Error getting PyAudio devices: {e}")
            return []

    def create_device_mapping(self) -> dict[str, Any]:
        """Create mapping between SDL and PyAudio devices"""
        sdl_devices = self.get_sdl_devices()
        pyaudio_devices = self.get_pyaudio_devices()

        mapping: dict[str, Any] = {
            "sdl_devices": sdl_devices,
            "pyaudio_devices": pyaudio_devices,
            "sdl_to_pyaudio": {},
            "pyaudio_to_sdl": {},
        }

        # Create name-based mapping
        for sdl_id, sdl_name in sdl_devices:
            # Find matching PyAudio device by name
            for pa_id, pa_name in pyaudio_devices:
                if self._names_match(sdl_name, pa_name):
                    mapping["sdl_to_pyaudio"][sdl_id] = pa_id
                    mapping["pyaudio_to_sdl"][pa_id] = sdl_id
                    break

        return mapping

    def _names_match(self, sdl_name: str, pyaudio_name: str) -> bool:
        """Check if SDL and PyAudio device names refer to the same device"""
        # Normalize names for comparison
        sdl_norm = sdl_name.lower().strip()
        pa_norm = pyaudio_name.lower().strip()

        # Direct match
        if sdl_norm == pa_norm:
            return True

        # Partial match (one contains the other)
        if sdl_norm in pa_norm or pa_norm in sdl_norm:
            return True

        # Handle common variations
        # Remove common prefixes/suffixes
        for prefix in ["???'s ", "built-in ", "external "]:
            sdl_norm = sdl_norm.replace(prefix.lower(), "")
            pa_norm = pa_norm.replace(prefix.lower(), "")

        return sdl_norm == pa_norm

    def get_sdl_device_id(self, pyaudio_device_id: Optional[int]) -> Optional[int]:
        """Convert PyAudio device ID to SDL device ID"""
        if pyaudio_device_id is None:
            return None

        mapping = self.create_device_mapping()
        result = mapping["pyaudio_to_sdl"].get(pyaudio_device_id)
        return result if isinstance(result, int) else None

    def get_pyaudio_device_id(self, sdl_device_id: Optional[int]) -> Optional[int]:
        """Convert SDL device ID to PyAudio device ID"""
        if sdl_device_id is None:
            return None

        mapping = self.create_device_mapping()
        result = mapping["sdl_to_pyaudio"].get(sdl_device_id)
        return result if isinstance(result, int) else None

    def get_device_info(self) -> dict:
        """Get comprehensive device information for frontend"""
        mapping = self.create_device_mapping()

        # Create device list for frontend with both SDL and PyAudio info
        devices = []
        for sdl_id, sdl_name in mapping["sdl_devices"]:
            pyaudio_id = mapping["sdl_to_pyaudio"].get(sdl_id)

            device_info = {
                "sdl_id": sdl_id,
                "sdl_name": sdl_name,
                "pyaudio_id": pyaudio_id,
                "display_name": sdl_name,  # Use SDL name for display
                "available_for_whisper": True,
                "available_for_monitoring": pyaudio_id is not None,
            }
            devices.append(device_info)

        return {
            "devices": devices,
            "sdl_device_count": len(mapping["sdl_devices"]),
            "pyaudio_device_count": len(mapping["pyaudio_devices"]),
            "mapped_devices": len(mapping["sdl_to_pyaudio"]),
        }


# Test function
def test_device_mapping():
    """Test the device mapping functionality"""
    print("🔍 Testing SDL Device Mapping")
    print("=" * 40)

    mapper = SDLDeviceMapper()
    device_info = mapper.get_device_info()

    print(f"SDL devices: {device_info['sdl_device_count']}")
    print(f"PyAudio devices: {device_info['pyaudio_device_count']}")
    print(f"Mapped devices: {device_info['mapped_devices']}")
    print()

    print("Available devices:")
    for device in device_info["devices"]:
        whisper_status = "✅" if device["available_for_whisper"] else "❌"
        monitor_status = "✅" if device["available_for_monitoring"] else "❌"
        print(f"   SDL {device['sdl_id']}: {device['sdl_name']}")
        print(f"      PyAudio ID: {device['pyaudio_id']}")
        print(f"      Whisper: {whisper_status} | Monitoring: {monitor_status}")
        print()


if __name__ == "__main__":
    test_device_mapping()
