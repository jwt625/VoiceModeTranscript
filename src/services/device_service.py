"""Device management service."""

from typing import Optional

from ..audio_capture import AudioCapture
from ..config import get_config
from ..sdl_device_mapper import SDLDeviceMapper


class DeviceService:
    """Service for managing audio devices."""

    def __init__(self):
        """Initialize device service."""
        self.config = get_config()
        self.device_mapper = SDLDeviceMapper()
        self.audio_capture: Optional[AudioCapture] = AudioCapture()

    def get_available_devices(self) -> dict:
        """Get all available audio devices."""
        try:
            # Get SDL device info for whisper.cpp
            device_info = self.device_mapper.get_device_info()

            # Get PyAudio devices for audio level monitoring
            input_devices, output_devices = self.audio_capture.list_devices()

            return {
                "success": True,
                "input_devices": input_devices,
                "output_devices": output_devices,
                "device_mapping_info": {
                    "sdl_devices": device_info["sdl_device_count"],
                    "pyaudio_devices": device_info["pyaudio_device_count"],
                    "mapped_devices": device_info["mapped_devices"],
                },
                "sdl_devices": device_info["devices"],
                "system_audio_note": "Devices shown are SDL devices that whisper.cpp can use directly",
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def resolve_device_selection(
        self, mic_device_id: Optional[int], system_device_id: Optional[str]
    ) -> dict:
        """Resolve device selection and return SDL/PyAudio device IDs."""
        device_info = self.device_mapper.get_device_info()

        # Handle microphone device selection
        mic_sdl_id = None
        mic_pyaudio_id = None

        if mic_device_id is not None:
            # Find SDL device ID for microphone
            for device in device_info["devices"]:
                if device["pyaudio_id"] == mic_device_id:
                    mic_sdl_id = device["sdl_id"]
                    mic_pyaudio_id = device["pyaudio_id"]
                    break

        if mic_sdl_id is None:
            # Use default microphone (SDL device 0)
            mic_sdl_id = 0
            # Find corresponding PyAudio ID
            for device in device_info["devices"]:
                if device["sdl_id"] == 0:
                    mic_pyaudio_id = device["pyaudio_id"]
                    break

        # Handle system audio device selection
        system_sdl_id = None
        system_pyaudio_id = None
        is_output_device = False
        user_explicitly_disabled_system_audio = False

        if system_device_id is not None:
            if system_device_id == "disabled":
                user_explicitly_disabled_system_audio = True
            else:
                try:
                    # Parse system device selection
                    if system_device_id.startswith("output_"):
                        is_output_device = True
                        requested_system_device = int(
                            system_device_id.replace("output_", "")
                        )
                    else:
                        requested_system_device = int(system_device_id)

                    # Find SDL device ID for system audio
                    for device in device_info["devices"]:
                        if device["pyaudio_id"] == requested_system_device:
                            system_sdl_id = device["sdl_id"]
                            system_pyaudio_id = device["pyaudio_id"]
                            break
                except (ValueError, TypeError):
                    print(f"⚠️ Invalid system device ID: {system_device_id}")

        # Auto-detect BlackHole if no system device specified
        if system_sdl_id is None and not user_explicitly_disabled_system_audio:
            for device in device_info["devices"]:
                if "blackhole" in device["display_name"].lower():
                    system_sdl_id = device["sdl_id"]
                    system_pyaudio_id = device["pyaudio_id"]
                    print(
                        f"🔍 Auto-detected BlackHole: {device['display_name']} (SDL: {system_sdl_id})"
                    )
                    break

        return {
            "microphone": {
                "sdl_id": mic_sdl_id,
                "pyaudio_id": mic_pyaudio_id,
            },
            "system": {
                "sdl_id": system_sdl_id,
                "pyaudio_id": system_pyaudio_id,
                "is_output_device": is_output_device,
                "user_disabled": user_explicitly_disabled_system_audio,
            },
            "device_info": device_info,
        }

    def get_device_names(self, device_selection: dict) -> dict:
        """Get human-readable device names for logging."""
        device_info = device_selection["device_info"]

        # Get microphone name
        mic_name = "Default"
        mic_sdl_id = device_selection["microphone"]["sdl_id"]
        if mic_sdl_id is not None:
            for device in device_info["devices"]:
                if device["sdl_id"] == mic_sdl_id:
                    mic_name = device["display_name"]
                    break

        # Get system audio name
        sys_name = None
        system_sdl_id = device_selection["system"]["sdl_id"]
        if system_sdl_id is not None:
            for device in device_info["devices"]:
                if device["sdl_id"] == system_sdl_id:
                    sys_name = device["display_name"]
                    break

        return {
            "microphone": mic_name,
            "system": sys_name,
        }

    def configure_audio_capture(self, device_selection: dict) -> bool:
        """Configure audio capture for volume monitoring."""
        try:
            mic_pyaudio_id = device_selection["microphone"]["pyaudio_id"]
            system_pyaudio_id = device_selection["system"]["pyaudio_id"]

            self.audio_capture.set_devices(
                mic_device_id=mic_pyaudio_id, system_device_id=system_pyaudio_id
            )
            return True
        except Exception as e:
            print(f"⚠️ Error configuring audio capture: {e}")
            return False

    def get_audio_capture(self) -> Optional[AudioCapture]:
        """Get the audio capture instance."""
        return self.audio_capture
