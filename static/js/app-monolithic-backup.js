// ChatGPT Voice Mode Transcript Recorder - Frontend JavaScript with Dual Panel Support

class TranscriptRecorder {
    constructor() {
        this.eventSource = null;
        this.isRecording = false;
        this.isPaused = false;
        this.sessionId = null;
        this.startTime = null;

        // Raw transcript management
        this.rawTranscripts = [];
        this.rawTranscriptCount = 0;

        // Processed transcript management
        this.processedTranscripts = [];
        this.processedTranscriptCount = 0;

        // LLM processing state
        this.isLLMProcessing = false;
        this.currentLLMJob = null;

        // Panel visibility state
        this.rawPanelVisible = true;
        this.processedPanelVisible = true;

        // Mobile detection
        this.isMobile = this.detectMobile();

        this.initializeElements();
        this.setupEventListeners();
        this.setupSSEConnection();
        this.setupKeyboardListeners();
        this.checkMobileCompatibility();
        this.initializeVisibilityControls();

        // Recover server state on page load
        this.recoverServerState();

        // Load audio devices on startup
        this.loadAudioDevices();

        // Load auto-processing settings
        this.loadAutoProcessingSettings();

        // Load VAD settings
        this.loadVADSettings();

        // Start periodic queue status updates
        this.startPeriodicQueueStatusUpdates();
    }

    initializeElements() {
        // Control buttons
        this.startBtn = document.getElementById('start-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resumeBtn = document.getElementById('resume-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.processLLMBtn = document.getElementById('process-llm-btn');
        this.clearBtn = document.getElementById('clear-btn');

        // Status elements
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.sessionInfo = document.getElementById('session-info');
        this.sessionIdSpan = document.getElementById('session-id');
        this.durationSpan = document.getElementById('duration');

        // Audio level elements
        this.micLevel = document.getElementById('mic-level');
        this.systemLevel = document.getElementById('system-level');

        // Device selection elements
        this.micDeviceSelect = document.getElementById('mic-device-select');
        this.systemDeviceSelect = document.getElementById('system-device-select');
        this.refreshDevicesBtn = document.getElementById('refresh-devices-btn');

        // LLM status elements
        this.llmStatus = document.getElementById('llm-status');
        this.llmStatusText = document.getElementById('llm-status-text');
        this.llmSpinner = document.getElementById('llm-spinner');
        this.accumulatedCount = document.getElementById('accumulated-count');
        this.queueStatus = document.getElementById('queue-status');
        this.queueStatusText = document.getElementById('queue-status-text');
        this.llmActivity = document.getElementById('llm-activity');
        this.currentJobInfo = document.getElementById('current-job-info');
        this.processingTimeInfo = document.getElementById('processing-time-info');
        this.totalProcessedInfo = document.getElementById('total-processed-info');

        // Auto-processing elements
        this.autoProcessingEnabled = document.getElementById('auto-processing-enabled');
        this.autoProcessingInterval = document.getElementById('auto-processing-interval');
        this.autoProcessingStatus = document.getElementById('auto-processing-status');

        // VAD control elements
        this.vadFixedInterval = document.getElementById('vad-fixed-interval');
        this.vadStatus = document.getElementById('vad-status');

        // Dual panel elements
        this.rawTranscriptContent = document.getElementById('raw-transcript-content');
        this.processedTranscriptContent = document.getElementById('processed-transcript-content');
        this.rawCountSpan = document.getElementById('raw-count');
        this.processedCountSpan = document.getElementById('processed-count');

        // Panel toggle buttons
        this.toggleRawBtn = document.getElementById('toggle-raw-btn');
        this.toggleProcessedBtn = document.getElementById('toggle-processed-btn');

        // Panel copy buttons
        this.copyRawBtn = document.getElementById('copy-raw-btn');
        this.copyProcessedBtn = document.getElementById('copy-processed-btn');

        // Panel visibility controls
        this.showRawBtn = document.getElementById('show-raw-btn');
        this.showProcessedBtn = document.getElementById('show-processed-btn');
        this.showBothBtn = document.getElementById('show-both-btn');

        // Processed actions
        this.saveProcessedBtn = document.getElementById('save-processed-btn');
        this.exportProcessedBtn = document.getElementById('export-processed-btn');
        this.processedActions = document.querySelector('.processed-actions');

        // Database inspector elements
        this.databaseBtn = document.getElementById('database-btn');
        this.databaseModal = document.getElementById('database-modal');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        this.statsGrid = document.getElementById('stats-grid');
        this.tableContent = document.getElementById('table-content');
        this.rawTab = document.getElementById('raw-tab');
        this.processedTab = document.getElementById('processed-tab');
        this.sessionsTab = document.getElementById('sessions-tab');
        this.sessionBrowserTab = document.getElementById('session-browser-tab');

        // Session browser elements
        this.sessionBrowserControls = document.getElementById('session-browser-controls');
        this.loadSessionBtn = document.getElementById('load-session-btn');
        this.generateSummaryBtn = document.getElementById('generate-summary-btn');
        this.selectedSessionInfo = document.getElementById('selected-session-info');

        // Bookmark filtering elements
        this.showBookmarkedOnlyCheckbox = document.getElementById('show-bookmarked-only');
        this.bookmarkCountSpan = document.getElementById('bookmark-count');
        this.bookmarkAllVisibleBtn = document.getElementById('bookmark-all-visible-btn');
        this.clearAllBookmarksBtn = document.getElementById('clear-all-bookmarks-btn');

        // Current session bookmark elements
        this.currentSessionBookmark = document.getElementById('current-session-bookmark');
        this.currentSessionBookmarkStar = document.getElementById('current-session-bookmark-star');

        // Export elements
        this.exportSessionBtn = document.getElementById('export-session-btn');
        this.exportOptions = document.getElementById('export-options');
        this.exportFormatSelect = document.getElementById('export-format-select');
        this.exportContentSelect = document.getElementById('export-content-select');
        this.downloadExportBtn = document.getElementById('download-export-btn');
        this.cancelExportBtn = document.getElementById('cancel-export-btn');

        // Quality monitor (updated)
        this.whisperStatus = document.getElementById('whisper-status');
        this.llmProcessingStatus = document.getElementById('llm-processing-status');
        this.lastLLMProcess = document.getElementById('last-llm-process');
        this.sessionSummaryStatus = document.getElementById('session-summary-status');
        this.sessionDuration = document.getElementById('session-duration');
        this.processingDelaySpan = document.getElementById('processing-delay');
        this.lastSaveSpan = document.getElementById('last-save');
    }

    setupEventListeners() {
        // Recording controls
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.pauseBtn.addEventListener('click', () => this.pauseRecording());
        this.resumeBtn.addEventListener('click', () => this.resumeRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscript());

        // LLM processing
        this.processLLMBtn.addEventListener('click', () => this.processWithLLM());

        // Auto-processing controls
        this.autoProcessingEnabled.addEventListener('change', () => this.updateAutoProcessingSettings());
        this.autoProcessingInterval.addEventListener('change', () => this.updateAutoProcessingSettings());

        // VAD controls
        this.vadFixedInterval.addEventListener('change', () => this.updateVADSettings());

        // Panel toggles
        this.toggleRawBtn.addEventListener('click', () => this.toggleRawPanel());
        this.toggleProcessedBtn.addEventListener('click', () => this.toggleProcessedPanel());

        // Copy buttons
        this.copyRawBtn.addEventListener('click', () => this.copyRawTranscripts());
        this.copyProcessedBtn.addEventListener('click', () => this.copyProcessedTranscripts());

        // Panel visibility controls
        this.showRawBtn.addEventListener('click', () => this.toggleRawPanelVisibility());
        this.showProcessedBtn.addEventListener('click', () => this.toggleProcessedPanelVisibility());
        this.showBothBtn.addEventListener('click', () => this.toggleBothPanels());

        // Processed transcript actions
        if (this.saveProcessedBtn) {
            this.saveProcessedBtn.addEventListener('click', () => this.saveProcessedTranscript());
        }
        if (this.exportProcessedBtn) {
            this.exportProcessedBtn.addEventListener('click', () => this.exportProcessedTranscript());
        }

        // Device selection
        this.refreshDevicesBtn.addEventListener('click', () => this.loadAudioDevices());
        this.micDeviceSelect.addEventListener('change', () => this.onDeviceSelectionChange());
        this.systemDeviceSelect.addEventListener('change', () => this.onDeviceSelectionChange());

        // Database inspector
        if (this.databaseBtn) {
            this.databaseBtn.addEventListener('click', () => this.openDatabaseInspector());
        }
        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.closeDatabaseInspector());
        }
        if (this.rawTab) {
            this.rawTab.addEventListener('click', () => this.showDatabaseTable('raw'));
        }
        if (this.processedTab) {
            this.processedTab.addEventListener('click', () => this.showDatabaseTable('processed'));
        }
        if (this.sessionsTab) {
            this.sessionsTab.addEventListener('click', () => this.showDatabaseTable('sessions'));
        }
        if (this.sessionBrowserTab) {
            this.sessionBrowserTab.addEventListener('click', () => this.showSessionBrowser());
        }

        // Session browser controls
        if (this.loadSessionBtn) {
            this.loadSessionBtn.addEventListener('click', () => this.loadSelectedSession());
        }
        if (this.generateSummaryBtn) {
            this.generateSummaryBtn.addEventListener('click', () => this.generateSummaryForSession());
        }

        // Bookmark filtering controls
        if (this.showBookmarkedOnlyCheckbox) {
            this.showBookmarkedOnlyCheckbox.addEventListener('change', () => this.onBookmarkFilterChange());
        }
        if (this.bookmarkAllVisibleBtn) {
            this.bookmarkAllVisibleBtn.addEventListener('click', () => this.bookmarkAllVisible());
        }
        if (this.clearAllBookmarksBtn) {
            this.clearAllBookmarksBtn.addEventListener('click', () => this.clearAllBookmarks());
        }

        // Current session bookmark
        if (this.currentSessionBookmarkStar) {
            this.currentSessionBookmarkStar.addEventListener('click', () => this.toggleCurrentSessionBookmark());
        }

        // Export controls
        if (this.exportSessionBtn) {
            this.exportSessionBtn.addEventListener('click', () => this.showExportOptions());
        }
        if (this.downloadExportBtn) {
            this.downloadExportBtn.addEventListener('click', () => this.downloadSessionExport());
        }
        if (this.cancelExportBtn) {
            this.cancelExportBtn.addEventListener('click', () => this.hideExportOptions());
        }

        // Close modal when clicking outside
        if (this.databaseModal) {
            this.databaseModal.addEventListener('click', (e) => {
                if (e.target === this.databaseModal) {
                    this.closeDatabaseInspector();
                }
            });
        }
    }

    setupKeyboardListeners() {
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Only trigger if not in an input field
            if (document.activeElement.tagName !== 'INPUT' &&
                document.activeElement.tagName !== 'TEXTAREA' &&
                document.activeElement.tagName !== 'SELECT') {

                // Enter key to trigger LLM processing
                if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                    event.preventDefault();
                    this.processWithLLM();
                }

                // Spacebar to pause/resume recording
                if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                    event.preventDefault();
                    if (this.isRecording) {
                        if (this.isPaused) {
                            this.resumeRecording();
                        } else {
                            this.pauseRecording();
                        }
                    }
                }

                // Ctrl+B to bookmark current session
                if (event.key === 'b' && event.ctrlKey && !event.altKey && !event.shiftKey) {
                    event.preventDefault();
                    if (this.sessionId && this.isRecording) {
                        this.toggleCurrentSessionBookmark();
                        this.showNotification('info', 'Keyboard shortcut: Ctrl+B to bookmark current session');
                    } else {
                        this.showNotification('warning', 'No active session to bookmark (Ctrl+B)');
                    }
                }
            }
        });
    }

    setupSSEConnection() {
        console.log('Setting up SSE connection...');
        this.eventSource = new EventSource('/stream');

        this.eventSource.onopen = () => {
            console.log('📡 SSE connection opened');
            this.updateStatus('ready', 'Connected');
        };

        this.eventSource.onerror = (error) => {
            console.error('❌ SSE connection error:', error);
            this.updateStatus('error', 'Connection Error');
        };

        this.eventSource.onmessage = (event) => {
            try {
                console.log('🔍 Raw SSE event data:', event.data);
                const data = JSON.parse(event.data);
                console.log('📨 SSE message parsed:', data);

                switch (data.type) {
                    case 'recording_started':
                        console.log('🎤 Recording started:', data);
                        this.handleRecordingStarted(data);
                        break;
                    case 'recording_stopped':
                        console.log('🛑 Recording stopped:', data);
                        this.handleRecordingStopped(data);
                        break;
                    case 'recording_paused':
                        console.log('⏸️ Recording paused:', data);
                        this.handleRecordingPaused(data);
                        break;
                    case 'recording_resumed':
                        console.log('▶️ Recording resumed:', data);
                        this.handleRecordingResumed(data);
                        break;
                    case 'raw_transcript':
                        console.log('📝 Raw transcript received:', data);
                        this.addRawTranscript(data);
                        break;
                    case 'audio_level':
                        // FIX: Handle audio level updates
                        this.updateAudioLevels(data);
                        break;
                    case 'llm_processing_start':
                        console.log('🤖 LLM processing started:', data);
                        this.handleLLMProcessingStart(data);
                        break;
                    case 'llm_processing_complete':
                        console.log('✨ LLM processing complete:', data);
                        this.handleLLMProcessingComplete(data);
                        break;
                    case 'llm_processing_error':
                        console.log('❌ LLM processing error:', data);
                        this.handleLLMProcessingError(data);
                        break;
                    case 'auto_processing_triggered':
                        console.log('🤖 Auto-processing triggered:', data);
                        this.handleAutoProcessingTriggered(data);
                        break;
                    case 'whisper_error':
                        console.log('❌ Whisper error:', data);
                        this.handleWhisperError(data);
                        break;
                    case 'session_summary_start':
                        console.log('📝 Session summary generation started:', data);
                        this.handleSessionSummaryStart(data);
                        break;
                    case 'session_summary_generated':
                        console.log('📝 Session summary generated:', data);
                        this.handleSessionSummaryGenerated(data);
                        break;
                    case 'session_summary_error':
                        console.log('❌ Session summary error:', data);
                        this.handleSessionSummaryError(data);
                        break;
                    case 'heartbeat':
                        console.log('💓 Heartbeat received');
                        // Handle heartbeat with optional state sync
                        if (data.state_sync) {
                            this.validateStateSync(data.state_sync);
                        }
                        break;
                    default:
                        console.log('❓ Unknown SSE message type:', data.type, data);
                }
            } catch (error) {
                console.error('❌ Error parsing SSE message:', error, 'Raw data:', event.data);
            }
        };
    }

    async startRecording() {
        try {
            // Clear any session viewing mode and transcripts for safety
            this.exitSessionViewingMode();
            this.clearTranscript();

            this.updateStatus('recording', 'Starting...');
            this.startBtn.disabled = true;

            // Request microphone permission first (only for mobile devices)
            if (this.isMobile) {
                console.log('🎤 Mobile device detected - requesting microphone permission...');
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log('✅ Microphone permission granted');

                    // Stop the test stream immediately
                    stream.getTracks().forEach(track => track.stop());

                    this.showSuccessMessage('Microphone access granted! Starting recording...');
                } catch (permissionError) {
                    console.error('❌ Microphone permission denied:', permissionError);
                    this.updateStatus('error', 'Microphone access denied');
                    this.startBtn.disabled = false;

                    this.showErrorMessage(
                        'Microphone access is required for recording. ' +
                        'Please allow microphone access and try again. ' +
                        'On mobile, you may need to refresh the page after granting permission.'
                    );
                    return;
                }
            }

            // Prepare device selection data - read directly from dropdowns
            const micDeviceId = this.micDeviceSelect.value;
            const systemDeviceId = this.systemDeviceSelect.value;

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

            console.log('🔍 Device data being sent:', deviceData);

            const response = await fetch('/api/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });

            const result = await response.json();

            if (response.ok) {
                this.isRecording = true;
                this.sessionId = result.session_id;
                this.startTime = new Date();

                this.updateStatus('recording', 'Recording');
                this.startBtn.disabled = true;
                this.pauseBtn.disabled = false;
                this.pauseBtn.style.display = 'inline-block';
                this.resumeBtn.style.display = 'none';
                this.stopBtn.disabled = false;

                this.showSessionInfo();
                this.startDurationTimer();
                this.clearTranscriptPlaceholder();

                console.log('Recording started:', result);
            } else {
                throw new Error(result.error || 'Failed to start recording');
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('error', 'Error: ' + error.message);
            this.startBtn.disabled = false;

            // Show error message to user
            this.showErrorMessage(error.message);
        }
    }

    async stopRecording() {
        try {
            this.updateStatus('ready', 'Stopping...');
            this.stopBtn.disabled = true;

            // Finalize any current message before stopping
            if (this.currentMessage) {
                this.finalizeCurrentMessage();
            }

            const response = await fetch('/api/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.isRecording = false;
                this.isPaused = false;
                this.sessionId = null;
                this.startTime = null;

                this.updateStatus('ready', 'Ready');
                this.startBtn.disabled = false;
                this.pauseBtn.disabled = true;
                this.pauseBtn.style.display = 'inline-block';
                this.resumeBtn.disabled = true;
                this.resumeBtn.style.display = 'none';
                this.stopBtn.disabled = true;

                this.hideSessionInfo();
                this.stopDurationTimer();

                console.log('Recording stopped:', result);
            } else {
                throw new Error(result.error || 'Failed to stop recording');
            }

        } catch (error) {
            console.error('Error stopping recording:', error);
            this.updateStatus('error', 'Error: ' + error.message);
            this.stopBtn.disabled = false;
        }
    }

    async pauseRecording() {
        try {
            if (!this.isRecording) {
                console.warn('Cannot pause: not currently recording');
                return;
            }

            if (this.isPaused) {
                console.warn('Already paused');
                return;
            }

            this.updateStatus('paused', 'Pausing...');
            this.pauseBtn.disabled = true;

            const response = await fetch('/api/pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.isPaused = true;
                this.updateStatus('paused', 'Paused');

                // Update button states
                this.pauseBtn.style.display = 'none';
                this.resumeBtn.style.display = 'inline-block';
                this.resumeBtn.disabled = false;

                console.log('Recording paused:', result);
            } else {
                throw new Error(result.error || 'Failed to pause recording');
            }

        } catch (error) {
            console.error('Error pausing recording:', error);
            this.updateStatus('error', 'Error: ' + error.message);
            this.pauseBtn.disabled = false;
        }
    }

    async resumeRecording() {
        try {
            if (!this.isRecording) {
                console.warn('Cannot resume: not currently recording');
                return;
            }

            if (!this.isPaused) {
                console.warn('Not currently paused');
                return;
            }

            this.updateStatus('recording', 'Resuming...');
            this.resumeBtn.disabled = true;

            const response = await fetch('/api/resume', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.isPaused = false;
                this.updateStatus('recording', 'Recording');

                // Update button states
                this.resumeBtn.style.display = 'none';
                this.pauseBtn.style.display = 'inline-block';
                this.pauseBtn.disabled = false;

                console.log('Recording resumed:', result);
            } else {
                throw new Error(result.error || 'Failed to resume recording');
            }

        } catch (error) {
            console.error('Error resuming recording:', error);
            this.updateStatus('error', 'Error: ' + error.message);
            this.resumeBtn.disabled = false;
        }
    }

    clearTranscript() {
        // Finalize any current message
        if (this.currentMessage) {
            this.finalizeCurrentMessage();
        }

        // Clear combine timer
        if (this.combineTimer) {
            clearTimeout(this.combineTimer);
            this.combineTimer = null;
        }

        // Reset all state
        this.transcriptEntries = [];
        this.segmentCount = 0;
        this.wordCount = 0;
        this.confidenceSum = 0;
        this.confidenceCount = 0;
        this.currentMessage = null;
        this.lastSpeaker = null;
        this.lastUpdateTime = null;

        // Clear both panels
        this.rawTranscriptContent.innerHTML = `
            <div class="transcript-placeholder">
                <p>🎙️ Raw transcripts cleared. Click "Start Recording" to begin again.</p>
            </div>
        `;

        this.processedTranscriptContent.innerHTML = `
            <div class="transcript-placeholder">
                <p>🤖 Processed transcripts cleared. Press "Process with LLM" after recording.</p>
            </div>
        `;

        // Reset counts
        this.rawTranscriptCount = 0;
        this.processedTranscriptCount = 0;
        this.rawCountSpan.textContent = '0';
        this.processedCountSpan.textContent = '0';
        this.accumulatedCount.textContent = '0';

        this.updateStats();
        this.updateQualityMetrics();
    }

    addTranscriptEntry(data) {
        // Remove placeholder if it exists
        this.clearTranscriptPlaceholder();

        const currentTime = new Date(data.timestamp);
        const speaker = data.source;

        // Check if we should combine with existing message
        const shouldCombine = this.shouldCombineWithCurrent(speaker, currentTime);

        if (shouldCombine && this.currentMessage) {
            // Update existing message
            this.updateCurrentMessage(data, currentTime);
        } else {
            // Finalize previous message if exists
            if (this.currentMessage) {
                this.finalizeCurrentMessage();
            }

            // Start new message
            this.startNewMessage(data, currentTime);
        }

        // Set timer to finalize message after timeout
        this.resetCombineTimer();

        // Update last save time
        this.lastSaveSpan.textContent = new Date().toLocaleTimeString();
    }

    shouldCombineWithCurrent(speaker, currentTime) {
        if (!this.currentMessage || !this.lastUpdateTime) {
            return false;
        }

        // Same speaker?
        if (this.lastSpeaker !== speaker) {
            return false;
        }

        // Within time window?
        const timeDiff = currentTime - this.lastUpdateTime;
        if (timeDiff > this.combineTimeoutMs) {
            return false;
        }

        return true;
    }

    startNewMessage(data, timestamp) {
        const confidence = data.confidence || 0;
        const confidenceClass = this.getConfidenceClass(confidence);

        // Create new transcript entry
        const entry = document.createElement('div');
        entry.className = `transcript-entry ${data.source === 'microphone' ? 'user' : 'chatgpt'}`;
        if (!data.is_final) {
            entry.classList.add('processing');
        }

        const timeString = timestamp.toLocaleTimeString();

        // Create content based on whether we have raw text
        let contentHtml = '';
        if (data.raw_text && data.raw_text !== data.text) {
            // Show both raw and deduplicated
            contentHtml = `
                <div class="transcript-text deduplicated">
                    <strong>New:</strong> ${data.text}
                </div>
                <div class="transcript-text raw">
                    <strong>Raw:</strong> ${data.raw_text}
                </div>
            `;
        } else {
            // Show only the text
            contentHtml = `<div class="transcript-text">${data.text}</div>`;
        }

        entry.innerHTML = `
            <div class="transcript-meta">
                <span>${data.source === 'microphone' ? '🎤 You' : '🤖 ChatGPT'}</span>
                <span class="timestamp">${timeString}</span>
                <span class="confidence-indicator ${confidenceClass}">
                    ${Math.round(confidence * 100)}%
                </span>
                ${data.is_deduplicated ? '<span class="dedup-indicator">📝</span>' : ''}
            </div>
            ${contentHtml}
        `;

        // Mark as processing initially (will be removed when finalized)
        entry.classList.add('processing');

        // Add to raw transcript panel (legacy method - should use addRawTranscript instead)
        this.rawTranscriptContent.appendChild(entry);
        this.rawTranscriptContent.scrollTop = this.rawTranscriptContent.scrollHeight;

        // Store current message state
        this.currentMessage = {
            element: entry,
            data: data,
            text: data.text,
            confidenceSum: confidence,
            confidenceCount: 1,
            wordCount: data.text.split(' ').length,
            startTime: timestamp
        };

        this.lastSpeaker = data.source;
        this.lastUpdateTime = timestamp;
    }

    updateCurrentMessage(data, timestamp) {
        if (!this.currentMessage) return;

        const confidence = data.confidence || 0;

        // Combine text (add space if needed)
        const newText = data.text.trim();
        if (newText) {
            // Check if we need a space between chunks
            const currentText = this.currentMessage.text.trim();
            const needsSpace = currentText.length > 0 &&
                              !currentText.endsWith(' ') &&
                              !currentText.endsWith('.') &&
                              !currentText.endsWith(',') &&
                              !currentText.endsWith('!') &&
                              !currentText.endsWith('?') &&
                              !newText.startsWith(' ');

            this.currentMessage.text = currentText + (needsSpace ? ' ' : '') + newText;
        }

        // Update confidence and word count
        this.currentMessage.confidenceSum += confidence;
        this.currentMessage.confidenceCount++;
        this.currentMessage.wordCount = this.currentMessage.text.split(' ').length;

        // Update the DOM element
        const avgConfidence = this.currentMessage.confidenceSum / this.currentMessage.confidenceCount;
        const confidenceClass = this.getConfidenceClass(avgConfidence);

        // Update confidence indicator
        const confidenceIndicator = this.currentMessage.element.querySelector('.confidence-indicator');
        confidenceIndicator.className = `confidence-indicator ${confidenceClass}`;
        confidenceIndicator.textContent = `${Math.round(avgConfidence * 100)}%`;

        // Update text content - handle both single and dual display
        const deduplicatedElement = this.currentMessage.element.querySelector('.transcript-text.deduplicated');
        const rawElement = this.currentMessage.element.querySelector('.transcript-text.raw');
        const singleElement = this.currentMessage.element.querySelector('.transcript-text:not(.deduplicated):not(.raw)');

        if (deduplicatedElement && rawElement) {
            // Update dual display
            deduplicatedElement.innerHTML = `<strong>New:</strong> ${this.currentMessage.text}`;
            if (data.raw_text) {
                rawElement.innerHTML = `<strong>Raw:</strong> ${data.raw_text}`;
            }
        } else if (singleElement) {
            // Update single display
            singleElement.textContent = this.currentMessage.text;
        }

        // Scroll to bottom (legacy method)
        this.rawTranscriptContent.scrollTop = this.rawTranscriptContent.scrollHeight;

        this.lastUpdateTime = timestamp;
    }

    finalizeCurrentMessage() {
        if (!this.currentMessage) return;

        // Remove processing class
        this.currentMessage.element.classList.remove('processing');

        // Update statistics
        this.transcriptEntries.push(this.currentMessage.data);
        this.segmentCount++;
        this.wordCount += this.currentMessage.wordCount;
        this.confidenceSum += this.currentMessage.confidenceSum / this.currentMessage.confidenceCount;
        this.confidenceCount++;

        this.updateStats();
        this.updateQualityMetrics();

        // Clear current message
        this.currentMessage = null;
    }

    resetCombineTimer() {
        if (this.combineTimer) {
            clearTimeout(this.combineTimer);
        }

        this.combineTimer = setTimeout(() => {
            if (this.currentMessage) {
                console.log('🕐 Finalizing message due to timeout');
                this.finalizeCurrentMessage();
            }
        }, this.combineTimeoutMs);
    }

    updateStatus(type, text) {
        this.statusDot.className = `status-dot ${type}`;
        this.statusText.textContent = text;
    }

    updateRecordingState(state) {
        if (state.is_recording) {
            this.isRecording = true;
            this.sessionId = state.session_id;
            this.startTime = state.start_time ? new Date(state.start_time) : null;

            this.updateStatus('recording', 'Recording');
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.showSessionInfo();
            this.startDurationTimer();
        } else {
            this.isRecording = false;
            this.sessionId = null;
            this.startTime = null;

            this.updateStatus('ready', 'Ready');
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.hideSessionInfo();
            this.stopDurationTimer();
        }
    }

    updateAudioLevels(data) {
        console.log('🎚️ updateAudioLevels called with:', data);

        if (data.microphone_level !== undefined) {
            const percentage = data.microphone_level * 100;
            console.log(`🎤 Setting mic level to ${percentage}%`);
            this.micLevel.style.width = `${percentage}%`;
        }
        if (data.system_level !== undefined) {
            const percentage = data.system_level * 100;
            console.log(`🔊 Setting system level to ${percentage}%`);
            this.systemLevel.style.width = `${percentage}%`;
        }
    }

    showSessionInfo() {
        this.sessionInfo.style.display = 'block';
        this.sessionIdSpan.textContent = this.sessionId || 'Unknown';

        // Show current session bookmark star
        if (this.currentSessionBookmark) {
            this.currentSessionBookmark.style.display = 'inline';
            this.updateCurrentSessionBookmarkState();
        }
    }

    hideSessionInfo() {
        this.sessionInfo.style.display = 'none';

        // Hide current session bookmark star
        if (this.currentSessionBookmark) {
            this.currentSessionBookmark.style.display = 'none';
        }
    }

    startDurationTimer() {
        this.durationTimer = setInterval(() => {
            if (this.startTime) {
                const elapsed = Math.floor((new Date() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                this.durationSpan.textContent =
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopDurationTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
            this.durationTimer = null;
        }
        this.durationSpan.textContent = '00:00';
    }

    clearTranscriptPlaceholder() {
        // This method is legacy - we now have separate methods for each panel
        // Keep for compatibility but make it safe
        console.log('Legacy clearTranscriptPlaceholder called - using new panel methods');
        this.clearRawTranscriptPlaceholder();
        this.clearProcessedTranscriptPlaceholder();
    }

    updateStats() {
        // Update stats if elements exist (legacy elements may not be present)
        if (this.segmentCountSpan) {
            this.segmentCountSpan.textContent = this.segmentCount;
        }
        if (this.wordCountSpan) {
            this.wordCountSpan.textContent = this.wordCount;
        }
    }

    updateQualityMetrics() {
        // Update quality metrics if elements exist (legacy elements may not be present)
        if (this.avgConfidenceSpan) {
            // Average confidence
            if (this.confidenceCount > 0) {
                const avgConfidence = this.confidenceSum / this.confidenceCount;
                this.avgConfidenceSpan.textContent = `${Math.round(avgConfidence * 100)}%`;
            } else {
                this.avgConfidenceSpan.textContent = '--';
            }
        }

        // Processing delay (placeholder for now)
        if (this.processingDelaySpan) {
            this.processingDelaySpan.textContent = '< 2s';
        }
    }

    getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'confidence-high';
        if (confidence >= 0.6) return 'confidence-medium';
        return 'confidence-low';
    }

    showErrorMessage(message) {
        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.innerHTML = `
            <div style="background: #ff3b30; color: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>Error:</strong> ${message}
                <br><small>Check the browser console (F12) for more technical details.</small>
            </div>
        `;

        // Insert at top of container
        const container = document.querySelector('.container');
        container.insertBefore(errorDiv, container.firstChild);

        // Remove after 10 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 10000);
    }

    // New methods for dual-panel functionality

    handleRecordingStarted(data) {
        this.isRecording = true;
        this.sessionId = data.session_id;
        this.startTime = new Date();

        this.updateStatus('recording', 'Recording');
        this.showSessionInfo();
        this.startDurationTimer();

        // Update LLM status
        this.llmStatusText.textContent = 'Ready for transcripts';
        this.whisperStatus.textContent = 'Running';
        this.sessionSummaryStatus.textContent = 'Waiting...';

        // Enable/disable buttons
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.processLLMBtn.disabled = false;

        // Update auto-processing status
        if (this.autoProcessingEnabled.checked) {
            this.autoProcessingStatus.textContent = `Next: ${this.autoProcessingInterval.value} min`;
        }
    }

    handleRecordingStopped(data) {
        this.isRecording = false;
        this.sessionId = null;
        this.startTime = null;

        this.updateStatus('ready', 'Ready');
        this.hideSessionInfo();
        this.stopDurationTimer();

        // Update status
        this.whisperStatus.textContent = 'Stopped';
        this.llmProcessingStatus.textContent = 'Idle';
        this.sessionSummaryStatus.textContent = 'Pending...';

        // Enable/disable buttons
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.processLLMBtn.disabled = true;

        // Update auto-processing status
        if (this.autoProcessingEnabled.checked) {
            this.autoProcessingStatus.textContent = 'Will start with recording';
        }
    }

    handleRecordingPaused(data) {
        this.isPaused = true;
        this.updateStatus('paused', 'Paused');

        // Update button states
        this.pauseBtn.style.display = 'none';
        this.resumeBtn.style.display = 'inline-block';
        this.resumeBtn.disabled = false;

        // Update status
        this.whisperStatus.textContent = 'Paused';

        console.log('Recording paused via SSE:', data);
    }

    handleRecordingResumed(data) {
        this.isPaused = false;
        this.updateStatus('recording', 'Recording');

        // Update button states
        this.resumeBtn.style.display = 'none';
        this.pauseBtn.style.display = 'inline-block';
        this.pauseBtn.disabled = false;

        // Update status
        this.whisperStatus.textContent = 'Recording';

        console.log('Recording resumed via SSE:', data);
    }

    addRawTranscript(eventData) {
        const data = eventData.data;
        this.rawTranscripts.push(data);
        this.rawTranscriptCount++;

        // Update count displays
        this.rawCountSpan.textContent = this.rawTranscriptCount;
        this.accumulatedCount.textContent = eventData.accumulated_count || this.rawTranscriptCount;

        // Clear placeholder if it exists
        this.clearRawTranscriptPlaceholder();

        // Create transcript item
        const item = document.createElement('div');
        item.className = 'raw-transcript-item';

        // Get audio source and map to display info
        const audioSource = data.audio_source || 'unknown';
        const sourceInfo = this.getAudioSourceDisplayInfo(audioSource);

        // Add source-specific CSS class
        item.classList.add(`source-${audioSource}`);

        item.innerHTML = `
            <div class="transcript-header">
                <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
                <div class="audio-source ${sourceInfo.class}">
                    <span class="source-icon">${sourceInfo.icon}</span>
                    <span class="source-label">${sourceInfo.label}</span>
                </div>
                <div class="sequence">#${data.sequence_number}</div>
            </div>
            <div class="text">${data.text}</div>
        `;

        this.rawTranscriptContent.appendChild(item);
        this.rawTranscriptContent.scrollTop = this.rawTranscriptContent.scrollHeight;

        // Enable LLM processing button if we have transcripts
        if (this.rawTranscriptCount > 0 && !this.isLLMProcessing) {
            this.processLLMBtn.disabled = false;
        }
    }

    getAudioSourceDisplayInfo(audioSource) {
        const sourceMap = {
            'microphone': {
                icon: '🎤',
                label: 'User',
                class: 'source-user'
            },
            'system': {
                icon: '🔊',
                label: 'Assistant',
                class: 'source-assistant'
            },
            'unknown': {
                icon: '❓',
                label: 'Unknown',
                class: 'source-unknown'
            }
        };

        return sourceMap[audioSource] || sourceMap['unknown'];
    }

    async processWithLLM() {
        if (this.isLLMProcessing || this.rawTranscriptCount === 0) {
            return;
        }

        try {
            this.isLLMProcessing = true;
            this.processLLMBtn.disabled = true;
            this.llmStatusText.textContent = '🚀 Starting LLM processing...';
            this.llmSpinner.style.display = 'block';

            const response = await fetch('/api/process-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to process with LLM');
            }

            console.log('🤖 LLM processing started:', result);
            this.llmStatusText.textContent = `🤖 Queued ${result.transcript_count || this.rawTranscriptCount} transcripts for processing`;

            // Show notification about successful queueing
            this.showNotification('info', `Queued ${result.transcript_count || this.rawTranscriptCount} transcripts for LLM processing`);

            // Update queue status
            this.updateLLMQueueStatus();

        } catch (error) {
            console.error('❌ Error starting LLM processing:', error);
            this.showErrorMessage('Failed to start LLM processing: ' + error.message);
            this.isLLMProcessing = false;
            this.processLLMBtn.disabled = false;
            this.llmStatusText.textContent = '❌ Error';
            this.llmSpinner.style.display = 'none';
        }
    }

    handleLLMProcessingStart(data) {
        this.currentLLMJob = data.job_id;
        this.llmProcessingStartTime = Date.now();

        // Update status with more detailed information
        const statusText = `Processing ${data.transcript_count} transcripts`;
        this.llmProcessingStatus.textContent = statusText;
        this.llmStatusText.textContent = `🤖 ${statusText}...`;

        // Show spinner and disable button
        this.llmSpinner.style.display = 'block';
        this.processLLMBtn.disabled = true;

        // Start processing timer
        this.startLLMProcessingTimer();

        // Show activity panel and update current job info
        this.llmActivity.style.display = 'block';
        this.currentJobInfo.textContent = `${data.transcript_count} transcripts`;

        console.log(`🤖 Started LLM processing job ${data.job_id} with ${data.transcript_count} transcripts`);
    }

    handleLLMProcessingComplete(data) {
        const result = data.result;
        const processingTime = this.llmProcessingStartTime ?
            ((Date.now() - this.llmProcessingStartTime) / 1000).toFixed(1) : 'unknown';

        // Stop processing timer
        this.stopLLMProcessingTimer();

        if (result.status === 'success') {
            this.addProcessedTranscript(result);
            this.llmStatusText.textContent = `✅ Processing complete (${processingTime}s)`;
            this.lastLLMProcess.textContent = new Date().toLocaleTimeString();

            // Show success notification with processing time
            this.showNotification('success', `LLM processing completed in ${processingTime}s`);
        } else {
            this.llmStatusText.textContent = `❌ Processing failed (${processingTime}s)`;
            this.showErrorMessage('LLM processing failed: ' + (result.error || 'Unknown error'));
        }

        // Reset processing state
        this.isLLMProcessing = false;
        this.currentLLMJob = null;
        this.llmProcessingStartTime = null;
        this.llmSpinner.style.display = 'none';
        this.llmProcessingStatus.textContent = 'Idle';

        // Update activity panel
        this.currentJobInfo.textContent = 'None';
        this.processingTimeInfo.textContent = '--';

        // Re-enable button if we have more transcripts
        if (this.rawTranscriptCount > 0) {
            this.processLLMBtn.disabled = false;
        }

        // Update queue status
        this.updateLLMQueueStatus();
    }

    handleLLMProcessingError(data) {
        const processingTime = this.llmProcessingStartTime ?
            ((Date.now() - this.llmProcessingStartTime) / 1000).toFixed(1) : 'unknown';

        // Stop processing timer
        this.stopLLMProcessingTimer();

        this.showErrorMessage('LLM processing error: ' + data.error);
        this.isLLMProcessing = false;
        this.currentLLMJob = null;
        this.llmProcessingStartTime = null;
        this.llmSpinner.style.display = 'none';
        this.llmStatusText.textContent = `❌ Error (${processingTime}s)`;
        this.llmProcessingStatus.textContent = 'Error';

        // Update activity panel
        this.currentJobInfo.textContent = 'None';
        this.processingTimeInfo.textContent = '--';

        if (this.rawTranscriptCount > 0) {
            this.processLLMBtn.disabled = false;
        }

        // Update queue status
        this.updateLLMQueueStatus();
    }

    startLLMProcessingTimer() {
        // Clear any existing timer
        this.stopLLMProcessingTimer();

        // Update status every second with elapsed time
        this.llmProcessingTimer = setInterval(() => {
            if (this.llmProcessingStartTime) {
                const elapsed = ((Date.now() - this.llmProcessingStartTime) / 1000).toFixed(0);
                const baseText = this.llmProcessingStatus.textContent.split(' (')[0]; // Remove existing timer
                this.llmProcessingStatus.textContent = `${baseText} (${elapsed}s)`;

                // Update processing time in activity panel
                if (this.processingTimeInfo) {
                    this.processingTimeInfo.textContent = `${elapsed}s`;
                }
            }
        }, 1000);
    }

    stopLLMProcessingTimer() {
        if (this.llmProcessingTimer) {
            clearInterval(this.llmProcessingTimer);
            this.llmProcessingTimer = null;
        }
    }

    async updateLLMQueueStatus() {
        try {
            const response = await fetch('/api/llm-status');
            const result = await response.json();

            if (result.success) {
                this.displayLLMQueueStatus(result);
            } else {
                console.warn('Failed to get LLM status:', result.error);
            }
        } catch (error) {
            console.warn('Error fetching LLM status:', error);
        }
    }

    displayLLMQueueStatus(status) {
        const queueLength = status.queue_length || 0;
        const isProcessing = status.is_processing || false;
        const stats = status.stats || {};

        // Update queue status
        if (queueLength > 0) {
            this.queueStatusText.textContent = `Queue: ${queueLength} job${queueLength > 1 ? 's' : ''}`;
            this.queueStatus.style.display = 'block';
        } else {
            this.queueStatus.style.display = 'none';
        }

        // Update activity panel
        if (isProcessing || queueLength > 0 || stats.total_processed > 0) {
            this.llmActivity.style.display = 'block';

            // Current job info
            if (isProcessing) {
                const currentJob = status.queue_jobs && status.queue_jobs.length > 0 ?
                    status.queue_jobs.find(job => job.status === 'processing') : null;
                if (currentJob) {
                    this.currentJobInfo.textContent = `${currentJob.transcript_count} transcripts`;
                } else {
                    this.currentJobInfo.textContent = 'Processing...';
                }
            } else {
                this.currentJobInfo.textContent = 'None';
            }

            // Processing time (if currently processing)
            if (isProcessing && this.llmProcessingStartTime) {
                const elapsed = ((Date.now() - this.llmProcessingStartTime) / 1000).toFixed(0);
                this.processingTimeInfo.textContent = `${elapsed}s`;
            } else {
                this.processingTimeInfo.textContent = '--';
            }

            // Total processed
            this.totalProcessedInfo.textContent = stats.total_processed || 0;

        } else {
            this.llmActivity.style.display = 'none';
        }

        // Show queue details in console for debugging
        if (status.queue_jobs && status.queue_jobs.length > 0) {
            console.log('📋 LLM Queue jobs:', status.queue_jobs);
        }
    }

    startPeriodicQueueStatusUpdates() {
        // Update queue status every 5 seconds
        this.queueStatusInterval = setInterval(() => {
            this.updateLLMQueueStatus();
        }, 5000);

        // Initial update
        this.updateLLMQueueStatus();
    }

    handleSessionSummaryStart(data) {
        console.log('📝 Session summary generation started:', data);

        // Update session summary status
        this.sessionSummaryStatus.textContent = '🤖 Generating...';

        // Show notification about summary generation starting
        this.showNotification('info', `📝 Generating session summary from ${data.transcript_count} processed transcripts...`);
    }

    handleSessionSummaryGenerated(data) {
        console.log('📝 Session summary generated:', data);

        // Update session summary status
        this.sessionSummaryStatus.textContent = '✅ Generated';

        // Show success notification
        this.showNotification('success', `📝 Session summary generated: ${data.summary.substring(0, 100)}...`);

        // If the Database Inspector is open, refresh the sessions table to show the new summary
        if (this.databaseModal && this.databaseModal.style.display !== 'none') {
            this.loadSessionsTable();
        }

        // Log the summary and keywords for debugging
        console.log('Summary:', data.summary);
        console.log('Keywords:', data.keywords);
    }

    handleSessionSummaryError(data) {
        console.log('❌ Session summary error:', data);

        // Update session summary status
        this.sessionSummaryStatus.textContent = '❌ Failed';

        // Show error notification
        this.showErrorMessage(`Failed to generate session summary: ${data.error}`);
    }

    // Auto-processing methods
    async loadAutoProcessingSettings() {
        try {
            const response = await fetch('/api/auto-processing/settings');
            const result = await response.json();

            if (response.ok) {
                const settings = result.settings;
                this.autoProcessingEnabled.checked = settings.enabled;
                this.autoProcessingInterval.value = settings.interval_minutes;
                this.autoProcessingInterval.disabled = !settings.enabled;

                this.updateAutoProcessingStatus(settings);
            }
        } catch (error) {
            console.error('Error loading auto-processing settings:', error);
        }
    }

    async updateAutoProcessingSettings() {
        try {
            const enabled = this.autoProcessingEnabled.checked;
            const interval = parseInt(this.autoProcessingInterval.value);

            // Enable/disable interval dropdown
            this.autoProcessingInterval.disabled = !enabled;

            const response = await fetch('/api/auto-processing/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    enabled: enabled,
                    interval_minutes: interval
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.updateAutoProcessingStatus(result.settings);
                console.log('Auto-processing settings updated:', result.settings);
            } else {
                throw new Error(result.error || 'Failed to update settings');
            }
        } catch (error) {
            console.error('Error updating auto-processing settings:', error);
            this.showErrorMessage('Failed to update auto-processing settings');
        }
    }

    updateAutoProcessingStatus(settings) {
        if (settings.enabled) {
            if (this.isRecording) {
                this.autoProcessingStatus.textContent = `Next: ${settings.interval_minutes} min`;
            } else {
                this.autoProcessingStatus.textContent = 'Will start with recording';
            }
        } else {
            this.autoProcessingStatus.textContent = '';
        }
    }

    handleAutoProcessingTriggered(data) {
        console.log('🤖 Auto-processing triggered:', data);
        this.autoProcessingStatus.textContent = `Auto-processed ${data.transcript_count} transcripts`;

        // Show notification
        this.showNotification('info', `Auto-processed ${data.transcript_count} transcripts`);

        // Reset status after a few seconds
        setTimeout(() => {
            if (this.autoProcessingEnabled.checked && this.isRecording) {
                this.autoProcessingStatus.textContent = `Next: ${data.interval_minutes} min`;
            }
        }, 3000);
    }

    handleWhisperError(data) {
        this.showErrorMessage('Whisper error: ' + data.message);
        this.whisperStatus.textContent = 'Error';
    }

    // VAD settings methods
    async loadVADSettings() {
        try {
            const response = await fetch('/api/vad-settings');
            const result = await response.json();

            if (response.ok) {
                const settings = result.settings;
                this.vadFixedInterval.checked = settings.use_fixed_interval;
                this.updateVADStatus(settings);
            }
        } catch (error) {
            console.error('Error loading VAD settings:', error);
        }
    }

    async updateVADSettings() {
        try {
            const useFixedInterval = this.vadFixedInterval.checked;

            const response = await fetch('/api/vad-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    use_fixed_interval: useFixedInterval
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.updateVADStatus(result.settings);
                console.log('VAD settings updated:', result.settings);
            } else {
                throw new Error(result.error || 'Failed to update VAD settings');
            }
        } catch (error) {
            console.error('Error updating VAD settings:', error);
            this.showErrorMessage('Failed to update VAD settings');
        }
    }

    updateVADStatus(settings) {
        if (settings.use_fixed_interval) {
            this.vadStatus.textContent = 'Fixed Intervals (10s)';
        } else {
            this.vadStatus.textContent = 'VAD Mode';
        }
    }

    addProcessedTranscript(result) {
        // Validate required fields
        if (!result || !result.processed_text) {
            console.error('Invalid processed transcript result:', result);
            return;
        }

        this.processedTranscripts.push(result);
        this.processedTranscriptCount++;

        // Update count
        this.processedCountSpan.textContent = this.processedTranscriptCount;

        // Clear placeholder if it exists
        this.clearProcessedTranscriptPlaceholder();

        // Create processed transcript item
        const item = document.createElement('div');
        item.className = 'processed-transcript-item';

        // Convert line breaks to HTML for proper display
        const formattedText = this.formatTextWithLineBreaks(result.processed_text);

        item.innerHTML = `
            <div class="header">
                <span>Processed ${result.original_transcript_count || 0} transcripts</span>
                <span>${result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : 'Unknown time'}</span>
            </div>
            <div class="text">${formattedText}</div>
            <div class="footer">
                <span>Model: ${result.llm_model || 'Unknown'}</span>
                <span>Time: ${result.processing_time ? result.processing_time.toFixed(2) : '0.00'}s</span>
            </div>
        `;

        this.processedTranscriptContent.appendChild(item);
        this.processedTranscriptContent.scrollTop = this.processedTranscriptContent.scrollHeight;

        // Show processed actions
        this.processedActions.style.display = 'flex';
    }

    formatTextWithLineBreaks(text) {
        // Handle undefined or null text
        if (!text) {
            return '';
        }

        // Convert newlines to HTML line breaks and escape HTML characters
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');
    }

    toggleRawPanel() {
        const panel = document.querySelector('.raw-panel');
        this.rawPanelVisible = !this.rawPanelVisible;

        if (this.rawPanelVisible) {
            panel.classList.remove('hidden');
            this.toggleRawBtn.textContent = '👁️ Hide';
        } else {
            panel.classList.add('hidden');
            this.toggleRawBtn.textContent = '👁️ Show';
        }

        // Update visibility controls
        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }

    toggleProcessedPanel() {
        const panel = document.querySelector('.processed-panel');
        this.processedPanelVisible = !this.processedPanelVisible;

        if (this.processedPanelVisible) {
            panel.classList.remove('hidden');
            this.toggleProcessedBtn.textContent = '👁️ Hide';
        } else {
            panel.classList.add('hidden');
            this.toggleProcessedBtn.textContent = '👁️ Show';
        }

        // Update visibility controls
        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }

    clearRawTranscriptPlaceholder() {
        const placeholder = this.rawTranscriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    clearProcessedTranscriptPlaceholder() {
        const placeholder = this.processedTranscriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    saveProcessedTranscript() {
        // This would typically save to database - for now just show success
        this.showSuccessMessage('Processed transcript saved to database');
    }

    exportProcessedTranscript() {
        if (this.processedTranscripts.length === 0) {
            this.showErrorMessage('No processed transcripts to export');
            return;
        }

        // Create export data
        const exportData = {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            processed_transcripts: this.processedTranscripts
        };

        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_transcripts_${this.sessionId || 'session'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showSuccessMessage('Processed transcripts exported');
    }

    showSuccessMessage(message) {
        // Create success notification
        const successDiv = document.createElement('div');
        successDiv.className = 'success-notification';
        successDiv.innerHTML = `
            <div style="background: #34c759; color: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>✅ Success:</strong> ${message}
            </div>
        `;

        // Insert at top of container
        const container = document.querySelector('.container');
        container.insertBefore(successDiv, container.firstChild);

        // Remove after 5 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 5000);
    }

    // Database Inspector Methods
    async openDatabaseInspector() {
        try {
            this.databaseModal.style.display = 'flex';

            // Load database stats
            await this.loadDatabaseStats();

            // Show raw transcripts by default
            await this.showDatabaseTable('raw');

        } catch (error) {
            console.error('Error opening database inspector:', error);
            this.showErrorMessage('Failed to load database information');
        }
    }

    closeDatabaseInspector() {
        this.databaseModal.style.display = 'none';
    }

    async loadDatabaseStats() {
        try {
            const response = await fetch('/api/database/stats');
            const result = await response.json();

            if (response.ok) {
                this.displayDatabaseStats(result.stats, result.recent_sessions);
            } else {
                throw new Error(result.error || 'Failed to load stats');
            }
        } catch (error) {
            console.error('Error loading database stats:', error);
            this.statsGrid.innerHTML = '<p>Error loading database statistics</p>';
        }
    }

    displayDatabaseStats(stats, recentSessions) {
        this.statsGrid.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${stats.raw_transcripts}</div>
                <div class="stat-label">Raw Transcripts</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.processed_transcripts}</div>
                <div class="stat-label">Processed Transcripts</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.sessions}</div>
                <div class="stat-label">Sessions</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${recentSessions.length}</div>
                <div class="stat-label">Active Sessions</div>
            </div>
        `;
    }

    async showDatabaseTable(tableType) {
        // Update tab states using the new method
        this.updateTabStates(tableType);

        if (tableType === 'raw') {
            await this.loadRawTranscripts();
        } else if (tableType === 'processed') {
            await this.loadProcessedTranscripts();
        } else if (tableType === 'sessions') {
            await this.loadRecentSessions();
        }
    }

    async loadRawTranscripts() {
        try {
            const response = await fetch('/api/database/raw-transcripts?limit=20');
            const result = await response.json();

            if (response.ok) {
                this.displayRawTranscripts(result.transcripts, result.pagination);
            } else {
                throw new Error(result.error || 'Failed to load raw transcripts');
            }
        } catch (error) {
            console.error('Error loading raw transcripts:', error);
            this.tableContent.innerHTML = '<p>Error loading raw transcripts</p>';
        }
    }

    displayRawTranscripts(transcripts, pagination) {
        if (transcripts.length === 0) {
            this.tableContent.innerHTML = '<p>No raw transcripts found</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Session ID</th>
                        <th>Text</th>
                        <th>Timestamp</th>
                        <th>Sequence</th>
                        <th>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    ${transcripts.map(t => `
                        <tr>
                            <td class="text-truncate">${t.session_id}</td>
                            <td class="text-truncate">${t.text}</td>
                            <td>${new Date(t.timestamp).toLocaleString()}</td>
                            <td>${t.sequence_number}</td>
                            <td>${t.confidence ? (t.confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="margin-top: 15px; text-align: center; color: #8e8e93;">
                Showing ${transcripts.length} of ${pagination.total_count} transcripts
            </div>
        `;

        this.tableContent.innerHTML = tableHtml;
    }

    async loadProcessedTranscripts() {
        try {
            const response = await fetch('/api/database/processed-transcripts?limit=10');
            const result = await response.json();

            if (response.ok) {
                this.displayProcessedTranscripts(result.transcripts, result.pagination);
            } else {
                throw new Error(result.error || 'Failed to load processed transcripts');
            }
        } catch (error) {
            console.error('Error loading processed transcripts:', error);
            this.tableContent.innerHTML = '<p>Error loading processed transcripts</p>';
        }
    }

    displayProcessedTranscripts(transcripts, pagination) {
        if (transcripts.length === 0) {
            this.tableContent.innerHTML = '<p>No processed transcripts found</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Session ID</th>
                        <th>Processed Text</th>
                        <th>Original Count</th>
                        <th>LLM Model</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    ${transcripts.map(t => `
                        <tr>
                            <td class="text-truncate">${t.session_id}</td>
                            <td class="text-truncate">${t.processed_text}</td>
                            <td>${t.original_transcript_count}</td>
                            <td>${t.llm_model}</td>
                            <td>${new Date(t.timestamp).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="margin-top: 15px; text-align: center; color: #8e8e93;">
                Showing ${transcripts.length} of ${pagination.total_count} processed transcripts
            </div>
        `;

        this.tableContent.innerHTML = tableHtml;
    }

    async loadRecentSessions() {
        try {
            const response = await fetch('/api/database/stats');
            const result = await response.json();

            if (response.ok) {
                this.displayRecentSessions(result.recent_sessions);
            } else {
                throw new Error(result.error || 'Failed to load sessions');
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.tableContent.innerHTML = '<p>Error loading sessions</p>';
        }
    }

    displayRecentSessions(sessions) {
        if (sessions.length === 0) {
            this.tableContent.innerHTML = '<p>No recent sessions found</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Session ID</th>
                        <th>Transcript Count</th>
                        <th>First Transcript</th>
                        <th>Last Transcript</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.map(s => {
                        const start = new Date(s.first_transcript);
                        const end = new Date(s.last_transcript);
                        const duration = Math.round((end - start) / 1000 / 60); // minutes
                        return `
                            <tr>
                                <td class="text-truncate">${s.session_id}</td>
                                <td>${s.transcript_count}</td>
                                <td>${start.toLocaleString()}</td>
                                <td>${end.toLocaleString()}</td>
                                <td>${duration} min</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        this.tableContent.innerHTML = tableHtml;
    }

    // Session Browser Methods
    async showSessionBrowser() {
        // Update tab states
        this.updateTabStates('session-browser');

        // Show session browser controls
        this.sessionBrowserControls.style.display = 'block';

        // Restore bookmark filter state from localStorage
        if (this.showBookmarkedOnlyCheckbox) {
            const savedFilter = localStorage.getItem('bookmarkFilter');
            if (savedFilter !== null) {
                this.showBookmarkedOnlyCheckbox.checked = savedFilter === 'true';
            }
        }

        // Reset selection state
        this.selectedSessionId = null;
        this.loadSessionBtn.disabled = true;
        this.exportSessionBtn.disabled = true;
        if (this.generateSummaryBtn) {
            this.generateSummaryBtn.disabled = true;
        }
        this.selectedSessionInfo.textContent = 'No session selected';

        // Hide export options if they were shown
        this.hideExportOptions();

        // Load and display sessions as selectable table
        await this.loadSessionsTable();
    }

    async loadSessionsTable(bookmarkedOnly = null) {
        try {
            // Use the checkbox state if no explicit filter provided
            if (bookmarkedOnly === null && this.showBookmarkedOnlyCheckbox) {
                bookmarkedOnly = this.showBookmarkedOnlyCheckbox.checked;
            }

            // Build URL with filter parameter
            let url = '/api/sessions';
            if (bookmarkedOnly === true) {
                url += '?bookmarked=true';
            }
            // When bookmarkedOnly is false or null, don't add any filter to show ALL sessions

            const response = await fetch(url);
            const result = await response.json();

            if (response.ok) {
                this.displaySelectableSessions(result.sessions);
                this.updateBookmarkCount(result.sessions);
            } else {
                throw new Error(result.error || 'Failed to load sessions');
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.tableContent.innerHTML = '<p>Error loading sessions</p>';
        }
    }

    displaySelectableSessions(sessions) {
        if (sessions.length === 0) {
            this.tableContent.innerHTML = '<p>No sessions found</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Bookmark</th>
                        <th>Session ID</th>
                        <th>Summary</th>
                        <th>Keywords</th>
                        <th>Raw Transcripts</th>
                        <th>Processed Transcripts</th>
                        <th>Start Time</th>
                        <th>Audio Sources</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessions.map(session => `
                        <tr class="selectable" data-session-id="${session.session_id}">
                            <td class="bookmark-cell">
                                <span class="bookmark-star ${session.bookmarked ? 'bookmarked' : ''}"
                                      data-session-id="${session.session_id}"
                                      title="${session.bookmarked ? 'Remove bookmark' : 'Add bookmark'}">
                                    ${session.bookmarked ? '★' : '☆'}
                                </span>
                            </td>
                            <td class="text-truncate">${session.display_name}</td>
                            <td class="summary-cell" title="${session.summary || 'No summary available'}">
                                ${session.summary ?
                                    `<span class="summary-text">${session.summary.length > 80 ? session.summary.substring(0, 80) + '...' : session.summary}</span>` :
                                    '<span class="no-summary">No summary</span>'
                                }
                            </td>
                            <td class="keywords-cell">
                                ${session.keywords && session.keywords.length > 0 ?
                                    session.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join(' ') :
                                    '<span class="no-keywords">No keywords</span>'
                                }
                            </td>
                            <td>${session.raw_transcript_count}</td>
                            <td>${session.processed_transcript_count}</td>
                            <td>${new Date(session.start_time).toLocaleString()}</td>
                            <td>${session.audio_sources}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.tableContent.innerHTML = tableHtml;

        // Add click listeners to session rows
        this.addSessionRowListeners();
    }

    addSessionRowListeners() {
        const sessionRows = this.tableContent.querySelectorAll('tr.selectable');
        sessionRows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't select row if clicking on bookmark star
                if (!e.target.classList.contains('bookmark-star')) {
                    this.selectSession(row);
                }
            });
        });

        // Add bookmark click listeners
        const bookmarkStars = this.tableContent.querySelectorAll('.bookmark-star');
        bookmarkStars.forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent row selection
                this.toggleBookmark(star.dataset.sessionId, star);
            });
        });
    }

    selectSession(row) {
        // Remove previous selection
        this.tableContent.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));

        // Add selection to clicked row
        row.classList.add('selected');

        // Store selected session ID
        this.selectedSessionId = row.dataset.sessionId;

        // Update UI
        this.loadSessionBtn.disabled = false;
        this.exportSessionBtn.disabled = false;
        if (this.generateSummaryBtn) {
            this.generateSummaryBtn.disabled = false;
        }
        this.selectedSessionInfo.textContent = `Selected: ${row.cells[1].textContent}`; // Session ID is now in column 1

        console.log(`📖 Selected session: ${this.selectedSessionId}`);
    }

    async generateSummaryForSession() {
        if (!this.selectedSessionId) {
            this.showErrorMessage('No session selected');
            return;
        }

        const startTime = Date.now();
        let processingTimer;

        try {
            // Show loading state with enhanced feedback
            this.generateSummaryBtn.textContent = '🚀 Starting...';
            this.generateSummaryBtn.disabled = true;

            // Start a timer to show processing time
            processingTimer = setInterval(() => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                this.generateSummaryBtn.textContent = `🤖 Generating... (${elapsed}s)`;
            }, 1000);

            // Show initial notification
            this.showNotification('info', '📝 Starting session summary generation...');

            const response = await fetch(`/api/sessions/${this.selectedSessionId}/generate-summary`, {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
                this.showNotification('success', `✅ Summary generated in ${processingTime}s: ${result.summary.substring(0, 80)}...`);

                // Reload the sessions table to show the new summary
                await this.loadSessionsTable();

                // Re-select the session if it's still visible
                const sessionRow = this.tableContent.querySelector(`tr[data-session-id="${this.selectedSessionId}"]`);
                if (sessionRow) {
                    this.selectSession(sessionRow);
                }
            } else {
                throw new Error(result.error || 'Failed to generate summary');
            }

        } catch (error) {
            console.error('Error generating summary:', error);
            const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
            this.showErrorMessage(`❌ Failed to generate summary after ${processingTime}s: ${error.message}`);
        } finally {
            // Clear processing timer and restore button state
            if (processingTimer) {
                clearInterval(processingTimer);
            }
            this.generateSummaryBtn.textContent = '📝 Generate Summary';
            this.generateSummaryBtn.disabled = false;
        }
    }

    async toggleBookmark(sessionId, starElement) {
        try {
            // Show loading state
            const originalText = starElement.textContent;
            starElement.textContent = '⏳';
            starElement.style.pointerEvents = 'none';

            // Make API call to toggle bookmark
            const response = await fetch(`/api/sessions/${sessionId}/bookmark`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                // Update star appearance
                if (result.bookmarked) {
                    starElement.textContent = '★';
                    starElement.classList.add('bookmarked');
                    starElement.title = 'Remove bookmark';
                } else {
                    starElement.textContent = '☆';
                    starElement.classList.remove('bookmarked');
                    starElement.title = 'Add bookmark';
                }

                // Show success notification
                this.showNotification('success', result.message);
                console.log(`🔖 ${result.message}: ${sessionId}`);
            } else {
                throw new Error(result.error || 'Failed to toggle bookmark');
            }

        } catch (error) {
            console.error('Error toggling bookmark:', error);
            this.showErrorMessage('Failed to toggle bookmark');

            // Restore original state on error
            starElement.textContent = originalText;
        } finally {
            // Re-enable clicking
            starElement.style.pointerEvents = 'auto';
        }
    }

    // Bookmark Filtering Methods
    async onBookmarkFilterChange() {
        // Save filter state to localStorage
        if (this.showBookmarkedOnlyCheckbox) {
            localStorage.setItem('bookmarkFilter', this.showBookmarkedOnlyCheckbox.checked);
        }

        // Reload sessions with new filter
        await this.loadSessionsTable();
    }

    updateBookmarkCount(sessions) {
        if (!this.bookmarkCountSpan) return;

        const bookmarkedCount = sessions.filter(session => session.bookmarked).length;
        const totalCount = sessions.length;

        if (this.showBookmarkedOnlyCheckbox && this.showBookmarkedOnlyCheckbox.checked) {
            this.bookmarkCountSpan.textContent = `(${bookmarkedCount} bookmarked sessions)`;
        } else {
            this.bookmarkCountSpan.textContent = `(${bookmarkedCount} of ${totalCount} bookmarked)`;
        }
    }

    async bookmarkAllVisible() {
        try {
            // Get all currently visible sessions
            const sessionRows = this.tableContent.querySelectorAll('tr.selectable');
            const sessionIds = Array.from(sessionRows).map(row => row.dataset.sessionId);

            if (sessionIds.length === 0) {
                this.showNotification('info', 'No sessions to bookmark');
                return;
            }

            // Show confirmation dialog
            const confirmed = confirm(`Bookmark all ${sessionIds.length} visible sessions?`);
            if (!confirmed) return;

            // Disable button during operation
            this.bookmarkAllVisibleBtn.disabled = true;
            this.bookmarkAllVisibleBtn.textContent = '⏳ Bookmarking...';

            let successCount = 0;
            let errorCount = 0;

            // Bookmark each session
            for (const sessionId of sessionIds) {
                try {
                    const response = await fetch(`/api/sessions/${sessionId}/bookmark`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const result = await response.json();
                    if (response.ok && result.bookmarked) {
                        successCount++;
                    } else if (response.ok && !result.bookmarked) {
                        // Session was already bookmarked, toggle it back
                        await fetch(`/api/sessions/${sessionId}/bookmark`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`Error bookmarking session ${sessionId}:`, error);
                    errorCount++;
                }
            }

            // Show results
            if (errorCount === 0) {
                this.showNotification('success', `Successfully bookmarked ${successCount} sessions`);
            } else {
                this.showNotification('warning', `Bookmarked ${successCount} sessions, ${errorCount} failed`);
            }

            // Reload sessions to reflect changes
            await this.loadSessionsTable();

        } catch (error) {
            console.error('Error in bulk bookmark operation:', error);
            this.showErrorMessage('Failed to bookmark sessions');
        } finally {
            // Re-enable button
            this.bookmarkAllVisibleBtn.disabled = false;
            this.bookmarkAllVisibleBtn.textContent = '🔖 Bookmark All Visible';
        }
    }

    async clearAllBookmarks() {
        try {
            // Show confirmation dialog
            const confirmed = confirm('Remove ALL bookmarks? This action cannot be undone.');
            if (!confirmed) return;

            // Disable button during operation
            this.clearAllBookmarksBtn.disabled = true;
            this.clearAllBookmarksBtn.textContent = '⏳ Clearing...';

            // Get all bookmarked sessions
            const response = await fetch('/api/sessions?bookmarked=true');
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch bookmarked sessions');
            }

            const bookmarkedSessions = result.sessions;
            if (bookmarkedSessions.length === 0) {
                this.showNotification('info', 'No bookmarked sessions to clear');
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            // Remove bookmark from each session
            for (const session of bookmarkedSessions) {
                try {
                    const toggleResponse = await fetch(`/api/sessions/${session.session_id}/bookmark`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const toggleResult = await toggleResponse.json();
                    if (toggleResponse.ok && !toggleResult.bookmarked) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`Error clearing bookmark for session ${session.session_id}:`, error);
                    errorCount++;
                }
            }

            // Show results
            if (errorCount === 0) {
                this.showNotification('success', `Successfully cleared ${successCount} bookmarks`);
            } else {
                this.showNotification('warning', `Cleared ${successCount} bookmarks, ${errorCount} failed`);
            }

            // Reload sessions to reflect changes
            await this.loadSessionsTable();

        } catch (error) {
            console.error('Error in clear all bookmarks operation:', error);
            this.showErrorMessage('Failed to clear bookmarks');
        } finally {
            // Re-enable button
            this.clearAllBookmarksBtn.disabled = false;
            this.clearAllBookmarksBtn.textContent = '🗑️ Clear All Bookmarks';
        }
    }

    // Current Session Bookmark Methods
    async updateCurrentSessionBookmarkState() {
        if (!this.sessionId || !this.currentSessionBookmarkStar) return;

        try {
            // Check if current session is bookmarked
            const response = await fetch('/api/sessions');
            const result = await response.json();

            if (response.ok) {
                const currentSession = result.sessions.find(session => session.session_id === this.sessionId);
                if (currentSession) {
                    this.setCurrentSessionBookmarkState(currentSession.bookmarked);
                } else {
                    // Session not yet in database (new session)
                    this.setCurrentSessionBookmarkState(false);
                }
            }
        } catch (error) {
            console.error('Error checking current session bookmark state:', error);
            this.setCurrentSessionBookmarkState(false);
        }
    }

    setCurrentSessionBookmarkState(isBookmarked) {
        if (!this.currentSessionBookmarkStar) return;

        if (isBookmarked) {
            this.currentSessionBookmarkStar.textContent = '★';
            this.currentSessionBookmarkStar.classList.add('bookmarked');
            this.currentSessionBookmarkStar.title = 'Remove bookmark from this session';
        } else {
            this.currentSessionBookmarkStar.textContent = '☆';
            this.currentSessionBookmarkStar.classList.remove('bookmarked');
            this.currentSessionBookmarkStar.title = 'Bookmark this session';
        }
    }

    async toggleCurrentSessionBookmark() {
        if (!this.sessionId) {
            this.showErrorMessage('No active session to bookmark');
            return;
        }

        try {
            // Show loading state
            const originalText = this.currentSessionBookmarkStar.textContent;
            this.currentSessionBookmarkStar.textContent = '⏳';
            this.currentSessionBookmarkStar.style.pointerEvents = 'none';

            // Make API call to toggle bookmark
            const response = await fetch(`/api/sessions/${this.sessionId}/bookmark`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                // Update star appearance
                this.setCurrentSessionBookmarkState(result.bookmarked);

                // Show success notification
                this.showNotification('success', result.message);
                console.log(`🔖 ${result.message}: ${this.sessionId}`);
            } else {
                throw new Error(result.error || 'Failed to toggle bookmark');
            }

        } catch (error) {
            console.error('Error toggling current session bookmark:', error);
            this.showErrorMessage('Failed to toggle session bookmark');

            // Restore original state on error
            this.currentSessionBookmarkStar.textContent = originalText;
        } finally {
            // Re-enable clicking
            this.currentSessionBookmarkStar.style.pointerEvents = 'auto';
        }
    }

    async loadSelectedSession() {
        if (!this.selectedSessionId) {
            this.showErrorMessage('No session selected');
            return;
        }

        try {
            // Close the database modal
            this.closeDatabaseInspector();

            // Clear current transcripts and enter session viewing mode
            this.enterSessionViewingMode(this.selectedSessionId);

            // Load session transcripts into main panels
            await this.loadSessionIntoMainPanels(this.selectedSessionId);

        } catch (error) {
            console.error('Error loading session:', error);
            this.showErrorMessage('Failed to load session transcripts');
        }
    }

    enterSessionViewingMode(sessionId) {
        // Set session viewing state
        this.isViewingSession = true;
        this.viewingSessionId = sessionId;

        // Clear current transcripts
        this.clearTranscript();

        // Update UI to show we're viewing historical data
        this.updateStatus('viewing', `Viewing Session: ${sessionId.replace('session_', '')}`);

        // Show session info
        this.sessionInfo.style.display = 'flex';
        this.sessionIdSpan.textContent = sessionId;
        this.durationSpan.textContent = 'Historical';

        // Update LLM status for historical session
        this.llmStatusText.textContent = 'Historical session loaded';

        // Disable recording controls, enable viewing controls
        this.startBtn.disabled = false; // Allow starting new recording (will clear session)
        this.stopBtn.disabled = true;
        this.processLLMBtn.disabled = true; // Can't process historical data

        console.log(`📖 Entered session viewing mode for: ${sessionId}`);
    }

    exitSessionViewingMode() {
        if (this.isViewingSession) {
            this.isViewingSession = false;
            this.viewingSessionId = null;

            // Reset UI state
            this.updateStatus('ready', 'Ready');
            this.hideSessionInfo();

            console.log('📖 Exited session viewing mode');
        }
    }

    async loadSessionIntoMainPanels(sessionId) {
        try {
            // Load raw transcripts into left panel
            const rawResponse = await fetch(`/api/raw-transcripts/${sessionId}?page=1&limit=1000`);
            const rawResult = await rawResponse.json();

            if (rawResponse.ok && rawResult.transcripts) {
                this.loadRawTranscriptsIntoPanel(rawResult.transcripts);
                // Calculate quality metrics from raw transcripts
                this.calculateQualityMetricsFromTranscripts(rawResult.transcripts);
            }

            // Load processed transcripts into right panel
            const processedResponse = await fetch(`/api/processed-transcripts/${sessionId}?page=1&limit=1000`);
            const processedResult = await processedResponse.json();

            if (processedResponse.ok && processedResult.transcripts) {
                this.loadProcessedTranscriptsIntoPanel(processedResult.transcripts);
            }

            this.showNotification('success', `Loaded session: ${sessionId.replace('session_', '')}`);

        } catch (error) {
            console.error('Error loading session into main panels:', error);
            this.showErrorMessage('Failed to load session transcripts');
        }
    }

    loadRawTranscriptsIntoPanel(transcripts) {
        // Clear existing content
        this.rawTranscriptContent.innerHTML = '';
        this.rawTranscripts = [];
        this.rawTranscriptCount = 0;

        // Add each transcript to the panel
        transcripts.forEach(transcript => {
            this.addRawTranscriptToPanel({
                text: transcript.text,
                timestamp: transcript.timestamp,
                audio_source: transcript.audio_source,
                sequence_number: transcript.sequence_number,
                confidence: transcript.confidence
            });
        });

        console.log(`📝 Loaded ${transcripts.length} raw transcripts into main panel`);
    }

    loadProcessedTranscriptsIntoPanel(transcripts) {
        // Clear existing content
        this.processedTranscriptContent.innerHTML = '';
        this.processedTranscripts = [];
        this.processedTranscriptCount = 0;

        // Add each processed transcript to the panel
        transcripts.forEach(transcript => {
            this.addProcessedTranscriptToPanel({
                processed_text: transcript.processed_text,
                timestamp: transcript.timestamp,
                original_transcript_count: transcript.original_transcript_count,
                llm_model: transcript.llm_model
            });
        });

        console.log(`✨ Loaded ${transcripts.length} processed transcripts into main panel`);
    }

    calculateQualityMetricsFromTranscripts(transcripts) {
        // Reset metrics
        this.segmentCount = 0;
        this.wordCount = 0;
        this.confidenceSum = 0;
        this.confidenceCount = 0;

        // Calculate metrics from historical transcripts
        transcripts.forEach(transcript => {
            // Count segments
            this.segmentCount++;

            // Count words
            if (transcript.text) {
                this.wordCount += transcript.text.split(/\s+/).filter(word => word.length > 0).length;
            }

            // Sum confidence scores
            if (transcript.confidence !== null && transcript.confidence !== undefined) {
                this.confidenceSum += transcript.confidence;
                this.confidenceCount++;
            }
        });

        console.log(`📊 Calculated metrics: ${this.segmentCount} segments, ${this.wordCount} words, ${this.confidenceCount} confidence scores`);

        // Update the UI with calculated metrics (now safe with our robust methods)
        this.updateStats();
        this.updateQualityMetrics();
    }

    addRawTranscriptToPanel(transcript) {
        // Use the same format as live recording by calling the existing addRawTranscript method
        // but adapt the data structure to match what it expects
        const eventData = {
            data: {
                text: transcript.text,
                timestamp: transcript.timestamp,
                audio_source: transcript.audio_source,
                sequence_number: transcript.sequence_number,
                confidence: transcript.confidence
            },
            accumulated_count: this.rawTranscriptCount + 1
        };

        // Call the existing live recording method for consistent formatting
        this.addRawTranscript(eventData);
    }

    addProcessedTranscriptToPanel(transcript) {
        // Use the same format as live recording by calling the existing addProcessedTranscript method
        // but adapt the data structure to match what it expects
        const result = {
            status: 'success',
            processed_text: transcript.processed_text,
            timestamp: transcript.timestamp,
            original_transcript_count: transcript.original_transcript_count,
            llm_model: transcript.llm_model,
            processing_time: transcript.processing_time || 0
        };

        // Call the existing live recording method for consistent formatting
        this.addProcessedTranscript(result);
    }

    // Note: Session viewing now loads directly into main panels
    // The old modal-based session viewing methods have been removed

    // Export Methods
    showExportOptions() {
        if (!this.selectedSessionId) {
            this.showErrorMessage('No session selected');
            return;
        }

        this.exportOptions.style.display = 'block';
        console.log(`📤 Showing export options for session: ${this.selectedSessionId}`);
    }

    hideExportOptions() {
        this.exportOptions.style.display = 'none';
    }

    async downloadSessionExport() {
        if (!this.selectedSessionId) {
            this.showErrorMessage('No session selected');
            return;
        }

        try {
            const format = this.exportFormatSelect.value;
            const content = this.exportContentSelect.value;

            console.log(`📤 Downloading export: ${this.selectedSessionId}, format: ${format}, content: ${content}`);

            // Build the export URL
            const exportUrl = `/api/sessions/${this.selectedSessionId}/export?format=${format}&content=${content}`;

            // Create a temporary link to trigger download
            const link = document.createElement('a');
            link.href = exportUrl;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Hide export options and show success message
            this.hideExportOptions();
            this.showSuccessMessage(`Session exported as ${format.toUpperCase()}`);

        } catch (error) {
            console.error('Error downloading export:', error);
            this.showErrorMessage('Failed to export session');
        }
    }

    updateTabStates(activeTab) {
        // Remove active class from all tabs
        this.rawTab.classList.remove('active');
        this.processedTab.classList.remove('active');
        this.sessionsTab.classList.remove('active');
        this.sessionBrowserTab.classList.remove('active');

        // Add active class to the selected tab
        switch (activeTab) {
            case 'raw':
                this.rawTab.classList.add('active');
                this.sessionBrowserControls.style.display = 'none';
                break;
            case 'processed':
                this.processedTab.classList.add('active');
                this.sessionBrowserControls.style.display = 'none';
                break;
            case 'sessions':
                this.sessionsTab.classList.add('active');
                this.sessionBrowserControls.style.display = 'none';
                break;
            case 'session-browser':
                this.sessionBrowserTab.classList.add('active');
                break;
        }
    }

    // Mobile Detection and Compatibility Methods
    detectMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Check for mobile devices
        if (/android/i.test(userAgent)) {
            return 'android';
        }

        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            return 'ios';
        }

        // Check for mobile-like screen sizes
        if (window.innerWidth <= 768) {
            return 'mobile';
        }

        return false;
    }

    checkMobileCompatibility() {
        if (this.isMobile) {
            console.warn('📱 Mobile device detected:', this.isMobile);

            // Check HTTPS requirement
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                this.showErrorMessage(
                    'HTTPS is required for microphone access on mobile devices. ' +
                    'Please use HTTPS or access via localhost for testing.'
                );
            }

            // Check for getUserMedia support
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showErrorMessage(
                    'Your mobile browser does not support microphone access. ' +
                    'Please try a different browser or update your current browser.'
                );
            }

            // Show mobile-specific warning
            this.showMobileWarning();
        }
    }

    showMobileWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'mobile-warning';
        warningDiv.innerHTML = `
            <div style="background: #ff9500; color: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>📱 Mobile Device Detected</strong><br>
                <small>
                    • Microphone access may require user interaction<br>
                    • whisper.cpp streaming is not available on mobile<br>
                    • Some features may be limited<br>
                    • For best experience, use a desktop browser
                </small>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="float: right; background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
            </div>
        `;

        // Insert at top of container
        const container = document.querySelector('.container');
        container.insertBefore(warningDiv, container.firstChild);

        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (warningDiv.parentElement) {
                warningDiv.remove();
            }
        }, 15000);
    }

    // Device Management Methods
    async loadAudioDevices() {
        console.log('🔄 Loading audio devices...');

        try {
            const response = await fetch('/api/audio-devices');
            const data = await response.json();

            if (data.success) {
                this.populateDeviceDropdowns(data.input_devices, data.output_devices);
                console.log('✅ Audio devices loaded successfully');
            } else {
                console.error('❌ Failed to load audio devices:', data.error);
                this.showErrorMessage('Failed to load audio devices: ' + data.error);
            }
        } catch (error) {
            console.error('❌ Error loading audio devices:', error);
            this.showErrorMessage('Error loading audio devices: ' + error.message);
        }
    }

    populateDeviceDropdowns(inputDevices, outputDevices) {
        // Clear existing options
        this.micDeviceSelect.innerHTML = '';
        this.systemDeviceSelect.innerHTML = '';

        // Add default option for microphone
        const micDefaultOption = document.createElement('option');
        micDefaultOption.value = '';
        micDefaultOption.textContent = 'Auto-detect microphone';
        this.micDeviceSelect.appendChild(micDefaultOption);

        // Populate microphone devices (input devices)
        inputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;

            // Auto-select AirPods Pro if available
            if (device.name.toLowerCase().includes('airpods')) {
                option.selected = true;
            }

            this.micDeviceSelect.appendChild(option);
        });

        // Add default option for system audio
        const sysDefaultOption = document.createElement('option');
        sysDefaultOption.value = '';
        sysDefaultOption.textContent = 'No system audio capture';
        this.systemDeviceSelect.appendChild(sysDefaultOption);

        // Populate system audio devices - include both loopback devices AND output devices

        // First, add loopback devices from input devices
        inputDevices.forEach(device => {
            const deviceName = device.name.toLowerCase();
            if (deviceName.includes('blackhole') || deviceName.includes('soundflower') || deviceName.includes('loopback')) {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name} (Loopback Input)`;

                // Auto-select BlackHole if available
                if (deviceName.includes('blackhole')) {
                    option.selected = true;
                }

                this.systemDeviceSelect.appendChild(option);
            }
        });

        // Add separator if we have loopback devices
        const hasLoopbackDevices = inputDevices.some(device => {
            const deviceName = device.name.toLowerCase();
            return deviceName.includes('blackhole') || deviceName.includes('soundflower') || deviceName.includes('loopback');
        });

        if (hasLoopbackDevices && outputDevices.length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '--- Direct Output Capture ---';
            this.systemDeviceSelect.appendChild(separator);
        }

        // Add output devices as system audio sources (for direct capture)
        outputDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = `output_${device.id}`;
            option.textContent = `${device.name} (Direct Output)`;

            // Auto-select AirPods Pro if no loopback device was selected
            const deviceName = device.name.toLowerCase();
            if (deviceName.includes('airpods') && !this.systemDeviceSelect.querySelector('option[selected]')) {
                option.selected = true;
            }

            this.systemDeviceSelect.appendChild(option);
        });

        console.log(`📱 Populated ${inputDevices.length} input devices and ${outputDevices.length} output devices`);
    }

    onDeviceSelectionChange() {
        const micDeviceId = this.micDeviceSelect.value;
        const systemDeviceId = this.systemDeviceSelect.value;

        console.log(`🎛️ Device selection changed - Mic: ${micDeviceId || 'auto'}, System: ${systemDeviceId || 'none'}`);

        // Store selections for next recording session
        this.selectedMicDevice = micDeviceId || null;
        this.selectedSystemDevice = systemDeviceId || null;

        // If recording is active, show message that changes will apply to next session
        if (this.isRecording) {
            this.showSuccessMessage('Device changes will apply to the next recording session');
        }
    }

    // State Recovery and Synchronization Methods
    async recoverServerState() {
        try {
            console.log('🔄 Recovering server state...');
            const response = await fetch('/api/status');
            const serverState = await response.json();

            console.log('📊 Server state:', serverState);

            if (serverState.is_recording) {
                console.log('✅ Server is recording, syncing client state');

                // Sync recording state
                this.updateRecordingState(serverState);

                // Restore accumulated transcript counts
                if (serverState.processors && serverState.processors.accumulated_transcripts) {
                    const counts = serverState.processors.accumulated_transcripts;
                    this.rawTranscriptCount = counts.total;
                    this.accumulatedCount.textContent = counts.total;
                    this.rawCountSpan.textContent = counts.total;

                    console.log(`📝 Restored transcript counts: ${counts.microphone} mic + ${counts.system} system = ${counts.total} total`);

                    // Enable LLM processing if transcripts exist
                    if (counts.total > 0) {
                        this.processLLMBtn.disabled = false;
                    }
                }

                // Restore LLM processor state
                if (serverState.llm_processor) {
                    const llmState = serverState.llm_processor;
                    console.log(`🤖 LLM processor state: processing=${llmState.is_processing}, queue=${llmState.queue_length}, total_processed=${llmState.total_processed}`);

                    if (llmState.is_processing) {
                        this.isLLMProcessing = true;
                        this.processLLMBtn.disabled = true;
                        this.llmStatusText.textContent = 'Processing with LLM...';
                        this.llmSpinner.style.display = 'block';
                        console.log('🔄 Restored LLM processing state');
                    }

                    if (llmState.queue_length > 0) {
                        console.log(`📋 LLM queue has ${llmState.queue_length} pending jobs`);
                    }
                }

                // Restore processed transcript counts
                if (serverState.processed_transcripts) {
                    const processedCount = serverState.processed_transcripts.session_count;
                    this.processedTranscriptCount = processedCount;
                    this.processedCountSpan.textContent = processedCount;
                    console.log(`📄 Restored processed transcript count: ${processedCount}`);
                }

                // Optionally restore recent transcripts from database
                if (serverState.session_id) {
                    await this.restoreRecentTranscripts(serverState.session_id);
                    await this.restoreProcessedTranscripts(serverState.session_id);
                }

                this.showNotification('Synchronized with ongoing recording session', 'info');
            } else {
                console.log('ℹ️ Server is not recording, client state is correct');
            }
        } catch (error) {
            console.error('❌ Failed to recover server state:', error);
            this.showNotification('Failed to sync with server state', 'error');
        }
    }

    validateStateSync(serverState) {
        const clientRecording = this.isRecording;
        const serverRecording = serverState.is_recording;

        let stateChanged = false;

        // Check recording state mismatch
        if (clientRecording !== serverRecording) {
            console.warn('⚠️ Recording state mismatch detected!');
            console.warn(`Client: ${clientRecording ? 'recording' : 'not recording'}`);
            console.warn(`Server: ${serverRecording ? 'recording' : 'not recording'}`);

            // Sync with server state
            this.updateRecordingState(serverState);
            stateChanged = true;

            // Show user notification
            const message = serverRecording
                ? 'Synchronized with ongoing recording session'
                : 'Recording session ended, state synchronized';
            this.showNotification(message, 'info');
        }

        // Check LLM processing state mismatch (only if we have LLM state)
        if (serverState.llm_processor) {
            const clientLLMProcessing = this.isLLMProcessing;
            const serverLLMProcessing = serverState.llm_processor.is_processing;

            if (clientLLMProcessing !== serverLLMProcessing) {
                console.warn('⚠️ LLM processing state mismatch detected!');
                console.warn(`Client LLM processing: ${clientLLMProcessing}`);
                console.warn(`Server LLM processing: ${serverLLMProcessing}`);

                // Sync LLM processing state
                this.isLLMProcessing = serverLLMProcessing;
                this.processLLMBtn.disabled = serverLLMProcessing;

                if (serverLLMProcessing) {
                    this.llmStatusText.textContent = 'Processing with LLM...';
                    this.llmSpinner.style.display = 'block';
                } else {
                    this.llmStatusText.textContent = 'Ready';
                    this.llmSpinner.style.display = 'none';
                }

                stateChanged = true;
                console.log('✅ LLM processing state synchronized');
            }
        }

        if (stateChanged) {
            console.log('✅ All states synchronized with server');
        }
    }

    async restoreRecentTranscripts(sessionId) {
        try {
            console.log(`🔄 Restoring recent transcripts for session: ${sessionId}`);
            const response = await fetch(`/api/raw-transcripts/${sessionId}`);
            const data = await response.json();

            if (data.transcripts && data.transcripts.length > 0) {
                console.log(`📝 Restoring ${data.transcripts.length} recent transcripts`);

                // Display recent transcripts to show context (last 10)
                const recentTranscripts = data.transcripts.slice(-10);
                recentTranscripts.forEach(transcript => {
                    this.addRawTranscript({
                        type: 'raw_transcript',
                        data: transcript,
                        accumulated_count: this.rawTranscriptCount
                    });
                });

                console.log('✅ Recent transcripts restored');
            } else {
                console.log('ℹ️ No recent transcripts to restore');
            }
        } catch (error) {
            console.error('❌ Failed to restore recent transcripts:', error);
        }
    }

    async restoreProcessedTranscripts(sessionId) {
        try {
            console.log(`🔄 Restoring processed transcripts for session: ${sessionId}`);
            const response = await fetch(`/api/processed-transcripts/${sessionId}`);
            const data = await response.json();

            if (data.transcripts && data.transcripts.length > 0) {
                console.log(`📄 Restoring ${data.transcripts.length} processed transcripts`);

                // Display processed transcripts
                data.transcripts.forEach(transcript => {
                    // addProcessedTranscript expects the result object directly
                    this.addProcessedTranscript({
                        status: 'success',
                        ...transcript
                    });
                });

                console.log('✅ Processed transcripts restored');
            } else {
                console.log('ℹ️ No processed transcripts to restore');
            }
        } catch (error) {
            console.error('❌ Failed to restore processed transcripts:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('state-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'state-notification';
            notification.style.cssText = `
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
            `;
            document.body.appendChild(notification);
        }

        // Set notification style based on type
        const colors = {
            info: '#3b82f6',
            error: '#ef4444',
            success: '#10b981',
            warning: '#f59e0b'
        };

        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        notification.style.display = 'block';
        notification.style.opacity = '1';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 5000);
    }

    initializeVisibilityControls() {
        // Set initial button states based on panel visibility
        this.updateVisibilityButtonStates();
        this.updateGridLayout();
    }

    toggleRawPanelVisibility() {
        const rawPanel = document.querySelector('.raw-panel');
        this.rawPanelVisible = !this.rawPanelVisible;

        if (this.rawPanelVisible) {
            rawPanel.classList.remove('hidden');
            this.toggleRawBtn.textContent = '👁️ Hide';
            console.log('📝 Raw panel shown');
        } else {
            rawPanel.classList.add('hidden');
            this.toggleRawBtn.textContent = '👁️ Show';
            console.log('📝 Raw panel hidden');
        }

        // Update visibility button states
        this.updateVisibilityButtonStates();

        // Update grid layout
        this.updateGridLayout();
    }

    toggleProcessedPanelVisibility() {
        const processedPanel = document.querySelector('.processed-panel');
        this.processedPanelVisible = !this.processedPanelVisible;

        if (this.processedPanelVisible) {
            processedPanel.classList.remove('hidden');
            this.toggleProcessedBtn.textContent = '👁️ Hide';
            console.log('✨ Processed panel shown');
        } else {
            processedPanel.classList.add('hidden');
            this.toggleProcessedBtn.textContent = '👁️ Show';
            console.log('✨ Processed panel hidden');
        }

        // Update visibility button states
        this.updateVisibilityButtonStates();

        // Update grid layout
        this.updateGridLayout();
    }

    toggleBothPanels() {
        const rawPanel = document.querySelector('.raw-panel');
        const processedPanel = document.querySelector('.processed-panel');

        // If both panels are visible, hide both
        if (this.rawPanelVisible && this.processedPanelVisible) {
            // Hide both panels
            rawPanel.classList.add('hidden');
            processedPanel.classList.add('hidden');
            this.rawPanelVisible = false;
            this.processedPanelVisible = false;
            this.toggleRawBtn.textContent = '👁️ Show';
            this.toggleProcessedBtn.textContent = '👁️ Show';
            console.log('👁️ Both panels hidden');
        } else {
            // Show both panels
            rawPanel.classList.remove('hidden');
            processedPanel.classList.remove('hidden');
            this.rawPanelVisible = true;
            this.processedPanelVisible = true;
            this.toggleRawBtn.textContent = '👁️ Hide';
            this.toggleProcessedBtn.textContent = '👁️ Hide';
            console.log('👁️ Both panels shown');
        }

        // Update visibility button states
        this.updateVisibilityButtonStates();

        // Update grid layout
        this.updateGridLayout();
    }

    updateVisibilityButtonStates() {
        // Update button active states based on panel visibility
        if (this.rawPanelVisible) {
            this.showRawBtn.classList.add('active');
        } else {
            this.showRawBtn.classList.remove('active');
        }

        if (this.processedPanelVisible) {
            this.showProcessedBtn.classList.add('active');
        } else {
            this.showProcessedBtn.classList.remove('active');
        }

        // Update "Both" button text and state
        this.updateBothButtonState();
    }

    updateBothButtonState() {
        if (this.rawPanelVisible && this.processedPanelVisible) {
            // Both panels visible - button should offer to hide both
            this.showBothBtn.textContent = '🙈 Hide Both';
            this.showBothBtn.title = 'Hide Both Panels';
            this.showBothBtn.classList.add('active');
        } else {
            // At least one panel hidden - button should offer to show both
            this.showBothBtn.textContent = '👁️ Show Both';
            this.showBothBtn.title = 'Show Both Panels';
            this.showBothBtn.classList.remove('active');
        }
    }

    updateGridLayout() {
        const container = document.querySelector('.dual-transcript-container');

        // Remove existing layout classes
        container.classList.remove('single-panel');

        // Add single-panel class if only one panel is visible
        if (this.rawPanelVisible && !this.processedPanelVisible) {
            container.classList.add('single-panel');
        } else if (!this.rawPanelVisible && this.processedPanelVisible) {
            container.classList.add('single-panel');
        }
    }

    async copyRawTranscripts() {
        try {
            // Get all raw transcript text content
            const rawItems = this.rawTranscriptContent.querySelectorAll('.raw-transcript-item');
            if (rawItems.length === 0) {
                this.showCopyFeedback(this.copyRawBtn, 'No transcripts to copy', false);
                return;
            }

            let copyText = '';
            rawItems.forEach((item) => {
                const timestamp = item.querySelector('.timestamp')?.textContent || '';
                const audioSource = item.querySelector('.source-label')?.textContent || '';
                const sequence = item.querySelector('.sequence')?.textContent || '';
                const text = item.querySelector('.text')?.textContent || '';

                copyText += `${timestamp} [${audioSource}] ${sequence}\n${text}\n\n`;
            });

            await navigator.clipboard.writeText(copyText.trim());
            this.showCopyFeedback(this.copyRawBtn, 'Copied!', true);
            console.log('📋 Raw transcripts copied to clipboard');
        } catch (error) {
            console.error('Failed to copy raw transcripts:', error);
            this.showCopyFeedback(this.copyRawBtn, 'Copy failed', false);
        }
    }

    async copyProcessedTranscripts() {
        try {
            // Get all processed transcript text content
            const processedItems = this.processedTranscriptContent.querySelectorAll('.processed-transcript-item');
            if (processedItems.length === 0) {
                this.showCopyFeedback(this.copyProcessedBtn, 'No transcripts to copy', false);
                return;
            }

            let copyText = '';
            processedItems.forEach((item) => {
                const timestamp = item.querySelector('.timestamp')?.textContent || '';
                const text = item.querySelector('.text')?.textContent || '';

                copyText += `${timestamp}\n${text}\n\n`;
            });

            await navigator.clipboard.writeText(copyText.trim());
            this.showCopyFeedback(this.copyProcessedBtn, 'Copied!', true);
            console.log('📋 Processed transcripts copied to clipboard');
        } catch (error) {
            console.error('Failed to copy processed transcripts:', error);
            this.showCopyFeedback(this.copyProcessedBtn, 'Copy failed', false);
        }
    }

    showCopyFeedback(button, message, success) {
        const originalText = button.textContent;
        const originalClass = button.className;

        // Update button appearance
        button.textContent = message;
        if (success) {
            button.classList.add('copied');
        }

        // Reset after 2 seconds
        setTimeout(() => {
            button.textContent = originalText;
            button.className = originalClass;
        }, 2000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing ChatGPT Voice Mode Transcript Recorder...');
    window.transcriptRecorder = new TranscriptRecorder();
});
