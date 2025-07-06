/**
 * UI Module
 *
 * Handles user interface controls, notifications, panel visibility,
 * status updates, and button state management.
 */
class UIModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('ui', eventBus, stateStore, config);

        this.elements = {};
        this.notificationElement = null;
        this.notificationTimer = null;
    }

    /**
     * Get default configuration for the UI module
     */
    getDefaultConfig() {
        return {
            notificationTimeout: 5000,
            animationDuration: 300,
            enableAnimations: true
        };
    }

    /**
     * Get initial state for the UI module
     */
    getInitialState() {
        return {
            rawPanelVisible: true,
            processedPanelVisible: true,
            currentStatus: { type: 'ready', message: 'Ready' },
            notificationQueue: []
        };
    }

    /**
     * Initialize the UI module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializeVisibilityControls();
        this.createNotificationElement();

        if (this.debugMode) {
            console.log('🔧 UI module initialized');
        }
    }

    /**
     * Set up event listeners for UI events
     */
    setupEventListeners() {
        // Listen for UI-related events from other modules
        this.on('ui:notification', (data) => this.showNotification(data.message, data.type));
        this.on('ui:status_updated', (data) => this.updateStatus(data.status, data.message));
        this.on('ui:panel_toggled', (data) => this.handlePanelToggle(data));
        this.on('ui:button_state_updated', (data) => this.updateButtonState(data));

        // Listen for recording events to update UI
        this.on('recording:started', (data) => this.handleRecordingStarted(data));
        this.on('recording:stopped', (data) => this.handleRecordingStopped(data));
        this.on('recording:paused', (data) => this.handleRecordingPaused(data));
        this.on('recording:resumed', (data) => this.handleRecordingResumed(data));

        // Listen for LLM events to update UI
        this.on('llm:processing_started', (data) => this.handleLLMProcessingStarted(data));
        this.on('llm:processing_completed', (data) => this.handleLLMProcessingCompleted(data));
        this.on('llm:processing_error', (data) => this.handleLLMProcessingError(data));
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Status elements
        this.elements.statusDot = document.querySelector('.status-dot');
        this.elements.statusText = document.querySelector('.status-text');

        // Button elements
        this.elements.startBtn = document.getElementById('start-btn');
        this.elements.pauseBtn = document.getElementById('pause-btn');
        this.elements.resumeBtn = document.getElementById('resume-btn');
        this.elements.stopBtn = document.getElementById('stop-btn');
        this.elements.clearBtn = document.getElementById('clear-btn');
        this.elements.processLLMBtn = document.getElementById('process-llm-btn');

        // Panel toggle buttons
        this.elements.toggleRawBtn = document.getElementById('toggle-raw-btn');
        this.elements.toggleProcessedBtn = document.getElementById('toggle-processed-btn');
        this.elements.showBothBtn = document.getElementById('show-both-btn');

        // Panel elements
        this.elements.rawPanel = document.querySelector('.raw-panel');
        this.elements.processedPanel = document.querySelector('.processed-panel');

        // Status display elements
        this.elements.whisperStatus = document.getElementById('whisper-status');
        this.elements.llmStatusText = document.getElementById('llm-status-text');
        this.elements.llmSpinner = document.getElementById('llm-spinner');
        this.elements.sessionSummaryStatus = document.getElementById('session-summary-status');
        this.elements.autoProcessingStatus = document.getElementById('auto-processing-status');

        // Session info elements
        this.elements.sessionInfo = document.querySelector('.session-info');
        this.elements.sessionIdSpan = document.getElementById('session-id');
        this.elements.durationSpan = document.getElementById('duration');

        // Set up button event listeners
        this.setupButtonEventListeners();
    }

    /**
     * Set up button event listeners
     */
    setupButtonEventListeners() {
        // Panel visibility controls
        if (this.elements.toggleRawBtn) {
            this.elements.toggleRawBtn.addEventListener('click', () => {
                this.toggleRawPanelVisibility();
            });
        }

        if (this.elements.toggleProcessedBtn) {
            this.elements.toggleProcessedBtn.addEventListener('click', () => {
                this.toggleProcessedPanelVisibility();
            });
        }

        if (this.elements.showBothBtn) {
            this.elements.showBothBtn.addEventListener('click', () => {
                this.toggleBothPanels();
            });
        }
    }

    /**
     * Update status display
     */
    updateStatus(type, text) {
        if (this.elements.statusDot) {
            this.elements.statusDot.className = `status-dot ${type}`;
        }

        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }

        this.setState('currentStatus', { type, message: text });

        if (this.debugMode) {
            console.log(`🎨 Status updated: ${type} - ${text}`);
        }
    }

    /**
     * Show notification message
     */
    showNotification(message, type = 'info') {
        if (!this.notificationElement) {
            this.createNotificationElement();
        }

        // Clear existing timer
        if (this.notificationTimer) {
            clearTimeout(this.notificationTimer);
        }

        // Set notification style based on type
        const colors = {
            info: '#3b82f6',
            error: '#ef4444',
            success: '#10b981',
            warning: '#f59e0b'
        };

        this.notificationElement.style.backgroundColor = colors[type] || colors.info;
        this.notificationElement.textContent = message;
        this.notificationElement.style.display = 'block';
        this.notificationElement.style.opacity = '1';

        // Auto-hide after configured timeout
        this.notificationTimer = setTimeout(() => {
            this.hideNotification();
        }, this.config.notificationTimeout);

        if (this.debugMode) {
            console.log(`🔔 Notification: ${type} - ${message}`);
        }
    }

    /**
     * Hide notification
     */
    hideNotification() {
        if (this.notificationElement) {
            this.notificationElement.style.opacity = '0';
            setTimeout(() => {
                this.notificationElement.style.display = 'none';
            }, this.config.animationDuration);
        }
    }

    /**
     * Create notification element
     */
    createNotificationElement() {
        this.notificationElement = document.createElement('div');
        this.notificationElement.id = 'state-notification';
        this.notificationElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
            display: none;
            opacity: 0;
        `;
        document.body.appendChild(this.notificationElement);
    }

    /**
     * Update button state
     */
    updateButtonState(data) {
        const { buttonId, disabled, visible, text } = data;
        const button = this.elements[buttonId] || document.getElementById(buttonId);

        if (!button) return;

        if (disabled !== undefined) {
            button.disabled = disabled;
        }

        if (visible !== undefined) {
            button.style.display = visible ? 'inline-block' : 'none';
        }

        if (text !== undefined) {
            button.textContent = text;
        }
    }

    /**
     * Toggle raw panel visibility
     */
    toggleRawPanelVisibility() {
        const rawPanelVisible = !this.getState('rawPanelVisible');
        this.setState('rawPanelVisible', rawPanelVisible);

        if (this.elements.rawPanel) {
            if (rawPanelVisible) {
                this.elements.rawPanel.classList.remove('hidden');
                if (this.elements.toggleRawBtn) {
                    this.elements.toggleRawBtn.textContent = '👁️ Hide';
                }
            } else {
                this.elements.rawPanel.classList.add('hidden');
                if (this.elements.toggleRawBtn) {
                    this.elements.toggleRawBtn.textContent = '👁️ Show';
                }
            }
        }

        this.updateVisibilityButtonStates();
        this.updateGridLayout();

        this.emit('ui:panel_toggled', { panel: 'raw', visible: rawPanelVisible });
    }

    /**
     * Toggle processed panel visibility
     */
    toggleProcessedPanelVisibility() {
        const processedPanelVisible = !this.getState('processedPanelVisible');
        this.setState('processedPanelVisible', processedPanelVisible);

        if (this.elements.processedPanel) {
            if (processedPanelVisible) {
                this.elements.processedPanel.classList.remove('hidden');
                if (this.elements.toggleProcessedBtn) {
                    this.elements.toggleProcessedBtn.textContent = '👁️ Hide';
                }
            } else {
                this.elements.processedPanel.classList.add('hidden');
                if (this.elements.toggleProcessedBtn) {
                    this.elements.toggleProcessedBtn.textContent = '👁️ Show';
                }
            }
        }

        this.updateVisibilityButtonStates();
        this.updateGridLayout();

        this.emit('ui:panel_toggled', { panel: 'processed', visible: processedPanelVisible });
    }

    /**
     * Toggle both panels
     */
    toggleBothPanels() {
        const rawVisible = this.getState('rawPanelVisible');
        const processedVisible = this.getState('processedPanelVisible');

        // If both panels are visible, hide both; otherwise show both
        const shouldShow = !(rawVisible && processedVisible);

        this.setState('rawPanelVisible', shouldShow);
        this.setState('processedPanelVisible', shouldShow);

        if (this.elements.rawPanel) {
            if (shouldShow) {
                this.elements.rawPanel.classList.remove('hidden');
            } else {
                this.elements.rawPanel.classList.add('hidden');
            }
        }

        if (this.elements.processedPanel) {
            if (shouldShow) {
                this.elements.processedPanel.classList.remove('hidden');
            } else {
                this.elements.processedPanel.classList.add('hidden');
            }
        }

        // Update button texts
        const buttonText = shouldShow ? '👁️ Hide' : '👁️ Show';
        if (this.elements.toggleRawBtn) {
            this.elements.toggleRawBtn.textContent = buttonText;
        }
        if (this.elements.toggleProcessedBtn) {
            this.elements.toggleProcessedBtn.textContent = buttonText;
        }

        this.updateVisibilityButtonStates();
        this.updateGridLayout();

        this.emit('ui:panel_toggled', { panel: 'both', visible: shouldShow });
    }

    /**
     * Initialize visibility controls
     */
    initializeVisibilityControls() {
        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }

    /**
     * Update visibility button states
     */
    updateVisibilityButtonStates() {
        const rawVisible = this.getState('rawPanelVisible');
        const processedVisible = this.getState('processedPanelVisible');

        // Update show both button text
        if (this.elements.showBothBtn) {
            if (rawVisible && processedVisible) {
                this.elements.showBothBtn.textContent = '👁️ Hide Both';
            } else {
                this.elements.showBothBtn.textContent = '👁️ Show Both';
            }
        }
    }

    /**
     * Update grid layout based on panel visibility
     */
    updateGridLayout() {
        const rawVisible = this.getState('rawPanelVisible');
        const processedVisible = this.getState('processedPanelVisible');
        const transcriptGrid = document.querySelector('.transcript-grid');

        if (!transcriptGrid) return;

        // Update grid layout based on visible panels
        if (rawVisible && processedVisible) {
            transcriptGrid.style.gridTemplateColumns = '1fr 1fr';
        } else if (rawVisible || processedVisible) {
            transcriptGrid.style.gridTemplateColumns = '1fr';
        } else {
            transcriptGrid.style.gridTemplateColumns = 'none';
        }
    }

    /**
     * Handle recording started event
     */
    handleRecordingStarted(data) {
        this.updateStatus('recording', 'Recording');
        this.showSessionInfo(data.session_id);

        // Update button states
        this.updateButtonState({ buttonId: 'startBtn', disabled: true });
        this.updateButtonState({ buttonId: 'stopBtn', disabled: false });
        this.updateButtonState({ buttonId: 'processLLMBtn', disabled: false });
        this.updateButtonState({ buttonId: 'pauseBtn', disabled: false, visible: true });
        this.updateButtonState({ buttonId: 'resumeBtn', visible: false });

        // Update status displays
        if (this.elements.whisperStatus) {
            this.elements.whisperStatus.textContent = 'Running';
        }
        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = 'Ready for transcripts';
        }
        if (this.elements.sessionSummaryStatus) {
            this.elements.sessionSummaryStatus.textContent = 'Waiting...';
        }
    }

    /**
     * Handle recording stopped event
     */
    handleRecordingStopped(data) {
        this.updateStatus('ready', 'Ready');
        this.hideSessionInfo();

        // Update button states
        this.updateButtonState({ buttonId: 'startBtn', disabled: false });
        this.updateButtonState({ buttonId: 'stopBtn', disabled: true });
        this.updateButtonState({ buttonId: 'processLLMBtn', disabled: true });
        this.updateButtonState({ buttonId: 'pauseBtn', disabled: true });
        this.updateButtonState({ buttonId: 'resumeBtn', disabled: true });

        // Update status displays
        if (this.elements.whisperStatus) {
            this.elements.whisperStatus.textContent = 'Stopped';
        }
        if (this.elements.sessionSummaryStatus) {
            this.elements.sessionSummaryStatus.textContent = 'Pending...';
        }
    }

    /**
     * Handle recording paused event
     */
    handleRecordingPaused(data) {
        this.updateStatus('paused', 'Paused');

        // Update button states
        this.updateButtonState({ buttonId: 'pauseBtn', visible: false });
        this.updateButtonState({ buttonId: 'resumeBtn', visible: true, disabled: false });

        // Update status
        if (this.elements.whisperStatus) {
            this.elements.whisperStatus.textContent = 'Paused';
        }
    }

    /**
     * Handle recording resumed event
     */
    handleRecordingResumed(data) {
        this.updateStatus('recording', 'Recording');

        // Update button states
        this.updateButtonState({ buttonId: 'resumeBtn', visible: false });
        this.updateButtonState({ buttonId: 'pauseBtn', visible: true, disabled: false });

        // Update status
        if (this.elements.whisperStatus) {
            this.elements.whisperStatus.textContent = 'Recording';
        }
    }

    /**
     * Handle LLM processing started event
     */
    handleLLMProcessingStarted(data) {
        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = `🤖 Processing ${data.transcript_count || 0} transcripts...`;
        }

        if (this.elements.llmSpinner) {
            this.elements.llmSpinner.style.display = 'inline-block';
        }

        this.updateButtonState({ buttonId: 'processLLMBtn', disabled: true });

        this.showNotification(`Queued ${data.transcript_count || 0} transcripts for LLM processing`, 'info');
    }

    /**
     * Handle LLM processing completed event
     */
    handleLLMProcessingCompleted(data) {
        const processingTime = data.processing_time || 0;

        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = `✅ Processing complete (${processingTime}s)`;
        }

        if (this.elements.llmSpinner) {
            this.elements.llmSpinner.style.display = 'none';
        }

        this.updateButtonState({ buttonId: 'processLLMBtn', disabled: false });

        this.showNotification(`LLM processing completed in ${processingTime}s`, 'success');
    }

    /**
     * Handle LLM processing error event
     */
    handleLLMProcessingError(data) {
        if (this.elements.llmStatusText) {
            this.elements.llmStatusText.textContent = '❌ Processing failed';
        }

        if (this.elements.llmSpinner) {
            this.elements.llmSpinner.style.display = 'none';
        }

        this.updateButtonState({ buttonId: 'processLLMBtn', disabled: false });

        this.showNotification('LLM processing failed: ' + (data.error || 'Unknown error'), 'error');
    }

    /**
     * Show session info
     */
    showSessionInfo(sessionId) {
        if (this.elements.sessionInfo) {
            this.elements.sessionInfo.style.display = 'block';
        }

        if (this.elements.sessionIdSpan && sessionId) {
            this.elements.sessionIdSpan.textContent = sessionId;
        }
    }

    /**
     * Hide session info
     */
    hideSessionInfo() {
        if (this.elements.sessionInfo) {
            this.elements.sessionInfo.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Show warning message
     */
    showWarningMessage(message) {
        this.showNotification(message, 'warning');
    }

    /**
     * Get current panel visibility state
     */
    getPanelVisibility() {
        return {
            raw: this.getState('rawPanelVisible'),
            processed: this.getState('processedPanelVisible')
        };
    }

    /**
     * Set panel visibility
     */
    setPanelVisibility(raw, processed) {
        this.setState('rawPanelVisible', raw);
        this.setState('processedPanelVisible', processed);

        if (this.elements.rawPanel) {
            if (raw) {
                this.elements.rawPanel.classList.remove('hidden');
            } else {
                this.elements.rawPanel.classList.add('hidden');
            }
        }

        if (this.elements.processedPanel) {
            if (processed) {
                this.elements.processedPanel.classList.remove('hidden');
            } else {
                this.elements.processedPanel.classList.add('hidden');
            }
        }

        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }

    /**
     * Handle panel toggle event
     */
    handlePanelToggle(data) {
        const { panel, visible } = data;

        if (panel === 'raw') {
            this.setState('rawPanelVisible', visible);
        } else if (panel === 'processed') {
            this.setState('processedPanelVisible', visible);
        } else if (panel === 'both') {
            this.setState('rawPanelVisible', visible);
            this.setState('processedPanelVisible', visible);
        }

        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIModule;
} else {
    window.UIModule = UIModule;
}
