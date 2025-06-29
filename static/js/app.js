// ChatGPT Voice Mode Transcript Recorder - Frontend JavaScript with Dual Panel Support

class TranscriptRecorder {
    constructor() {
        this.eventSource = null;
        this.isRecording = false;
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
    }
    
    initializeElements() {
        // Control buttons
        this.startBtn = document.getElementById('start-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.processLLMBtn = document.getElementById('process-llm-btn');
        this.clearBtn = document.getElementById('clear-btn');

        // Status elements
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.sessionInfo = document.getElementById('session-info');
        this.sessionIdSpan = document.getElementById('session-id');
        this.durationSpan = document.getElementById('duration');

        // Audio level elements (FIX: Initialize missing elements)
        this.micLevel = document.getElementById('mic-level');
        this.systemLevel = document.getElementById('system-level');

        // LLM status elements
        this.llmStatus = document.getElementById('llm-status');
        this.llmStatusText = document.getElementById('llm-status-text');
        this.llmSpinner = document.getElementById('llm-spinner');
        this.accumulatedCount = document.getElementById('accumulated-count');

        // Dual panel elements
        this.rawTranscriptContent = document.getElementById('raw-transcript-content');
        this.processedTranscriptContent = document.getElementById('processed-transcript-content');
        this.rawCountSpan = document.getElementById('raw-count');
        this.processedCountSpan = document.getElementById('processed-count');

        // Panel toggle buttons
        this.toggleRawBtn = document.getElementById('toggle-raw-btn');
        this.toggleProcessedBtn = document.getElementById('toggle-processed-btn');

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

        // Quality monitor (updated)
        this.whisperStatus = document.getElementById('whisper-status');
        this.llmProcessingStatus = document.getElementById('llm-processing-status');
        this.lastLLMProcess = document.getElementById('last-llm-process');
        this.sessionDuration = document.getElementById('session-duration');
        this.processingDelaySpan = document.getElementById('processing-delay');
        this.lastSaveSpan = document.getElementById('last-save');
    }
    
    setupEventListeners() {
        // Recording controls
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscript());

        // LLM processing
        this.processLLMBtn.addEventListener('click', () => this.processWithLLM());

        // Panel toggles
        this.toggleRawBtn.addEventListener('click', () => this.toggleRawPanel());
        this.toggleProcessedBtn.addEventListener('click', () => this.toggleProcessedPanel());

        // Processed transcript actions
        if (this.saveProcessedBtn) {
            this.saveProcessedBtn.addEventListener('click', () => this.saveProcessedTranscript());
        }
        if (this.exportProcessedBtn) {
            this.exportProcessedBtn.addEventListener('click', () => this.exportProcessedTranscript());
        }

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
        // Listen for Enter key to trigger LLM processing
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                // Only trigger if not in an input field
                if (document.activeElement.tagName !== 'INPUT' &&
                    document.activeElement.tagName !== 'TEXTAREA') {
                    event.preventDefault();
                    this.processWithLLM();
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
                    case 'whisper_error':
                        console.log('❌ Whisper error:', data);
                        this.handleWhisperError(data);
                        break;
                    case 'heartbeat':
                        console.log('💓 Heartbeat received');
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

            const response = await fetch('/api/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.isRecording = true;
                this.sessionId = result.session_id;
                this.startTime = new Date();

                this.updateStatus('recording', 'Recording');
                this.startBtn.disabled = true;
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
                this.sessionId = null;
                this.startTime = null;

                this.updateStatus('ready', 'Ready');
                this.startBtn.disabled = false;
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
    }
    
    hideSessionInfo() {
        this.sessionInfo.style.display = 'none';
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
        this.segmentCountSpan.textContent = this.segmentCount;
        this.wordCountSpan.textContent = this.wordCount;
    }
    
    updateQualityMetrics() {
        // Average confidence
        if (this.confidenceCount > 0) {
            const avgConfidence = this.confidenceSum / this.confidenceCount;
            this.avgConfidenceSpan.textContent = `${Math.round(avgConfidence * 100)}%`;
        } else {
            this.avgConfidenceSpan.textContent = '--';
        }
        
        // Processing delay (placeholder for now)
        this.processingDelaySpan.textContent = '< 2s';
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
                <br><small>Check the console for more details or see AUDIO_SETUP.md for help.</small>
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

        // Show LLM status
        this.llmStatus.style.display = 'block';
        this.llmStatusText.textContent = 'Ready for transcripts';
        this.whisperStatus.textContent = 'Running';

        // Enable/disable buttons
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.processLLMBtn.disabled = false;
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

        // Enable/disable buttons
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.processLLMBtn.disabled = true;
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
        item.innerHTML = `
            <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
            <div class="text">${data.text}</div>
            <div class="sequence">#${data.sequence_number}</div>
        `;

        this.rawTranscriptContent.appendChild(item);
        this.rawTranscriptContent.scrollTop = this.rawTranscriptContent.scrollHeight;

        // Enable LLM processing button if we have transcripts
        if (this.rawTranscriptCount > 0 && !this.isLLMProcessing) {
            this.processLLMBtn.disabled = false;
        }
    }

    async processWithLLM() {
        if (this.isLLMProcessing || this.rawTranscriptCount === 0) {
            return;
        }

        try {
            this.isLLMProcessing = true;
            this.processLLMBtn.disabled = true;
            this.llmStatusText.textContent = 'Processing with LLM...';
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

        } catch (error) {
            console.error('❌ Error starting LLM processing:', error);
            this.showErrorMessage('Failed to start LLM processing: ' + error.message);
            this.isLLMProcessing = false;
            this.processLLMBtn.disabled = false;
            this.llmStatusText.textContent = 'Error';
            this.llmSpinner.style.display = 'none';
        }
    }

    handleLLMProcessingStart(data) {
        this.currentLLMJob = data.job_id;
        this.llmProcessingStatus.textContent = `Processing ${data.transcript_count} transcripts`;
        this.llmStatusText.textContent = `Processing ${data.transcript_count} transcripts...`;
    }

    handleLLMProcessingComplete(data) {
        const result = data.result;

        if (result.status === 'success') {
            this.addProcessedTranscript(result);
            this.llmStatusText.textContent = 'Processing complete';
            this.lastLLMProcess.textContent = new Date().toLocaleTimeString();
        } else {
            this.llmStatusText.textContent = 'Processing failed';
            this.showErrorMessage('LLM processing failed: ' + (result.error || 'Unknown error'));
        }

        // Reset processing state
        this.isLLMProcessing = false;
        this.currentLLMJob = null;
        this.llmSpinner.style.display = 'none';
        this.llmProcessingStatus.textContent = 'Idle';

        // Re-enable button if we have more transcripts
        if (this.rawTranscriptCount > 0) {
            this.processLLMBtn.disabled = false;
        }
    }

    handleLLMProcessingError(data) {
        this.showErrorMessage('LLM processing error: ' + data.error);
        this.isLLMProcessing = false;
        this.currentLLMJob = null;
        this.llmSpinner.style.display = 'none';
        this.llmStatusText.textContent = 'Error';
        this.llmProcessingStatus.textContent = 'Error';

        if (this.rawTranscriptCount > 0) {
            this.processLLMBtn.disabled = false;
        }
    }

    handleWhisperError(data) {
        this.showErrorMessage('Whisper error: ' + data.message);
        this.whisperStatus.textContent = 'Error';
    }

    addProcessedTranscript(result) {
        this.processedTranscripts.push(result);
        this.processedTranscriptCount++;

        // Update count
        this.processedCountSpan.textContent = this.processedTranscriptCount;

        // Clear placeholder if it exists
        this.clearProcessedTranscriptPlaceholder();

        // Create processed transcript item
        const item = document.createElement('div');
        item.className = 'processed-transcript-item';
        item.innerHTML = `
            <div class="header">
                <span>Processed ${result.original_transcript_count} transcripts</span>
                <span>${new Date(result.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="text">${result.processed_text}</div>
            <div class="footer">
                <span>Model: ${result.llm_model}</span>
                <span>Time: ${result.processing_time.toFixed(2)}s</span>
            </div>
        `;

        this.processedTranscriptContent.appendChild(item);
        this.processedTranscriptContent.scrollTop = this.processedTranscriptContent.scrollHeight;

        // Show processed actions
        this.processedActions.style.display = 'flex';
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
        // Update tab states
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

        if (tableType === 'raw') {
            this.rawTab.classList.add('active');
            await this.loadRawTranscripts();
        } else if (tableType === 'processed') {
            this.processedTab.classList.add('active');
            await this.loadProcessedTranscripts();
        } else if (tableType === 'sessions') {
            this.sessionsTab.classList.add('active');
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing ChatGPT Voice Mode Transcript Recorder...');
    window.transcriptRecorder = new TranscriptRecorder();
});
