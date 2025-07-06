/**
 * LLM Module
 *
 * Handles LLM processing functionality including manual processing triggers,
 * auto-processing management, processing status tracking, and LLM event coordination.
 */
class LLMModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('llm', eventBus, stateStore, config);

        this.elements = {};
        this.autoProcessingTimer = null;
        this.processingTimer = null;
        this.processingStartTime = null;
    }

    /**
     * Get default configuration for the LLM module
     */
    getDefaultConfig() {
        return {
            autoProcessingInterval: 120000, // 2 minutes
            processingTimeout: 60000,
            maxRetries: 3,
            enableAutoProcessing: true,
            intervalOptions: [120000, 300000, 600000] // 2min, 5min, 10min
        };
    }

    /**
     * Get initial state for the LLM module
     */
    getInitialState() {
        return {
            isProcessing: false,
            currentJob: null,
            autoProcessingEnabled: true, // Default to true to match HTML
            autoProcessingInterval: 120000, // Default to 2 minutes (2 * 60 * 1000)
            processingStartTime: null,
            queueStatus: {
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0
            }
        };
    }

    /**
     * Initialize the LLM module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializeAutoProcessing();

        if (this.debugMode) {
            console.log('🔧 LLM module initialized');
        }
    }

    /**
     * Clean up LLM module
     */
    async onDestroy() {
        this.stopAutoProcessing();
        this.stopProcessingTimer();
    }

    /**
     * Set up event listeners for LLM events
     */
    setupEventListeners() {
        // Listen for LLM processing requests
        this.on('llm:manual_process_requested', () => this.processTranscriptsManually());
        this.on('llm:auto_processing_triggered', () => this.handleAutoProcessingTriggered());

        // Listen for SSE events
        this.on('llm:sse_event', (data) => this.handleSSEEvent(data));

        // Listen for transcript availability
        this.on('llm:transcripts_available', (data) => this.handleTranscriptsAvailable(data));

        // Listen for recording events to manage auto-processing
        this.on('recording:started', () => this.handleRecordingStarted());
        this.on('recording:stopped', () => this.handleRecordingStopped());

        // Listen for auto-processing control events
        this.on('llm:toggle_auto_processing', () => this.toggleAutoProcessing());
        this.on('llm:set_auto_processing_interval', (data) => this.setAutoProcessingInterval(data.interval));
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // LLM processing button
        this.elements.processLLMBtn = document.getElementById('process-llm-btn');

        // Status elements
        this.elements.llmStatusText = document.getElementById('llm-status-text');
        this.elements.llmSpinner = document.getElementById('llm-spinner');
        this.elements.llmProcessingStatus = document.getElementById('llm-processing-status');

        // Auto-processing controls
        this.elements.autoProcessingCheckbox = document.getElementById('auto-processing-enabled');
        this.elements.autoProcessingInterval = document.getElementById('auto-processing-interval');
        this.elements.autoProcessingStatus = document.getElementById('auto-processing-status');

        // Activity panel
        this.elements.llmActivity = document.getElementById('llm-activity');
        this.elements.currentJobInfo = document.getElementById('current-job-info');
        this.elements.processingTime = document.getElementById('processing-time');

        // Set up button event listeners
        this.setupButtonEventListeners();
    }

    /**
     * Set up button event listeners
     */
    setupButtonEventListeners() {
        if (this.elements.processLLMBtn) {
            this.elements.processLLMBtn.addEventListener('click', () => {
                this.emit('llm:manual_process_requested');
            });
        }

        if (this.elements.autoProcessingCheckbox) {
            this.elements.autoProcessingCheckbox.addEventListener('change', async () => {
                await this.toggleAutoProcessing();
            });
        }

        if (this.elements.autoProcessingInterval) {
            this.elements.autoProcessingInterval.addEventListener('change', async () => {
                const interval = parseInt(this.elements.autoProcessingInterval.value);
                await this.setAutoProcessingInterval(interval);
            });
        }
    }

    /**
     * Initialize auto-processing settings
     */
    async initializeAutoProcessing() {
        // Load settings from server first
        await this.loadAutoProcessingSettings();

        // Update status display
        this.updateAutoProcessingStatus();
    }

    /**
     * Process transcripts manually
     */
    async processTranscriptsManually() {
        try {
            // Check if already processing
            if (this.getState('isProcessing')) {
                this.emit('ui:notification', {
                    type: 'warning',
                    message: 'LLM processing is already in progress'
                });
                return;
            }

            // Get transcript count
            const transcriptCounts = this.getGlobalState('transcript') || {};
            const rawCount = transcriptCounts.rawCount || 0;

            if (rawCount === 0) {
                this.emit('ui:notification', {
                    type: 'warning',
                    message: 'No transcripts available for processing'
                });
                return;
            }

            // Update UI state
            this.setState('isProcessing', true);
            this.updateProcessingUI(true);

            console.log(`🤖 Starting manual LLM processing for ${rawCount} transcripts`);

            // Get session ID from recording module
            const sessionId = this.getGlobalState('recording.sessionId');

            // Make API call to process transcripts
            const response = await fetch('/api/process-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId
                })
            });

            const result = await response.json();

            if (response.ok) {
                console.log('🤖 LLM processing started:', result);

                this.emit('ui:notification', {
                    type: 'info',
                    message: `Queued ${result.transcript_count || rawCount} transcripts for LLM processing`
                });

                // Update queue status
                this.updateQueueStatus();
            } else {
                throw new Error(result.error || 'Failed to start LLM processing');
            }

        } catch (error) {
            console.error('❌ Error starting LLM processing:', error);
            this.handleProcessingError(error.message);
        }
    }

    /**
     * Handle LLM processing started
     */
    handleLLMProcessingStart(data) {
        this.setState('isProcessing', true);
        this.setState('currentJob', data.job_id);
        this.setState('processingStartTime', Date.now());

        this.processingStartTime = Date.now();

        // Update UI
        this.updateProcessingUI(true);

        const statusText = `Processing ${data.transcript_count} transcripts`;
        if (this.elements.llmProcessingStatus) {
            this.elements.llmProcessingStatus.textContent = statusText;
        }
        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = `🤖 ${statusText}...`;
        }

        // Show activity panel
        if (this.elements.llmActivity) {
            this.elements.llmActivity.style.display = 'block';
        }
        if (this.elements.currentJobInfo) {
            this.elements.currentJobInfo.textContent = `${data.transcript_count} transcripts`;
        }

        // Start processing timer
        this.startProcessingTimer();

        if (this.debugMode) {
            console.log('🤖 LLM processing started:', data);
        }
    }

    /**
     * Handle LLM processing completed
     */
    handleLLMProcessingComplete(data) {
        this.setState('isProcessing', false);
        this.setState('currentJob', null);
        this.setState('processingStartTime', null);

        // Calculate processing time
        const processingTime = this.processingStartTime
            ? (Date.now() - this.processingStartTime) / 1000
            : data.result?.processing_time || 0;

        // Update UI
        this.updateProcessingUI(false);

        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = `✅ Processing complete (${processingTime.toFixed(1)}s)`;
        }

        // Stop processing timer
        this.stopProcessingTimer();

        // Add processed transcript to transcript module
        if (data.result && data.result.status === 'success') {
            this.emit('transcript:processed_received', data.result);
        }

        this.emit('ui:notification', {
            type: 'success',
            message: `LLM processing completed in ${processingTime.toFixed(1)}s`
        });

        if (this.debugMode) {
            console.log('✅ LLM processing completed:', data);
        }
    }

    /**
     * Handle LLM processing error
     */
    handleLLMProcessingError(data) {
        this.setState('isProcessing', false);
        this.setState('currentJob', null);
        this.setState('processingStartTime', null);

        // Update UI
        this.updateProcessingUI(false);

        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = '❌ Processing failed';
        }

        // Stop processing timer
        this.stopProcessingTimer();

        const errorMessage = data.error || 'Unknown error occurred';
        this.emit('ui:notification', {
            type: 'error',
            message: 'LLM processing failed: ' + errorMessage
        });

        if (this.debugMode) {
            console.error('❌ LLM processing error:', data);
        }
    }

    /**
     * Update processing UI state
     */
    updateProcessingUI(isProcessing) {
        // Update button state
        if (this.elements.processLLMBtn) {
            this.elements.processLLMBtn.disabled = isProcessing;
        }

        // Update spinner
        if (this.elements.llmSpinner) {
            this.elements.llmSpinner.style.display = isProcessing ? 'inline-block' : 'none';
        }

        // Emit UI update event
        this.emit('ui:button_state_updated', {
            buttonId: 'processLLMBtn',
            disabled: isProcessing
        });
    }

    /**
     * Start processing timer
     */
    startProcessingTimer() {
        if (this.processingTimer) {
            this.stopProcessingTimer();
        }

        this.processingTimer = setInterval(() => {
            if (this.processingStartTime && this.elements.processingTime) {
                const elapsed = (Date.now() - this.processingStartTime) / 1000;
                this.elements.processingTime.textContent = `${elapsed.toFixed(1)}s`;
            }
        }, 100);
    }

    /**
     * Stop processing timer
     */
    stopProcessingTimer() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
        }

        if (this.elements.processingTime) {
            this.elements.processingTime.textContent = '0.0s';
        }
    }

    /**
     * Start auto-processing
     */
    startAutoProcessing() {
        if (!this.getState('autoProcessingEnabled')) {
            return;
        }

        this.stopAutoProcessing(); // Clear any existing timer

        const interval = this.getState('autoProcessingInterval');

        this.autoProcessingTimer = setInterval(() => {
            this.triggerAutoProcessing();
        }, interval);

        this.updateAutoProcessingStatus();

        if (this.debugMode) {
            console.log(`🤖 Auto-processing started with ${interval / 1000}s interval`);
        }
    }

    /**
     * Stop auto-processing
     */
    stopAutoProcessing() {
        if (this.autoProcessingTimer) {
            clearInterval(this.autoProcessingTimer);
            this.autoProcessingTimer = null;
        }

        this.updateAutoProcessingStatus();

        if (this.debugMode) {
            console.log('🤖 Auto-processing stopped');
        }
    }

    /**
     * Trigger auto-processing
     */
    async triggerAutoProcessing() {
        // Check if already processing
        if (this.getState('isProcessing')) {
            if (this.debugMode) {
                console.log('🤖 Auto-processing skipped - already processing');
            }
            return;
        }

        // Check if recording is active
        const isRecording = this.getGlobalState('recording.isRecording');
        if (!isRecording) {
            if (this.debugMode) {
                console.log('🤖 Auto-processing skipped - not recording');
            }
            return;
        }

        // Check if we have transcripts to process
        const transcriptCounts = this.getGlobalState('transcript') || {};
        const rawCount = transcriptCounts.rawCount || 0;

        if (rawCount === 0) {
            if (this.debugMode) {
                console.log('🤖 Auto-processing skipped - no transcripts');
            }
            return;
        }

        console.log(`🤖 Auto-processing triggered for ${rawCount} transcripts`);

        try {
            // Get session ID from recording module
            const sessionId = this.getGlobalState('recording.sessionId');

            // Make API call to trigger auto-processing
            const response = await fetch('/api/process-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    auto_triggered: true
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.emit('ui:notification', {
                    type: 'info',
                    message: `Auto-processing: queued ${result.transcript_count || rawCount} transcripts`
                });
            } else {
                console.error('❌ Auto-processing failed:', result.error);
            }
        } catch (error) {
            console.error('❌ Auto-processing error:', error);
        }
    }

    /**
     * Toggle auto-processing
     */
    async toggleAutoProcessing() {
        const currentState = this.getState('autoProcessingEnabled');
        const newState = !currentState;

        // Update server settings
        await this.updateAutoProcessingSettings(newState, this.getState('autoProcessingInterval'));
    }

    /**
     * Set auto-processing interval
     */
    async setAutoProcessingInterval(interval) {
        // Convert from minutes to milliseconds if needed
        const intervalMs = interval < 1000 ? interval * 60000 : interval;

        // Update server settings
        await this.updateAutoProcessingSettings(this.getState('autoProcessingEnabled'), intervalMs);
    }

    /**
     * Update auto-processing status display
     */
    updateAutoProcessingStatus() {
        if (!this.elements.autoProcessingStatus) return;

        const enabled = this.getState('autoProcessingEnabled');
        const intervalMs = this.getState('autoProcessingInterval');
        const intervalMinutes = intervalMs / 60000;
        const isRecording = this.getGlobalState('recording.isRecording');

        let statusText = '';

        if (!enabled) {
            statusText = '';
        } else if (isRecording) {
            statusText = `Next: ${intervalMinutes} min`;
        } else {
            statusText = 'Will start with recording';
        }

        this.elements.autoProcessingStatus.textContent = statusText;
    }

    /**
     * Update queue status
     */
    updateQueueStatus() {
        // This would be implemented if we had queue status elements
        // For now, it's a placeholder for future queue management UI
        if (this.debugMode) {
            console.log('🤖 Queue status updated');
        }
    }

    /**
     * Handle SSE events related to LLM
     */
    handleSSEEvent(data) {
        switch (data.type) {
            case 'llm_processing_start':
                this.handleLLMProcessingStart(data);
                break;
            case 'llm_processing_complete':
                this.handleLLMProcessingComplete(data);
                break;
            case 'llm_processing_error':
                this.handleLLMProcessingError(data);
                break;
            case 'llm_auto_processing_triggered':
                this.handleAutoProcessingTriggered(data);
                break;
            default:
                if (this.debugMode) {
                    console.log('❓ Unknown LLM SSE event:', data.type);
                }
        }
    }

    /**
     * Handle auto-processing triggered event
     */
    handleAutoProcessingTriggered(data) {
        if (this.debugMode) {
            console.log('🤖 Auto-processing triggered via SSE:', data);
        }

        // Update status to show what was processed
        if (this.elements.autoProcessingStatus) {
            this.elements.autoProcessingStatus.textContent = `Auto-processed ${data.transcript_count} transcripts`;
        }

        this.emit('ui:notification', {
            type: 'info',
            message: `Auto-processed ${data.transcript_count} transcripts`
        });

        // Reset status after a few seconds
        setTimeout(() => {
            this.updateAutoProcessingStatus();
        }, 3000);
    }

    /**
     * Handle transcripts available
     */
    handleTranscriptsAvailable(data) {
        const count = data.count || 0;

        // Enable LLM processing button if we have transcripts and not currently processing
        if (count > 0 && !this.getState('isProcessing')) {
            this.emit('ui:button_state_updated', {
                buttonId: 'processLLMBtn',
                disabled: false
            });
        }
    }

    /**
     * Handle processing error
     */
    handleProcessingError(errorMessage) {
        this.setState('isProcessing', false);
        this.setState('currentJob', null);
        this.setState('processingStartTime', null);

        this.updateProcessingUI(false);
        this.stopProcessingTimer();

        this.emit('ui:notification', {
            type: 'error',
            message: errorMessage
        });

        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = '❌ Error';
        }
    }

    /**
     * Get current processing status
     */
    getProcessingStatus() {
        return {
            isProcessing: this.getState('isProcessing'),
            currentJob: this.getState('currentJob'),
            autoProcessingEnabled: this.getState('autoProcessingEnabled'),
            autoProcessingInterval: this.getState('autoProcessingInterval'),
            processingStartTime: this.getState('processingStartTime')
        };
    }

    /**
     * Check if currently processing
     */
    isProcessing() {
        return this.getState('isProcessing');
    }

    /**
     * Handle recording started event
     */
    handleRecordingStarted() {
        this.startAutoProcessing();
        this.updateAutoProcessingStatus();

        // Enable LLM processing button when recording starts
        this.emit('ui:button_state_updated', {
            buttonId: 'processLLMBtn',
            disabled: false
        });
    }

    /**
     * Handle recording stopped event
     */
    handleRecordingStopped() {
        this.stopAutoProcessing();
        this.updateAutoProcessingStatus();

        // Disable LLM processing button when recording stops (will be re-enabled by transcript availability)
        this.emit('ui:button_state_updated', {
            buttonId: 'processLLMBtn',
            disabled: true
        });
    }

    /**
     * Get auto-processing settings
     */
    getAutoProcessingSettings() {
        return {
            enabled: this.getState('autoProcessingEnabled'),
            interval: this.getState('autoProcessingInterval'),
            isActive: !!this.autoProcessingTimer
        };
    }

    /**
     * Load auto-processing settings from server
     */
    async loadAutoProcessingSettings() {
        try {
            const response = await fetch('/api/auto-processing/settings');
            const result = await response.json();

            if (response.ok) {
                const settings = result.settings;

                // Update state
                this.setState('autoProcessingEnabled', settings.enabled);
                this.setState('autoProcessingInterval', settings.interval_minutes * 60000); // Convert to ms

                // Update UI elements
                if (this.elements.autoProcessingCheckbox) {
                    this.elements.autoProcessingCheckbox.checked = settings.enabled;
                }
                if (this.elements.autoProcessingInterval) {
                    this.elements.autoProcessingInterval.value = settings.interval_minutes;
                    this.elements.autoProcessingInterval.disabled = !settings.enabled;
                }

                this.updateAutoProcessingStatus();

                if (this.debugMode) {
                    console.log('🤖 Auto-processing settings loaded:', settings);
                }
            } else {
                console.error('Failed to load auto-processing settings:', result.error);
            }
        } catch (error) {
            console.error('Error loading auto-processing settings:', error);
        }
    }

    /**
     * Update auto-processing settings on server
     */
    async updateAutoProcessingSettings(enabled, intervalMs) {
        try {
            const intervalMinutes = Math.round(intervalMs / 60000);

            // Enable/disable interval dropdown
            if (this.elements.autoProcessingInterval) {
                this.elements.autoProcessingInterval.disabled = !enabled;
            }

            const response = await fetch('/api/auto-processing/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    enabled: enabled,
                    interval_minutes: intervalMinutes
                })
            });

            const result = await response.json();

            if (response.ok) {
                const settings = result.settings;

                // Update local state
                this.setState('autoProcessingEnabled', settings.enabled);
                this.setState('autoProcessingInterval', settings.interval_minutes * 60000);

                // Update UI elements
                if (this.elements.autoProcessingCheckbox) {
                    this.elements.autoProcessingCheckbox.checked = settings.enabled;
                }
                if (this.elements.autoProcessingInterval) {
                    this.elements.autoProcessingInterval.value = settings.interval_minutes;
                }

                // Start or stop auto-processing based on recording state
                const isRecording = this.getGlobalState('recording.isRecording');
                if (settings.enabled && isRecording) {
                    this.startAutoProcessing();
                } else {
                    this.stopAutoProcessing();
                }

                this.updateAutoProcessingStatus();

                this.emit('ui:notification', {
                    type: 'info',
                    message: `Auto-processing ${settings.enabled ? 'enabled' : 'disabled'}`
                });

                if (this.debugMode) {
                    console.log('🤖 Auto-processing settings updated:', settings);
                }
            } else {
                throw new Error(result.error || 'Failed to update settings');
            }
        } catch (error) {
            console.error('Error updating auto-processing settings:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to update auto-processing settings'
            });
        }
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LLMModule;
} else {
    window.LLMModule = LLMModule;
}
