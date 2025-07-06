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
            autoProcessingEnabled: true,
            autoProcessingInterval: 120000,
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

        // Listen for keyboard shortcuts from utils module
        this.on('utils:manual_process_requested', () => this.processTranscriptsManually());

        // Listen for SSE events
        this.on('llm:sse_event', (data) => this.handleSSEEvent(data));

        // Listen for transcript availability
        this.on('llm:transcripts_available', (data) => this.handleTranscriptsAvailable(data));

        // Listen for recording events to manage auto-processing
        this.on('recording:started', () => this.startAutoProcessing());
        this.on('recording:stopped', () => this.stopAutoProcessing());

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
        this.elements.autoProcessingCheckbox = document.getElementById('auto-processing-checkbox');
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
            this.elements.autoProcessingCheckbox.addEventListener('change', () => {
                this.emit('llm:toggle_auto_processing');
            });
        }

        if (this.elements.autoProcessingInterval) {
            this.elements.autoProcessingInterval.addEventListener('change', () => {
                const interval = parseInt(this.elements.autoProcessingInterval.value);
                this.emit('llm:set_auto_processing_interval', { interval });
            });
        }
    }

    /**
     * Initialize auto-processing settings
     */
    initializeAutoProcessing() {
        // Set initial checkbox state
        if (this.elements.autoProcessingCheckbox) {
            this.elements.autoProcessingCheckbox.checked = this.getState('autoProcessingEnabled');
        }

        // Set initial interval
        if (this.elements.autoProcessingInterval) {
            this.elements.autoProcessingInterval.value = this.getState('autoProcessingInterval');
        }

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

            // Make API call to process transcripts
            const response = await fetch('/api/process-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
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
            // Make API call to trigger auto-processing
            const response = await fetch('/api/process-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
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
    toggleAutoProcessing() {
        const currentState = this.getState('autoProcessingEnabled');
        const newState = !currentState;

        this.setState('autoProcessingEnabled', newState);

        if (this.elements.autoProcessingCheckbox) {
            this.elements.autoProcessingCheckbox.checked = newState;
        }

        // Start or stop auto-processing based on recording state
        const isRecording = this.getGlobalState('recording.isRecording');
        if (newState && isRecording) {
            this.startAutoProcessing();
        } else {
            this.stopAutoProcessing();
        }

        this.updateAutoProcessingStatus();

        this.emit('ui:notification', {
            type: 'info',
            message: `Auto-processing ${newState ? 'enabled' : 'disabled'}`
        });

        if (this.debugMode) {
            console.log(`🤖 Auto-processing ${newState ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Set auto-processing interval
     */
    setAutoProcessingInterval(interval) {
        this.setState('autoProcessingInterval', interval);

        if (this.elements.autoProcessingInterval) {
            this.elements.autoProcessingInterval.value = interval;
        }

        // Restart auto-processing with new interval if it's currently running
        if (this.autoProcessingTimer) {
            this.startAutoProcessing();
        }

        this.updateAutoProcessingStatus();

        const minutes = interval / 60000;
        this.emit('ui:notification', {
            type: 'info',
            message: `Auto-processing interval set to ${minutes} minute${minutes !== 1 ? 's' : ''}`
        });

        if (this.debugMode) {
            console.log(`🤖 Auto-processing interval set to ${interval}ms`);
        }
    }

    /**
     * Update auto-processing status display
     */
    updateAutoProcessingStatus() {
        if (!this.elements.autoProcessingStatus) return;

        const enabled = this.getState('autoProcessingEnabled');
        const interval = this.getState('autoProcessingInterval');
        const isActive = !!this.autoProcessingTimer;

        let statusText = '';

        if (!enabled) {
            statusText = 'Disabled';
        } else if (isActive) {
            const minutes = interval / 60000;
            statusText = `Active (every ${minutes}min)`;
        } else {
            statusText = 'Enabled (waiting for recording)';
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

        this.emit('ui:notification', {
            type: 'info',
            message: 'Auto-processing triggered by server'
        });
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
     * Get auto-processing settings
     */
    getAutoProcessingSettings() {
        return {
            enabled: this.getState('autoProcessingEnabled'),
            interval: this.getState('autoProcessingInterval'),
            isActive: !!this.autoProcessingTimer
        };
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LLMModule;
} else {
    window.LLMModule = LLMModule;
}
