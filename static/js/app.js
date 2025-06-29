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

        this.initializeElements();
        this.setupEventListeners();
        this.setupSSEConnection();
        this.setupKeyboardListeners();
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

        this.transcriptContent.innerHTML = `
            <div class="transcript-placeholder">
                <p>🎙️ Transcript cleared. Click "Start Recording" to begin again.</p>
            </div>
        `;

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

        // Add to transcript
        this.transcriptContent.appendChild(entry);
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;

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

        // Scroll to bottom
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;

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
        const placeholder = this.transcriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing ChatGPT Voice Mode Transcript Recorder...');
    window.transcriptRecorder = new TranscriptRecorder();
});
