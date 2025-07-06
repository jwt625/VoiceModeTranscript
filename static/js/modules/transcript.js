/**
 * Transcript Module
 *
 * Handles transcript data management and display including raw transcript collection,
 * processed transcript management, transcript combining logic, quality metrics calculation,
 * and panel rendering.
 */
class TranscriptModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('transcript', eventBus, stateStore, config);

        this.elements = {};
        this.combineTimer = null;
        this.currentMessage = null;
        this.lastSpeaker = null;
        this.lastUpdateTime = null;
        this.transcriptEntries = [];
    }

    /**
     * Get default configuration for the transcript module
     */
    getDefaultConfig() {
        return {
            combineTimeout: 3000,
            maxTranscriptEntries: 1000,
            qualityMetricsEnabled: true,
            autoScrollEnabled: true
        };
    }

    /**
     * Get initial state for the transcript module
     */
    getInitialState() {
        return {
            rawTranscripts: [],
            processedTranscripts: [],
            rawCount: 0,
            processedCount: 0,
            accumulatedCount: 0, // Count of transcripts pending LLM processing
            qualityMetrics: {
                segmentCount: 0,
                wordCount: 0,
                avgConfidence: 0,
                confidenceSum: 0,
                confidenceCount: 0
            }
        };
    }

    /**
     * Initialize the transcript module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializePlaceholders();

        // Debug: Check state initialization
        const rawTranscripts = this.getState('rawTranscripts');
        const processedTranscripts = this.getState('processedTranscripts');
        console.log('🔧 Transcript module state check:', {
            rawTranscripts: Array.isArray(rawTranscripts) ? `Array[${rawTranscripts.length}]` : typeof rawTranscripts,
            processedTranscripts: Array.isArray(processedTranscripts) ? `Array[${processedTranscripts.length}]` : typeof processedTranscripts
        });

        if (this.debugMode) {
            console.log('🔧 Transcript module initialized');
        }
    }

    /**
     * Clean up transcript module
     */
    async onDestroy() {
        this.clearCombineTimer();
    }

    /**
     * Set up event listeners for transcript events
     */
    setupEventListeners() {
        // Listen for transcript-related events
        this.on('transcript:raw_received', (data) => this.addRawTranscript(data));
        this.on('transcript:processed_received', (data) => this.addProcessedTranscript(data));
        this.on('transcript:clear_requested', () => this.clearTranscripts());
        this.on('transcript:finalize_current_message', () => this.finalizeCurrentMessage());
        this.on('transcript:load_session_transcripts', (data) => this.loadTranscriptsIntoPanel(data.rawTranscripts, data.processedTranscripts));
        this.on('transcript:reset_counts', () => this.resetTranscriptCounts());



        // Listen for copy requests
        this.on('utils:copy_requested', () => this.handleCopyRequest());
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Transcript content panels
        this.elements.rawTranscriptContent = document.getElementById('raw-transcript-content');
        this.elements.processedTranscriptContent = document.getElementById('processed-transcript-content');

        // Count display elements
        this.elements.rawCountSpan = document.getElementById('raw-count');
        this.elements.processedCountSpan = document.getElementById('processed-count');
        this.elements.accumulatedCount = document.getElementById('accumulated-count');

        // Quality metrics elements
        this.elements.segmentCountSpan = document.getElementById('segment-count');
        this.elements.wordCountSpan = document.getElementById('word-count');
        this.elements.avgConfidenceSpan = document.getElementById('avg-confidence');
        this.elements.processingDelaySpan = document.getElementById('processing-delay');

        // Copy buttons
        this.elements.copyRawBtn = document.getElementById('copy-raw-btn');
        this.elements.copyProcessedBtn = document.getElementById('copy-processed-btn');

        // Last save time
        this.elements.lastSaveSpan = document.getElementById('last-save');

        // Set up copy button event listeners
        this.setupCopyEventListeners();
    }

    /**
     * Set up copy button event listeners
     */
    setupCopyEventListeners() {
        if (this.elements.copyRawBtn) {
            this.elements.copyRawBtn.addEventListener('click', () => {
                this.copyRawTranscripts();
            });
        }

        if (this.elements.copyProcessedBtn) {
            this.elements.copyProcessedBtn.addEventListener('click', () => {
                this.copyProcessedTranscripts();
            });
        }
    }

    /**
     * Initialize placeholder content
     */
    initializePlaceholders() {
        if (this.elements.rawTranscriptContent) {
            this.elements.rawTranscriptContent.innerHTML = `
                <div class="transcript-placeholder">
                    <p>🎙️ Raw transcripts will appear here. Click "Start Recording" to begin.</p>
                </div>
            `;
        }

        if (this.elements.processedTranscriptContent) {
            this.elements.processedTranscriptContent.innerHTML = `
                <div class="transcript-placeholder">
                    <p>🤖 Processed transcripts will appear here. Press "Process with LLM" after recording.</p>
                </div>
            `;
        }
    }

    /**
     * Add raw transcript
     */
    addRawTranscript(data) {
        // Remove placeholder if it exists
        this.clearRawTranscriptPlaceholder();

        // Extract transcript data
        const transcriptData = data.data || data;

        // Add to state with safety check
        let rawTranscripts = this.getState('rawTranscripts');
        if (!Array.isArray(rawTranscripts)) {
            console.warn('⚠️ rawTranscripts state is not an array, reinitializing...');
            rawTranscripts = [];
            this.setState('rawTranscripts', rawTranscripts, { notify: false });
        }
        rawTranscripts.push(transcriptData);
        this.setState('rawTranscripts', rawTranscripts);

        // Update raw count (incremental, never resets)
        const newRawCount = this.getState('rawCount') + 1;
        this.setState('rawCount', newRawCount);

        // Update accumulated count from backend (resets when backend clears accumulated transcripts)
        const backendAccumulatedCount = data.accumulated_count;
        if (backendAccumulatedCount !== undefined) {
            this.setState('accumulatedCount', backendAccumulatedCount);
        }

        // Update UI count displays
        this.updateCountDisplays();

        // Add to panel
        this.addRawTranscriptToPanel(transcriptData);

        // Update quality metrics
        this.updateQualityMetricsFromTranscript(transcriptData);

        // Update last save time
        if (this.elements.lastSaveSpan) {
            this.elements.lastSaveSpan.textContent = new Date().toLocaleTimeString();
        }

        // Enable LLM processing if we have transcripts
        this.emit('llm:transcripts_available', { count: newRawCount });

        if (this.debugMode) {
            console.log('📝 Raw transcript added:', transcriptData);
        }
    }

    /**
     * Add processed transcript
     */
    addProcessedTranscript(data) {
        // Remove placeholder if it exists
        this.clearProcessedTranscriptPlaceholder();

        // Add to state with safety check
        let processedTranscripts = this.getState('processedTranscripts');
        if (!Array.isArray(processedTranscripts)) {
            console.warn('⚠️ processedTranscripts state is not an array, reinitializing...');
            processedTranscripts = [];
            this.setState('processedTranscripts', processedTranscripts, { notify: false });
        }
        processedTranscripts.push(data);
        this.setState('processedTranscripts', processedTranscripts);

        // Update count
        const newCount = this.getState('processedCount') + 1;
        this.setState('processedCount', newCount);

        // Update UI count displays
        this.updateCountDisplays();

        // Add to panel
        this.addProcessedTranscriptToPanel(data);

        if (this.debugMode) {
            console.log('✨ Processed transcript added:', data);
        }
    }

    /**
     * Add raw transcript to panel
     */
    addRawTranscriptToPanel(data) {
        if (!this.elements.rawTranscriptContent) return;

        // Determine audio source info
        const sourceInfo = this.getAudioSourceInfo(data.audio_source);

        // Create transcript item
        const item = document.createElement('div');
        item.className = 'raw-transcript-item';

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

        this.elements.rawTranscriptContent.appendChild(item);

        // Auto-scroll if enabled
        if (this.config.autoScrollEnabled) {
            this.elements.rawTranscriptContent.scrollTop = this.elements.rawTranscriptContent.scrollHeight;
        }
    }

    /**
     * Add processed transcript to panel
     */
    addProcessedTranscriptToPanel(data) {
        if (!this.elements.processedTranscriptContent) return;

        // Create processed transcript item
        const item = document.createElement('div');
        item.className = 'processed-transcript-item';

        item.innerHTML = `
            <div class="transcript-header">
                <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
                <div class="metadata">
                    <span class="original-count">From ${data.original_transcript_count} transcripts</span>
                    <span class="llm-model">${data.llm_model || 'Unknown'}</span>
                </div>
            </div>
            <div class="text">${data.processed_text}</div>
        `;

        this.elements.processedTranscriptContent.appendChild(item);

        // Auto-scroll if enabled
        if (this.config.autoScrollEnabled) {
            this.elements.processedTranscriptContent.scrollTop = this.elements.processedTranscriptContent.scrollHeight;
        }
    }

    /**
     * Get audio source information
     */
    getAudioSourceInfo(audioSource) {
        switch (audioSource) {
            case 'microphone':
                return {
                    icon: '🎤',
                    label: 'Microphone',
                    class: 'microphone'
                };
            case 'system':
                return {
                    icon: '🔊',
                    label: 'System Audio',
                    class: 'system'
                };
            default:
                return {
                    icon: '❓',
                    label: 'Unknown',
                    class: 'unknown'
                };
        }
    }

    /**
     * Clear all transcripts
     */
    clearTranscripts() {
        // Finalize any current message
        this.finalizeCurrentMessage();

        // Clear combine timer
        this.clearCombineTimer();

        // Reset state
        this.setState('rawTranscripts', []);
        this.setState('processedTranscripts', []);
        this.setState('rawCount', 0);
        this.setState('processedCount', 0);
        this.setState('accumulatedCount', 0);
        this.setState('qualityMetrics', {
            segmentCount: 0,
            wordCount: 0,
            avgConfidence: 0,
            confidenceSum: 0,
            confidenceCount: 0
        });

        // Reset internal state
        this.transcriptEntries = [];
        this.currentMessage = null;
        this.lastSpeaker = null;
        this.lastUpdateTime = null;

        // Clear panels
        this.initializePlaceholders();

        // Update count displays
        this.updateCountDisplays();

        // Update quality metrics display
        this.updateQualityMetricsDisplay();

        if (this.debugMode) {
            console.log('🗑️ All transcripts cleared');
        }
    }

    /**
     * Update count displays
     */
    updateCountDisplays() {
        const rawCount = this.getState('rawCount');
        const processedCount = this.getState('processedCount');
        const accumulatedCount = this.getState('accumulatedCount');

        // Raw count next to transcript panel (should NOT reset)
        if (this.elements.rawCountSpan) {
            this.elements.rawCountSpan.textContent = rawCount.toString();
        }

        if (this.elements.processedCountSpan) {
            this.elements.processedCountSpan.textContent = processedCount.toString();
        }

        // Accumulated count in LLM status area (should reset after processing)
        if (this.elements.accumulatedCount) {
            this.elements.accumulatedCount.textContent = accumulatedCount.toString();
        }
    }

    /**
     * Update quality metrics from transcript
     */
    updateQualityMetricsFromTranscript(transcript) {
        if (!this.config.qualityMetricsEnabled) return;

        const metrics = this.getState('qualityMetrics');

        // Update segment count
        metrics.segmentCount++;

        // Update word count
        if (transcript.text) {
            const words = transcript.text.split(/\s+/).filter(word => word.length > 0);
            metrics.wordCount += words.length;
        }

        // Update confidence metrics
        if (transcript.confidence !== null && transcript.confidence !== undefined) {
            metrics.confidenceSum += transcript.confidence;
            metrics.confidenceCount++;
            metrics.avgConfidence = metrics.confidenceSum / metrics.confidenceCount;
        }

        this.setState('qualityMetrics', metrics);
        this.updateQualityMetricsDisplay();
    }

    /**
     * Update quality metrics display
     */
    updateQualityMetricsDisplay() {
        const metrics = this.getState('qualityMetrics');

        if (this.elements.segmentCountSpan) {
            this.elements.segmentCountSpan.textContent = metrics.segmentCount.toString();
        }

        if (this.elements.wordCountSpan) {
            this.elements.wordCountSpan.textContent = metrics.wordCount.toString();
        }

        if (this.elements.avgConfidenceSpan) {
            if (metrics.confidenceCount > 0) {
                this.elements.avgConfidenceSpan.textContent = `${Math.round(metrics.avgConfidence * 100)}%`;
            } else {
                this.elements.avgConfidenceSpan.textContent = '--';
            }
        }

        if (this.elements.processingDelaySpan) {
            this.elements.processingDelaySpan.textContent = '< 2s';
        }
    }

    /**
     * Clear raw transcript placeholder
     */
    clearRawTranscriptPlaceholder() {
        if (!this.elements.rawTranscriptContent) return;

        const placeholder = this.elements.rawTranscriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    /**
     * Clear processed transcript placeholder
     */
    clearProcessedTranscriptPlaceholder() {
        if (!this.elements.processedTranscriptContent) return;

        const placeholder = this.elements.processedTranscriptContent.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    /**
     * Copy raw transcripts to clipboard
     */
    async copyRawTranscripts() {
        const rawTranscripts = this.getState('rawTranscripts');

        if (rawTranscripts.length === 0) {
            this.emit('ui:notification', {
                type: 'warning',
                message: 'No raw transcripts to copy'
            });
            return;
        }

        // Format transcripts for copying
        const formattedText = rawTranscripts.map(transcript => {
            const timestamp = new Date(transcript.timestamp).toLocaleTimeString();
            const source = transcript.audio_source === 'microphone' ? '🎤' : '🔊';
            return `[${timestamp}] ${source} ${transcript.text}`;
        }).join('\n');

        // Copy to clipboard using utils module
        const success = await this.copyToClipboard(formattedText);

        if (success) {
            this.emit('ui:notification', {
                type: 'success',
                message: `Copied ${rawTranscripts.length} raw transcripts to clipboard`
            });
        } else {
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to copy transcripts to clipboard'
            });
        }
    }

    /**
     * Copy processed transcripts to clipboard
     */
    async copyProcessedTranscripts() {
        const processedTranscripts = this.getState('processedTranscripts');

        if (processedTranscripts.length === 0) {
            this.emit('ui:notification', {
                type: 'warning',
                message: 'No processed transcripts to copy'
            });
            return;
        }

        // Format processed transcripts for copying
        const formattedText = processedTranscripts.map(transcript => {
            const timestamp = new Date(transcript.timestamp).toLocaleTimeString();
            return `[${timestamp}] ${transcript.processed_text}`;
        }).join('\n\n');

        // Copy to clipboard using utils module
        const success = await this.copyToClipboard(formattedText);

        if (success) {
            this.emit('ui:notification', {
                type: 'success',
                message: `Copied ${processedTranscripts.length} processed transcripts to clipboard`
            });
        } else {
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to copy transcripts to clipboard'
            });
        }
    }

    /**
     * Copy text to clipboard (delegates to utils module)
     */
    async copyToClipboard(text) {
        // Emit event to utils module to handle clipboard operation
        this.emit('utils:copy_to_clipboard_requested', { text });

        // For now, use direct clipboard API as fallback
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Handle copy request from keyboard shortcut
     */
    handleCopyRequest() {
        // Determine which panel is more visible or has focus
        const rawVisible = this.getGlobalState('ui.rawPanelVisible');
        const processedVisible = this.getGlobalState('ui.processedPanelVisible');

        if (rawVisible && processedVisible) {
            // Both visible, copy raw transcripts by default
            this.copyRawTranscripts();
        } else if (rawVisible) {
            this.copyRawTranscripts();
        } else if (processedVisible) {
            this.copyProcessedTranscripts();
        } else {
            this.emit('ui:notification', {
                type: 'info',
                message: 'No transcript panels are visible'
            });
        }
    }

    /**
     * Finalize current message (for transcript combining)
     */
    finalizeCurrentMessage() {
        if (this.currentMessage) {
            // Process the current message if needed
            this.currentMessage = null;
            this.lastSpeaker = null;
            this.lastUpdateTime = null;
        }

        this.clearCombineTimer();
    }

    /**
     * Clear combine timer
     */
    clearCombineTimer() {
        if (this.combineTimer) {
            clearTimeout(this.combineTimer);
            this.combineTimer = null;
        }
    }

    /**
     * Load transcripts into panels (for session viewing)
     */
    loadTranscriptsIntoPanel(rawTranscripts = [], processedTranscripts = []) {
        // Clear existing content
        this.clearTranscripts();

        // Load raw transcripts
        if (rawTranscripts.length > 0) {
            this.clearRawTranscriptPlaceholder();

            rawTranscripts.forEach(transcript => {
                this.addRawTranscriptToPanel({
                    text: transcript.text,
                    timestamp: transcript.timestamp,
                    audio_source: transcript.audio_source,
                    sequence_number: transcript.sequence_number,
                    confidence: transcript.confidence
                });
            });

            // Update state
            this.setState('rawTranscripts', rawTranscripts);
            this.setState('rawCount', rawTranscripts.length);
            // When loading historical transcripts, accumulated count should be 0 (no pending processing)
            this.setState('accumulatedCount', 0);

            // Calculate quality metrics
            this.calculateQualityMetricsFromTranscripts(rawTranscripts);
        }

        // Load processed transcripts
        if (processedTranscripts.length > 0) {
            this.clearProcessedTranscriptPlaceholder();

            processedTranscripts.forEach(transcript => {
                this.addProcessedTranscriptToPanel({
                    processed_text: transcript.processed_text,
                    timestamp: transcript.timestamp,
                    original_transcript_count: transcript.original_transcript_count,
                    llm_model: transcript.llm_model
                });
            });

            // Update state
            this.setState('processedTranscripts', processedTranscripts);
            this.setState('processedCount', processedTranscripts.length);
        }

        // Update count displays
        this.updateCountDisplays();

        if (this.debugMode) {
            console.log(`📝 Loaded ${rawTranscripts.length} raw and ${processedTranscripts.length} processed transcripts`);
        }
    }

    /**
     * Calculate quality metrics from historical transcripts
     */
    calculateQualityMetricsFromTranscripts(transcripts) {
        const metrics = {
            segmentCount: 0,
            wordCount: 0,
            avgConfidence: 0,
            confidenceSum: 0,
            confidenceCount: 0
        };

        transcripts.forEach(transcript => {
            // Count segments
            metrics.segmentCount++;

            // Count words
            if (transcript.text) {
                metrics.wordCount += transcript.text.split(/\s+/).filter(word => word.length > 0).length;
            }

            // Sum confidence scores
            if (transcript.confidence !== null && transcript.confidence !== undefined) {
                metrics.confidenceSum += transcript.confidence;
                metrics.confidenceCount++;
            }
        });

        // Calculate average confidence
        if (metrics.confidenceCount > 0) {
            metrics.avgConfidence = metrics.confidenceSum / metrics.confidenceCount;
        }

        this.setState('qualityMetrics', metrics);
        this.updateQualityMetricsDisplay();

        if (this.debugMode) {
            console.log(`📊 Calculated metrics: ${metrics.segmentCount} segments, ${metrics.wordCount} words, ${metrics.confidenceCount} confidence scores`);
        }
    }



    /**
     * Get transcript counts
     */
    getTranscriptCounts() {
        return {
            raw: this.getState('rawCount'),
            processed: this.getState('processedCount'),
            accumulated: this.getState('accumulatedCount')
        };
    }

    /**
     * Get all transcripts
     */
    getAllTranscripts() {
        return {
            raw: this.getState('rawTranscripts'),
            processed: this.getState('processedTranscripts')
        };
    }

    /**
     * Get quality metrics
     */
    getQualityMetrics() {
        return this.getState('qualityMetrics');
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranscriptModule;
} else {
    window.TranscriptModule = TranscriptModule;
}
