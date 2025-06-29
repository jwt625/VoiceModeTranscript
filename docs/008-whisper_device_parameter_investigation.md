# Whisper.cpp Device Parameter Investigation

**Date:** 2025-06-28  
**Status:** Investigation in Progress  
**Issue:** Whisper.cpp appears to ignore `-c` device parameter and always captures from microphone

## Problem Description

During implementation of dual audio source transcription (microphone + system audio), we discovered that whisper.cpp may be ignoring the `-c` (capture device) parameter and always listening to the default microphone, regardless of which audio device is specified.

## Observed Behavior

### Expected Behavior
- **Microphone whisper.cpp instance**: `whisper-stream -c 2` should capture from device 2 (AirPods Pro)
- **System audio whisper.cpp instance**: `whisper-stream -c 4` should capture from device 4 (BlackHole)
- **Result**: Different transcripts from different audio sources

### Actual Behavior
- **Both whisper.cpp instances** produce identical transcripts when user speaks into microphone
- **System audio levels** show correct activity in Flask app (BlackHole receiving audio)
- **Audio device enumeration** works correctly (devices are properly identified)
- **Both processes start successfully** with different `-c` parameters

## Evidence

### 1. Process Verification
```bash
ps aux | grep whisper
# Shows two processes running with different device parameters:
# whisper-stream ... -c 2  (microphone)
# whisper-stream ... -c 4  (system audio)
```

### 2. Transcript Output
When user speaks into microphone, both sources produce transcripts:
- 🎤 **User** (device 2): "Test, test, can you tell a joke?"
- 🔊 **Assistant** (device 4): "Test, test, can you tell a joke?" ← **Should not happen**

### 3. Audio Level Monitoring
- ✅ **Microphone levels**: Show activity when speaking
- ✅ **System audio levels**: Show activity when system audio plays
- ✅ **Device detection**: Correctly identifies BlackHole vs AirPods Pro

## Device Configuration

### BlackHole Device Issue
Two BlackHole 2ch devices appear in system:
1. **BlackHole 2ch (Direct Output)** - Output device
2. **BlackHole 2ch (Loopback Input)** - Input device for capturing system audio

**Problem**: Both devices may appear as the same device ID (4) in audio enumeration, making it difficult to select the correct loopback input device.

### Current Device Selection Logic
```python
# Auto-detection priority:
1. Devices with "loopback" in name (highest priority)
2. BlackHole devices that are NOT "output"
3. Other system audio devices (soundflower, etc.)
```

## Hypothesis

**Primary Hypothesis**: Whisper.cpp `-c` parameter is not working as expected and both instances default to the system's default microphone input.

**Secondary Hypothesis**: The BlackHole device being selected (device 4) is not the correct loopback input device.

## Investigation Steps

### Completed
- [x] Verified both whisper.cpp processes are running with different `-c` parameters
- [x] Confirmed audio level monitoring works for both sources
- [x] Tested device enumeration and selection logic
- [x] Implemented dual whisper.cpp architecture with proper audio source labeling

### Next Steps
- [ ] Test whisper.cpp device parameter behavior in isolation
- [ ] Verify which BlackHole device is the actual loopback input
- [ ] Test with manual device ID specification
- [ ] Investigate whisper.cpp documentation for device parameter usage
- [ ] Consider alternative approaches (separate audio routing, different tools)

## Technical Details

### Whisper.cpp Command Structure
```bash
# Microphone instance
./whisper.cpp/build/bin/whisper-stream \
  -m ./whisper.cpp/models/ggml-base.en.bin \
  -t 6 --step 0 --length 30000 -vth 0.6 \
  -c 2

# System audio instance  
./whisper.cpp/build/bin/whisper-stream \
  -m ./whisper.cpp/models/ggml-base.en.bin \
  -t 6 --step 0 --length 30000 -vth 0.6 \
  -c 4
```

### Audio Device Enumeration
```
📋 Available input devices:
   Device 0: Built-in Microphone
   Device 1: [Other device]
   Device 2: AirPods Pro
   Device 3: [Other device]
   Device 4: BlackHole 2ch
   Device 5: [Potentially another BlackHole variant]
```

## Potential Solutions

### Option 1: Fix Device Parameter
- Investigate whisper.cpp source code for device parameter handling
- Test with different audio frameworks (PortAudio, ALSA, etc.)
- Verify device ID mapping between system and whisper.cpp

### Option 2: Alternative Audio Routing
- Use system-level audio routing (Audio MIDI Setup)
- Implement separate audio capture processes
- Route audio through different virtual devices

### Option 3: Single Source with Post-Processing
- Use single whisper.cpp instance
- Implement audio source detection in post-processing
- Use timing and context clues to separate user vs system audio

## Impact on Project

### Current Status
- ✅ **Audio source labeling infrastructure** is complete
- ✅ **Database schema** supports dual audio sources
- ✅ **Frontend display** shows proper source indicators
- ✅ **LLM processing** understands speaker roles
- ❌ **Actual dual audio capture** is not working due to device parameter issue

### Workaround
Currently using single audio source (microphone) with proper labeling infrastructure in place. System audio transcription can be enabled once device parameter issue is resolved.

## References

- [Whisper.cpp Documentation](https://github.com/ggerganov/whisper.cpp)
- [BlackHole Audio Driver](https://github.com/ExistentialAudio/BlackHole)
- [macOS Audio Unit Documentation](https://developer.apple.com/documentation/audiotoolbox)

---

**Last Updated:** 2025-06-28  
**Next Review:** After device parameter testing is complete
