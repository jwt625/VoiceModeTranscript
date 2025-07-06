/**
 * Device Module
 *
 * Handles audio device management, enumeration, selection, and audio level monitoring.
 * Manages both microphone and system audio device selection with SDL/PyAudio mapping.
 */
class DeviceModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('device', eventBus, stateStore, config);

        this.elements = {};
        this.audioLevelUpdateTimer = null;
        this.selectedMicDevice = null;
        this.selectedSystemDevice = null;
    }

    /**
     * Get default configuration for the device module
     */
    getDefaultConfig() {
        return {
            audioLevelUpdateInterval: 100,
            deviceRefreshInterval: 30000,
            autoSelectAirPods: true,
            autoSelectBlackHole: true
        };
    }

    /**
     * Get initial state for the device module
     */
    getInitialState() {
        return {
            availableDevices: {
                input: [],
                output: []
            },
            selectedMic: null,
            selectedSystem: null,
            audioLevels: {
                microphone: 0,
                system: 0
            },
            isLoading: false
        };
    }

    /**
     * Initialize the device module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();
        await this.loadAudioDevices();

        if (this.debugMode) {
            console.log('🔧 Device module initialized');
        }
    }

    /**
     * Clean up device module
     */
    async onDestroy() {
        this.stopAudioLevelUpdates();
    }

    /**
     * Set up event listeners for device events
     */
    setupEventListeners() {
        // Listen for device-related events
        this.on('device:refresh_requested', () => this.loadAudioDevices());
        this.on('device:selection_changed', (data) => this.handleDeviceSelectionChange(data));
        this.on('device:audio_level', (data) => this.updateAudioLevels(data));

        // Listen for SSE audio level events
        this.on('sse:audio_level', (data) => this.updateAudioLevels(data));

        // Listen for recording events to manage audio levels
        this.on('recording:started', () => this.startAudioLevelUpdates());
        this.on('recording:stopped', () => this.stopAudioLevelUpdates());
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Device selection elements
        this.elements.micDeviceSelect = document.getElementById('mic-device-select');
        this.elements.systemDeviceSelect = document.getElementById('system-device-select');
        this.elements.refreshDevicesBtn = document.getElementById('refresh-devices-btn');

        // Audio level elements
        this.elements.micLevel = document.getElementById('mic-level');
        this.elements.systemLevel = document.getElementById('system-level');

        // Set up device selection event listeners
        this.setupDeviceEventListeners();
    }

    /**
     * Set up device selection event listeners
     */
    setupDeviceEventListeners() {
        if (this.elements.micDeviceSelect) {
            this.elements.micDeviceSelect.addEventListener('change', () => {
                this.onDeviceSelectionChange();
            });
        }

        if (this.elements.systemDeviceSelect) {
            this.elements.systemDeviceSelect.addEventListener('change', () => {
                this.onDeviceSelectionChange();
            });
        }

        if (this.elements.refreshDevicesBtn) {
            this.elements.refreshDevicesBtn.addEventListener('click', () => {
                this.emit('device:refresh_requested');
            });
        }
    }

    /**
     * Load available audio devices
     */
    async loadAudioDevices() {
        console.log('🔄 Loading audio devices...');
        this.setState('isLoading', true);

        try {
            const response = await fetch('/api/audio-devices');
            const data = await response.json();

            if (data.success) {
                this.setState('availableDevices', {
                    input: data.input_devices || [],
                    output: data.output_devices || []
                });

                this.populateDeviceDropdowns(data.input_devices, data.output_devices);
                console.log('✅ Audio devices loaded successfully');

                this.emit('device:devices_loaded', {
                    inputDevices: data.input_devices,
                    outputDevices: data.output_devices
                });
            } else {
                console.error('❌ Failed to load audio devices:', data.error);
                this.emit('ui:notification', {
                    type: 'error',
                    message: 'Failed to load audio devices: ' + data.error
                });
            }
        } catch (error) {
            console.error('❌ Error loading audio devices:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Error loading audio devices: ' + error.message
            });
        } finally {
            this.setState('isLoading', false);
        }
    }

    /**
     * Populate device dropdown menus
     */
    populateDeviceDropdowns(inputDevices, outputDevices) {
        this.populateMicrophoneDevices(inputDevices);
        this.populateSystemAudioDevices(inputDevices, outputDevices);
    }

    /**
     * Populate microphone device dropdown
     */
    populateMicrophoneDevices(inputDevices) {
        if (!this.elements.micDeviceSelect) return;

        // Clear existing options
        this.elements.micDeviceSelect.innerHTML = '';

        // Add default option for microphone
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Auto-detect microphone';
        this.elements.micDeviceSelect.appendChild(defaultOption);

        // Populate microphone devices (input devices)
        inputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;

            // Auto-select AirPods Pro if available and config allows
            if (this.config.autoSelectAirPods && device.name.toLowerCase().includes('airpods')) {
                option.selected = true;
                this.selectedMicDevice = device.id;
                this.setState('selectedMic', device.id);
            }

            this.elements.micDeviceSelect.appendChild(option);
        });

        if (this.debugMode) {
            console.log(`📱 Populated ${inputDevices.length} microphone devices`);
        }
    }

    /**
     * Populate system audio device dropdown
     */
    populateSystemAudioDevices(inputDevices, outputDevices) {
        if (!this.elements.systemDeviceSelect) return;

        // Clear existing options
        this.elements.systemDeviceSelect.innerHTML = '';

        // Add default option for system audio
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'No system audio';
        this.elements.systemDeviceSelect.appendChild(defaultOption);

        // First, add loopback devices from input devices
        inputDevices.forEach(device => {
            const deviceName = device.name.toLowerCase();
            if (deviceName.includes('blackhole') || deviceName.includes('soundflower') || deviceName.includes('loopback')) {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name} (Loopback Input)`;

                // Auto-select BlackHole if available and config allows
                if (this.config.autoSelectBlackHole && deviceName.includes('blackhole')) {
                    option.selected = true;
                    this.selectedSystemDevice = device.id;
                    this.setState('selectedSystem', device.id);
                }

                this.elements.systemDeviceSelect.appendChild(option);
            }
        });

        // Add separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- Direct Output Devices ---';
        this.elements.systemDeviceSelect.appendChild(separator);

        // Add output devices as system audio sources (for direct capture)
        outputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = `output_${device.id}`;
            option.textContent = `${device.name} (Direct Output)`;

            // Auto-select AirPods Pro if no loopback device was selected
            const deviceName = device.name.toLowerCase();
            if (this.config.autoSelectAirPods &&
                deviceName.includes('airpods') &&
                !this.elements.systemDeviceSelect.querySelector('option[selected]')) {
                option.selected = true;
                this.selectedSystemDevice = `output_${device.id}`;
                this.setState('selectedSystem', `output_${device.id}`);
            }

            this.elements.systemDeviceSelect.appendChild(option);
        });

        if (this.debugMode) {
            console.log(`📱 Populated system audio devices from ${inputDevices.length} input and ${outputDevices.length} output devices`);
        }
    }

    /**
     * Handle device selection change
     */
    onDeviceSelectionChange() {
        const micDeviceId = this.elements.micDeviceSelect?.value || '';
        const systemDeviceId = this.elements.systemDeviceSelect?.value || '';

        console.log(`🎛️ Device selection changed - Mic: ${micDeviceId || 'auto'}, System: ${systemDeviceId || 'none'}`);

        // Store selections
        this.selectedMicDevice = micDeviceId || null;
        this.selectedSystemDevice = systemDeviceId || null;

        this.setState('selectedMic', this.selectedMicDevice);
        this.setState('selectedSystem', this.selectedSystemDevice);

        // Emit device selection change event
        this.emit('device:selection_changed', {
            microphone: this.selectedMicDevice,
            system: this.selectedSystemDevice
        });

        // Check if recording is active and show message
        const isRecording = this.getGlobalState('recording.isRecording');
        if (isRecording) {
            this.emit('ui:notification', {
                type: 'info',
                message: 'Device changes will apply to the next recording session'
            });
        }
    }

    /**
     * Update audio levels display
     */
    updateAudioLevels(data) {
        if (this.debugMode) {
            console.log('🎚️ updateAudioLevels called with:', data);
        }

        if (data.microphone_level !== undefined) {
            const percentage = data.microphone_level * 100;
            if (this.elements.micLevel) {
                this.elements.micLevel.style.width = `${percentage}%`;
            }
            this.setState('audioLevels.microphone', data.microphone_level);

            if (this.debugMode) {
                console.log(`🎤 Setting mic level to ${percentage}%`);
            }
        }

        if (data.system_level !== undefined) {
            const percentage = data.system_level * 100;
            if (this.elements.systemLevel) {
                this.elements.systemLevel.style.width = `${percentage}%`;
            }
            this.setState('audioLevels.system', data.system_level);

            if (this.debugMode) {
                console.log(`🔊 Setting system level to ${percentage}%`);
            }
        }
    }

    /**
     * Start audio level updates
     */
    startAudioLevelUpdates() {
        if (this.audioLevelUpdateTimer) {
            this.stopAudioLevelUpdates();
        }

        // Note: Audio levels are received via SSE events, so we don't need to poll
        // This method is kept for potential future use or manual level requests
        if (this.debugMode) {
            console.log('🎚️ Audio level monitoring started (via SSE)');
        }
    }

    /**
     * Stop audio level updates
     */
    stopAudioLevelUpdates() {
        if (this.audioLevelUpdateTimer) {
            clearInterval(this.audioLevelUpdateTimer);
            this.audioLevelUpdateTimer = null;
        }

        // Reset audio levels to zero
        this.updateAudioLevels({
            microphone_level: 0,
            system_level: 0
        });

        if (this.debugMode) {
            console.log('🎚️ Audio level monitoring stopped');
        }
    }

    /**
     * Get current device selection
     */
    getDeviceSelection() {
        return {
            microphone: this.selectedMicDevice,
            system: this.selectedSystemDevice
        };
    }

    /**
     * Set device selection programmatically
     */
    setDeviceSelection(micDeviceId, systemDeviceId, triggerEvent = false) {
        if (this.elements.micDeviceSelect && micDeviceId !== undefined) {
            this.elements.micDeviceSelect.value = micDeviceId || '';
        }

        if (this.elements.systemDeviceSelect && systemDeviceId !== undefined) {
            this.elements.systemDeviceSelect.value = systemDeviceId || '';
        }

        // Only trigger the change event if explicitly requested
        if (triggerEvent) {
            this.onDeviceSelectionChange();
        }
    }

    /**
     * Get available devices
     */
    getAvailableDevices() {
        return this.getState('availableDevices');
    }

    /**
     * Get current audio levels
     */
    getAudioLevels() {
        return this.getState('audioLevels');
    }

    /**
     * Handle device selection change event from other modules
     */
    handleDeviceSelectionChange(data) {
        if (data.microphone !== undefined || data.system !== undefined) {
            // Set device selection without triggering the change event to prevent loops
            this.setDeviceSelection(data.microphone, data.system, false);
        }
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceModule;
} else {
    window.DeviceModule = DeviceModule;
}
