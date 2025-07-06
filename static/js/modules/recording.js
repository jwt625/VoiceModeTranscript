/**
 * Recording Module
 *
 * Handles recording control and state management including start/stop/pause/resume
 * operations, duration tracking, session management, and recording event coordination.
 */
class RecordingModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('recording', eventBus, stateStore, config);

        this.elements = {};
        this.durationTimer = null;
    }

    /**
     * Get default configuration for the recording module
     */
    getDefaultConfig() {
        return {
            durationUpdateInterval: 1000,
            autoSaveInterval: 30000,
            enableMobilePermissionCheck: true
        };
    }

    /**
     * Get initial state for the recording module
     */
    getInitialState() {
        return {
            isRecording: false,
            isPaused: false,
            sessionId: null,
            startTime: null,
            duration: 0,
            status: 'ready'
        };
    }

    /**
     * Initialize the recording module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();

        if (this.debugMode) {
            console.log('🔧 Recording module initialized');
        }
    }

    /**
     * Clean up recording module
     */
    async onDestroy() {
        this.stopDurationTimer();
        this.removeExistingEventListeners();
    }

    /**
     * Set up event listeners for recording events
     */
    setupEventListeners() {
        // Listen for recording control events
        this.on('recording:start_requested', () => this.startRecording());
        this.on('recording:stop_requested', () => this.stopRecording());
        this.on('recording:pause_requested', () => this.pauseRecording());
        this.on('recording:resume_requested', () => this.resumeRecording());
        this.on('recording:clear_requested', () => this.clearTranscripts());

        // Listen for keyboard shortcuts from utils module
        this.on('recording:toggle_pause_resume', () => this.togglePauseResume());

        // Listen for SSE events
        this.on('recording:sse_event', (data) => this.handleSSEEvent(data));
        this.on('recording:whisper_error', (data) => this.handleWhisperError(data));

        // Listen for state sync events
        this.on('app:validate_state_sync', (data) => this.validateStateSync(data));
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Recording control buttons
        this.elements.startBtn = document.getElementById('start-btn');
        this.elements.pauseBtn = document.getElementById('pause-btn');
        this.elements.resumeBtn = document.getElementById('resume-btn');
        this.elements.stopBtn = document.getElementById('stop-btn');
        this.elements.clearBtn = document.getElementById('clear-btn');

        // Session info elements
        this.elements.sessionIdSpan = document.getElementById('session-id');
        this.elements.durationSpan = document.getElementById('duration');

        // Set up button event listeners
        this.setupButtonEventListeners();
    }

    /**
     * Set up button event listeners
     */
    setupButtonEventListeners() {
        // Remove any existing listeners to prevent duplicates
        this.removeExistingEventListeners();

        if (this.elements.startBtn) {
            this.startBtnHandler = () => this.emit('recording:start_requested');
            this.elements.startBtn.addEventListener('click', this.startBtnHandler);
        }

        if (this.elements.pauseBtn) {
            this.pauseBtnHandler = () => this.emit('recording:pause_requested');
            this.elements.pauseBtn.addEventListener('click', this.pauseBtnHandler);
        }

        if (this.elements.resumeBtn) {
            this.resumeBtnHandler = () => this.emit('recording:resume_requested');
            this.elements.resumeBtn.addEventListener('click', this.resumeBtnHandler);
        }

        if (this.elements.stopBtn) {
            this.stopBtnHandler = () => this.emit('recording:stop_requested');
            this.elements.stopBtn.addEventListener('click', this.stopBtnHandler);
        }

        if (this.elements.clearBtn) {
            this.clearBtnHandler = () => this.emit('recording:clear_requested');
            this.elements.clearBtn.addEventListener('click', this.clearBtnHandler);
        }
    }

    /**
     * Remove existing event listeners to prevent duplicates
     */
    removeExistingEventListeners() {
        if (this.elements.startBtn && this.startBtnHandler) {
            this.elements.startBtn.removeEventListener('click', this.startBtnHandler);
        }
        if (this.elements.pauseBtn && this.pauseBtnHandler) {
            this.elements.pauseBtn.removeEventListener('click', this.pauseBtnHandler);
        }
        if (this.elements.resumeBtn && this.resumeBtnHandler) {
            this.elements.resumeBtn.removeEventListener('click', this.resumeBtnHandler);
        }
        if (this.elements.stopBtn && this.stopBtnHandler) {
            this.elements.stopBtn.removeEventListener('click', this.stopBtnHandler);
        }
        if (this.elements.clearBtn && this.clearBtnHandler) {
            this.elements.clearBtn.removeEventListener('click', this.clearBtnHandler);
        }
    }

    /**
     * Start recording
     */
    async startRecording() {
        try {
            // Check if already recording
            if (this.getState('isRecording')) {
                console.warn('Already recording');
                return;
            }

            // Clear any session viewing mode and transcripts for safety
            this.emit('app:exit_session_viewing_mode');
            this.emit('transcript:clear_requested');

            this.emit('ui:status_updated', { status: 'recording', message: 'Starting...' });
            this.emit('ui:button_state_updated', { buttonId: 'startBtn', disabled: true });

            // Request microphone permission for mobile devices
            if (this.config.enableMobilePermissionCheck) {
                const isMobile = this.getGlobalState('utils.isMobile');
                if (isMobile) {
                    const permissionGranted = await this.requestMicrophonePermission();
                    if (!permissionGranted) {
                        this.handleRecordingError('Microphone access denied');
                        return;
                    }
                }
            }

            // Prepare device selection data - read directly from dropdowns (like original app)
            const micDeviceSelect = document.getElementById('mic-device-select');
            const systemDeviceSelect = document.getElementById('system-device-select');

            const micDeviceId = micDeviceSelect?.value;
            const systemDeviceId = systemDeviceSelect?.value;

            console.log('🔍 Current dropdown values - Mic:', micDeviceId, 'System:', systemDeviceId);

            const deviceData = {};
            if (micDeviceId) {
                deviceData.mic_device_id = parseInt(micDeviceId);
            }
            if (systemDeviceId) {
                // Don't parse output device IDs (they're strings like "output_3")
                if (systemDeviceId.startsWith('output_')) {
                    deviceData.system_device_id = systemDeviceId;
                } else {
                    deviceData.system_device_id = parseInt(systemDeviceId);
                }
            }

            // TEMPORARY DEBUG: If no devices selected, let server auto-detect
            // This matches the monolithic behavior where empty deviceData is sent
            console.log('🔍 Device data being sent:', deviceData);
            console.log('🔍 Will let server auto-detect devices if empty');

            // Make API call to start recording
            const response = await fetch('/api/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });

            const result = await response.json();

            if (response.ok) {
                this.handleRecordingStarted({
                    session_id: result.session_id,
                    start_time: new Date().toISOString()
                });

                console.log('Recording started:', result);
            } else {
                // Don't immediately fail - wait for SSE confirmation
                // The server might have partial success (e.g., system audio works but mic fails)
                console.warn('API start failed, but waiting for SSE confirmation:', result.error);

                this.emit('ui:notification', {
                    type: 'warning',
                    message: 'Recording may have started with limited functionality: ' + (result.error || 'Unknown error')
                });

                // Set a timeout to fail if no SSE confirmation comes
                this.startConfirmationTimeout = setTimeout(() => {
                    if (!this.getState('isRecording')) {
                        this.handleRecordingError(result.error || 'Failed to start recording');
                    }
                }, 5000); // Wait 5 seconds for SSE confirmation
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            this.handleRecordingError(error.message);
        }
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        try {
            this.emit('ui:status_updated', { status: 'ready', message: 'Stopping...' });
            this.emit('ui:button_state_updated', { buttonId: 'stopBtn', disabled: true });

            // Finalize any current transcript message before stopping
            this.emit('transcript:finalize_current_message');

            const response = await fetch('/api/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.handleRecordingStopped({
                    session_id: this.getState('sessionId'),
                    stats: result.stats
                });

                console.log('Recording stopped:', result);
            } else {
                throw new Error(result.error || 'Failed to stop recording');
            }

        } catch (error) {
            console.error('Error stopping recording:', error);
            this.handleRecordingError(error.message);
        }
    }

    /**
     * Pause recording
     */
    async pauseRecording() {
        try {
            if (!this.getState('isRecording') || this.getState('isPaused')) {
                console.warn('Cannot pause: not recording or already paused');
                return;
            }

            this.emit('ui:status_updated', { status: 'paused', message: 'Pausing...' });
            this.emit('ui:button_state_updated', { buttonId: 'pauseBtn', disabled: true });

            const response = await fetch('/api/pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.handleRecordingPaused();
                console.log('Recording paused:', result);
            } else {
                throw new Error(result.error || 'Failed to pause recording');
            }

        } catch (error) {
            console.error('Error pausing recording:', error);
            this.handleRecordingError(error.message);
        }
    }

    /**
     * Resume recording
     */
    async resumeRecording() {
        try {
            if (!this.getState('isRecording') || !this.getState('isPaused')) {
                console.warn('Cannot resume: not recording or not paused');
                return;
            }

            this.emit('ui:status_updated', { status: 'recording', message: 'Resuming...' });
            this.emit('ui:button_state_updated', { buttonId: 'resumeBtn', disabled: true });

            const response = await fetch('/api/resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.handleRecordingResumed();
                console.log('Recording resumed:', result);
            } else {
                throw new Error(result.error || 'Failed to resume recording');
            }

        } catch (error) {
            console.error('Error resuming recording:', error);
            this.handleRecordingError(error.message);
        }
    }

    /**
     * Toggle pause/resume based on current state
     */
    togglePauseResume() {
        if (!this.getState('isRecording')) {
            return;
        }

        if (this.getState('isPaused')) {
            this.resumeRecording();
        } else {
            this.pauseRecording();
        }
    }

    /**
     * Clear transcripts
     */
    clearTranscripts() {
        this.emit('transcript:clear_requested');
    }

    /**
     * Request microphone permission for mobile devices
     */
    async requestMicrophonePermission() {
        console.log('🎤 Mobile device detected - requesting microphone permission...');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone permission granted');

            // Stop the test stream immediately
            stream.getTracks().forEach(track => track.stop());

            this.emit('ui:notification', {
                type: 'success',
                message: 'Microphone access granted! Starting recording...'
            });

            return true;
        } catch (permissionError) {
            console.error('❌ Microphone permission denied:', permissionError);

            this.emit('ui:notification', {
                type: 'error',
                message: 'Microphone access is required for recording. ' +
                        'Please allow microphone access and try again. ' +
                        'On mobile, you may need to refresh the page after granting permission.'
            });

            return false;
        }
    }

    /**
     * Handle recording started
     */
    handleRecordingStarted(data) {
        // Clear any pending confirmation timeout
        if (this.startConfirmationTimeout) {
            clearTimeout(this.startConfirmationTimeout);
            this.startConfirmationTimeout = null;
        }

        this.setState('isRecording', true);
        this.setState('isPaused', false);
        this.setState('sessionId', data.session_id);
        this.setState('startTime', data.start_time);
        this.setState('status', 'recording');

        this.startDurationTimer();

        // Update session display
        if (this.elements.sessionIdSpan) {
            this.elements.sessionIdSpan.textContent = data.session_id;
        }

        // Emit events for other modules
        this.emit('recording:started', data);
        this.emit('ui:status_updated', { status: 'recording', message: 'Recording' });

        if (this.debugMode) {
            console.log('🎤 Recording started:', data);
        }
    }

    /**
     * Handle recording stopped
     */
    handleRecordingStopped(data) {
        this.setState('isRecording', false);
        this.setState('isPaused', false);
        this.setState('sessionId', null);
        this.setState('startTime', null);
        this.setState('status', 'ready');

        this.stopDurationTimer();

        // Update button states to match original app
        this.emit('ui:button_state_updated', { buttonId: 'startBtn', disabled: false });
        this.emit('ui:button_state_updated', { buttonId: 'pauseBtn', disabled: true, visible: true });
        this.emit('ui:button_state_updated', { buttonId: 'resumeBtn', disabled: true, visible: false });
        this.emit('ui:button_state_updated', { buttonId: 'stopBtn', disabled: true });

        // Emit events for other modules
        this.emit('recording:stopped', data);
        this.emit('ui:status_updated', { status: 'ready', message: 'Ready' });

        if (this.debugMode) {
            console.log('🛑 Recording stopped:', data);
        }
    }

    /**
     * Handle recording paused
     */
    handleRecordingPaused() {
        this.setState('isPaused', true);
        this.setState('status', 'paused');

        // Emit events for other modules
        this.emit('recording:paused');
        this.emit('ui:status_updated', { status: 'paused', message: 'Paused' });

        if (this.debugMode) {
            console.log('⏸️ Recording paused');
        }
    }

    /**
     * Handle recording resumed
     */
    handleRecordingResumed() {
        this.setState('isPaused', false);
        this.setState('status', 'recording');

        // Emit events for other modules
        this.emit('recording:resumed');
        this.emit('ui:status_updated', { status: 'recording', message: 'Recording' });

        if (this.debugMode) {
            console.log('▶️ Recording resumed');
        }
    }

    /**
     * Handle recording error
     */
    handleRecordingError(errorMessage) {
        this.setState('status', 'error');

        // Re-enable start button
        this.emit('ui:button_state_updated', { buttonId: 'startBtn', disabled: false });

        // Show error message
        this.emit('ui:notification', {
            type: 'error',
            message: errorMessage
        });

        this.emit('ui:status_updated', { status: 'error', message: 'Error: ' + errorMessage });

        if (this.debugMode) {
            console.error('❌ Recording error:', errorMessage);
        }
    }

    /**
     * Start duration timer
     */
    startDurationTimer() {
        if (this.durationTimer) {
            this.stopDurationTimer();
        }

        this.durationTimer = setInterval(() => {
            const startTime = this.getState('startTime');
            if (startTime) {
                const elapsed = Math.floor((new Date() - new Date(startTime)) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const formattedDuration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                this.setState('duration', elapsed);

                if (this.elements.durationSpan) {
                    this.elements.durationSpan.textContent = formattedDuration;
                }
            }
        }, this.config.durationUpdateInterval);
    }

    /**
     * Stop duration timer
     */
    stopDurationTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
            this.durationTimer = null;
        }

        this.setState('duration', 0);

        if (this.elements.durationSpan) {
            this.elements.durationSpan.textContent = '00:00';
        }
    }

    /**
     * Handle SSE events related to recording
     */
    handleSSEEvent(data) {
        switch (data.type) {
            case 'recording_started':
                this.handleRecordingStarted(data);
                break;
            case 'recording_stopped':
                this.handleRecordingStopped(data);
                break;
            case 'recording_paused':
                this.handleRecordingPaused();
                break;
            case 'recording_resumed':
                this.handleRecordingResumed();
                break;
            default:
                if (this.debugMode) {
                    console.log('❓ Unknown recording SSE event:', data.type);
                }
        }
    }

    /**
     * Handle whisper error (matches monolithic implementation)
     */
    handleWhisperError(data) {
        this.emit('ui:notification', {
            type: 'error',
            message: 'Whisper error: ' + data.message
        });
        this.emit('ui:status_updated', { status: 'error', message: 'Error' });
    }

    /**
     * Handle whisper error events
     */
    handleWhisperError(data) {
        console.log('❌ Whisper error:', data);

        this.emit('ui:notification', {
            type: 'error',
            message: 'Whisper error: ' + (data.message || 'Unknown error')
        });

        // Update status to show error
        this.emit('ui:status_updated', {
            status: 'error',
            message: 'Whisper Error'
        });

        // If recording was in progress, stop it
        if (this.getState('isRecording')) {
            this.handleRecordingError('Whisper processing failed: ' + (data.message || 'Unknown error'));
        }
    }

    /**
     * Validate state sync with server
     */
    validateStateSync(serverState) {
        const clientRecording = this.getState('isRecording');
        const serverRecording = serverState.is_recording;

        if (clientRecording !== serverRecording) {
            console.warn('⚠️ Recording state mismatch detected!');
            console.warn(`Client: ${clientRecording ? 'recording' : 'not recording'}`);
            console.warn(`Server: ${serverRecording ? 'recording' : 'not recording'}`);

            // Sync with server state
            this.updateRecordingState(serverState);

            // Show user notification
            const message = serverRecording
                ? 'Synchronized with ongoing recording session'
                : 'Recording session ended, state synchronized';

            this.emit('ui:notification', {
                type: 'info',
                message: message
            });
        }
    }

    /**
     * Update recording state from server
     */
    updateRecordingState(serverState) {
        if (serverState.is_recording) {
            this.setState('isRecording', true);
            this.setState('sessionId', serverState.session_id);
            this.setState('startTime', serverState.start_time);
            this.setState('status', 'recording');

            this.startDurationTimer();

            // Update session display
            if (this.elements.sessionIdSpan) {
                this.elements.sessionIdSpan.textContent = serverState.session_id;
            }

            // Emit event for other modules
            this.emit('recording:state_synced', serverState);
        } else {
            this.setState('isRecording', false);
            this.setState('sessionId', null);
            this.setState('startTime', null);
            this.setState('status', 'ready');

            this.stopDurationTimer();

            // Emit event for other modules
            this.emit('recording:state_synced', serverState);
        }
    }

    /**
     * Get current recording status
     */
    getRecordingStatus() {
        return {
            isRecording: this.getState('isRecording'),
            isPaused: this.getState('isPaused'),
            sessionId: this.getState('sessionId'),
            startTime: this.getState('startTime'),
            duration: this.getState('duration'),
            status: this.getState('status')
        };
    }

    /**
     * Check if currently recording
     */
    isRecording() {
        return this.getState('isRecording');
    }

    /**
     * Check if currently paused
     */
    isPaused() {
        return this.getState('isPaused');
    }

    /**
     * Get current session ID
     */
    getCurrentSessionId() {
        return this.getState('sessionId');
    }

    /**
     * Get recording duration in seconds
     */
    getDuration() {
        return this.getState('duration');
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecordingModule;
} else {
    window.RecordingModule = RecordingModule;
}
