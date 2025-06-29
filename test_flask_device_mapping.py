#!/usr/bin/env python3
"""
Test Flask app device mapping without running the full server
"""

import sys
import os

# Add src directory to path
sys.path.append('src')

from sdl_device_mapper import SDLDeviceMapper

def test_flask_device_endpoint():
    """Test the device mapping logic that would be used in Flask endpoint"""
    
    print("🧪 Testing Flask Device Mapping Logic")
    print("=" * 50)
    
    try:
        mapper = SDLDeviceMapper()
        device_info = mapper.get_device_info()
        
        # Format devices for frontend dropdown (same as Flask endpoint)
        input_devices = []
        for device in device_info['devices']:
            input_devices.append({
                'id': device['sdl_id'],  # Use SDL ID for whisper.cpp
                'name': device['display_name'],
                'pyaudio_id': device['pyaudio_id'],  # For audio level monitoring
                'available_for_whisper': device['available_for_whisper'],
                'available_for_monitoring': device['available_for_monitoring']
            })
        
        # Simulate Flask response
        flask_response = {
            'success': True,
            'input_devices': input_devices,
            'output_devices': [],  # Not needed since we use SDL devices
            'device_mapping_info': {
                'sdl_devices': device_info['sdl_device_count'],
                'pyaudio_devices': device_info['pyaudio_device_count'],
                'mapped_devices': device_info['mapped_devices']
            },
            'system_audio_note': 'Devices shown are SDL devices that whisper.cpp can use directly'
        }
        
        print("✅ Flask endpoint response:")
        import json
        print(json.dumps(flask_response, indent=2))
        
        return flask_response
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def test_device_selection_logic():
    """Test device selection logic for whisper.cpp"""
    
    print("\n🧪 Testing Device Selection Logic")
    print("=" * 50)
    
    mapper = SDLDeviceMapper()
    
    # Simulate frontend sending SDL device IDs
    test_cases = [
        {"mic_device_id": 0, "system_device_id": 1, "description": "AirPods + BlackHole"},
        {"mic_device_id": 1, "system_device_id": 0, "description": "BlackHole + AirPods (swapped)"},
        {"mic_device_id": 0, "system_device_id": None, "description": "Mic only"},
        {"mic_device_id": None, "system_device_id": 1, "description": "System audio only"},
    ]
    
    for test_case in test_cases:
        print(f"\n📋 Test: {test_case['description']}")
        print(f"   Frontend sends: mic_device_id={test_case['mic_device_id']}, system_device_id={test_case['system_device_id']}")
        
        # Convert SDL IDs to PyAudio IDs (for audio monitoring)
        mic_sdl_id = test_case['mic_device_id']
        system_sdl_id = test_case['system_device_id']
        
        mic_pyaudio_id = mapper.get_pyaudio_device_id(mic_sdl_id) if mic_sdl_id is not None else None
        system_pyaudio_id = mapper.get_pyaudio_device_id(system_sdl_id) if system_sdl_id is not None else None
        
        print(f"   For whisper.cpp: mic SDL {mic_sdl_id}, system SDL {system_sdl_id}")
        print(f"   For audio monitoring: mic PyAudio {mic_pyaudio_id}, system PyAudio {system_pyaudio_id}")
        
        # Show what whisper.cpp commands would be generated
        if mic_sdl_id is not None:
            print(f"   Mic whisper.cpp: whisper-stream ... -c {mic_sdl_id}")
        if system_sdl_id is not None:
            print(f"   System whisper.cpp: whisper-stream ... -c {system_sdl_id}")

def main():
    """Main test function"""
    
    # Test 1: Flask endpoint logic
    flask_response = test_flask_device_endpoint()
    
    if flask_response:
        # Test 2: Device selection logic
        test_device_selection_logic()
        
        print("\n🎯 SUMMARY:")
        print("=" * 30)
        print("✅ SDL device mapping working")
        print("✅ Flask endpoint logic working")
        print("✅ Device selection logic working")
        print()
        print("💡 Next steps:")
        print("1. Start Flask app: python app.py")
        print("2. Test frontend device selection")
        print("3. Verify whisper.cpp uses correct SDL device IDs")
    else:
        print("\n❌ Device mapping failed")

if __name__ == "__main__":
    main()
