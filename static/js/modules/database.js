/**
 * Database Module
 *
 * Handles database operations, session management, session browser functionality,
 * export operations, bookmark features, and session viewing.
 */
class DatabaseModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('database', eventBus, stateStore, config);

        this.elements = {};
        this.isSessionViewingMode = false;
    }

    /**
     * Get default configuration for the database module
     */
    getDefaultConfig() {
        return {
            exportFormats: ['json', 'txt', 'csv'],
            maxSessionsToLoad: 100,
            enableBookmarks: true,
            autoRefreshInterval: 30000
        };
    }

    /**
     * Get initial state for the database module
     */
    getInitialState() {
        return {
            sessions: [],
            selectedSession: null,
            isLoading: false,
            isSessionViewingMode: false,
            bookmarkedSessions: [],
            exportInProgress: false
        };
    }

    /**
     * Initialize the database module
     */
    async onInitialize() {
        this.initializeElements();
        this.setupEventListeners();
        await this.loadSessions();

        if (this.debugMode) {
            console.log('🔧 Database module initialized');
        }
    }

    /**
     * Set up event listeners for database events
     */
    setupEventListeners() {
        // Listen for database-related events
        this.on('database:load_sessions', () => this.loadSessions());
        this.on('database:select_session', (data) => this.selectSession(data.sessionId));
        this.on('database:toggle_bookmark', () => this.toggleBookmark());
        this.on('database:export_session', (data) => this.exportSession(data));
        this.on('database:exit_session_viewing', () => this.exitSessionViewingMode());

        // Listen for keyboard shortcuts
        this.on('utils:toggle_bookmark_requested', () => this.toggleBookmark());

        // Listen for SSE events
        this.on('database:sse_event', (data) => this.handleSSEEvent(data));

        // Listen for app events
        this.on('app:exit_session_viewing_mode', () => this.exitSessionViewingMode());
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Session browser elements
        this.elements.sessionBrowserBtn = document.getElementById('session-browser-btn');
        this.elements.sessionModal = document.getElementById('session-modal');
        this.elements.sessionList = document.getElementById('session-list');
        this.elements.closeSessionModalBtn = document.getElementById('close-session-modal');
        this.elements.refreshSessionsBtn = document.getElementById('refresh-sessions-btn');

        // Session viewing elements
        this.elements.sessionViewingIndicator = document.getElementById('session-viewing-indicator');
        this.elements.exitSessionViewingBtn = document.getElementById('exit-session-viewing-btn');
        this.elements.currentSessionTitle = document.getElementById('current-session-title');

        // Export elements
        this.elements.exportBtn = document.getElementById('export-btn');
        this.elements.exportFormatSelect = document.getElementById('export-format');
        this.elements.exportContentSelect = document.getElementById('export-content');

        // Bookmark elements
        this.elements.bookmarkBtn = document.getElementById('bookmark-btn');
        this.elements.bookmarkStatus = document.getElementById('bookmark-status');

        // Set up event listeners
        this.setupDOMEventListeners();
    }

    /**
     * Set up DOM event listeners
     */
    setupDOMEventListeners() {
        if (this.elements.sessionBrowserBtn) {
            this.elements.sessionBrowserBtn.addEventListener('click', () => {
                this.openSessionBrowser();
            });
        }

        if (this.elements.closeSessionModalBtn) {
            this.elements.closeSessionModalBtn.addEventListener('click', () => {
                this.closeSessionBrowser();
            });
        }

        if (this.elements.refreshSessionsBtn) {
            this.elements.refreshSessionsBtn.addEventListener('click', () => {
                this.emit('database:load_sessions');
            });
        }

        if (this.elements.exitSessionViewingBtn) {
            this.elements.exitSessionViewingBtn.addEventListener('click', () => {
                this.emit('database:exit_session_viewing');
            });
        }

        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => {
                this.handleExportRequest();
            });
        }

        if (this.elements.bookmarkBtn) {
            this.elements.bookmarkBtn.addEventListener('click', () => {
                this.emit('database:toggle_bookmark');
            });
        }

        // Close modal when clicking outside
        if (this.elements.sessionModal) {
            this.elements.sessionModal.addEventListener('click', (e) => {
                if (e.target === this.elements.sessionModal) {
                    this.closeSessionBrowser();
                }
            });
        }
    }

    /**
     * Load sessions from database
     */
    async loadSessions() {
        this.setState('isLoading', true);

        try {
            console.log('📊 Loading sessions...');

            const response = await fetch('/api/sessions');
            const data = await response.json();

            if (response.ok) {
                this.setState('sessions', data.sessions || []);
                this.populateSessionList(data.sessions || []);

                console.log(`📊 Loaded ${data.sessions?.length || 0} sessions`);

                this.emit('database:sessions_loaded', {
                    sessions: data.sessions || [],
                    count: data.sessions?.length || 0
                });
            } else {
                throw new Error(data.error || 'Failed to load sessions');
            }
        } catch (error) {
            console.error('❌ Error loading sessions:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to load sessions: ' + error.message
            });
        } finally {
            this.setState('isLoading', false);
        }
    }

    /**
     * Populate session list in the browser
     */
    populateSessionList(sessions) {
        if (!this.elements.sessionList) return;

        this.elements.sessionList.innerHTML = '';

        if (sessions.length === 0) {
            this.elements.sessionList.innerHTML = `
                <div class="no-sessions">
                    <p>No recording sessions found.</p>
                    <p>Start recording to create your first session!</p>
                </div>
            `;
            return;
        }

        sessions.forEach(session => {
            const sessionItem = this.createSessionListItem(session);
            this.elements.sessionList.appendChild(sessionItem);
        });
    }

    /**
     * Create session list item
     */
    createSessionListItem(session) {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.dataset.sessionId = session.id;

        // Format session info
        const startTime = new Date(session.start_time).toLocaleString();
        const duration = session.duration ? `${session.duration}min` : 'Unknown';
        const rawCount = session.raw_count || 0;
        const processedCount = session.processed_count || 0;
        const bookmarkIcon = session.bookmarked ? '⭐' : '☆';

        item.innerHTML = `
            <div class="session-header">
                <div class="session-id">${session.id}</div>
                <div class="session-bookmark ${session.bookmarked ? 'bookmarked' : ''}">${bookmarkIcon}</div>
            </div>
            <div class="session-details">
                <div class="session-time">📅 ${startTime}</div>
                <div class="session-duration">⏱️ ${duration}</div>
                <div class="session-counts">
                    📝 ${rawCount} raw, ✨ ${processedCount} processed
                </div>
            </div>
            <div class="session-actions">
                <button class="load-session-btn" data-session-id="${session.id}">
                    📂 Load Session
                </button>
                <button class="export-session-btn" data-session-id="${session.id}">
                    💾 Export
                </button>
            </div>
        `;

        // Add event listeners
        const loadBtn = item.querySelector('.load-session-btn');
        const exportBtn = item.querySelector('.export-session-btn');

        if (loadBtn) {
            loadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('database:select_session', { sessionId: session.id });
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showExportDialog(session.id);
            });
        }

        return item;
    }

    /**
     * Select and load a session
     */
    async selectSession(sessionId) {
        try {
            this.setState('selectedSession', sessionId);
            this.setState('isLoading', true);

            console.log(`📂 Loading session: ${sessionId}`);

            // Load session transcripts
            const response = await fetch(`/api/sessions/${sessionId}/transcripts`);
            const data = await response.json();

            if (response.ok) {
                // Enter session viewing mode
                this.enterSessionViewingMode(sessionId);

                // Load transcripts into transcript module
                this.emit('transcript:load_session_transcripts', {
                    sessionId,
                    rawTranscripts: data.raw || [],
                    processedTranscripts: data.processed || []
                });

                // Close session browser
                this.closeSessionBrowser();

                this.emit('ui:notification', {
                    type: 'success',
                    message: `Loaded session ${sessionId}`
                });

                console.log(`📂 Session ${sessionId} loaded successfully`);
            } else {
                throw new Error(data.error || 'Failed to load session');
            }
        } catch (error) {
            console.error('❌ Error loading session:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to load session: ' + error.message
            });
        } finally {
            this.setState('isLoading', false);
        }
    }

    /**
     * Enter session viewing mode
     */
    enterSessionViewingMode(sessionId) {
        this.isSessionViewingMode = true;
        this.setState('isSessionViewingMode', true);

        // Update UI to show session viewing mode
        if (this.elements.sessionViewingIndicator) {
            this.elements.sessionViewingIndicator.style.display = 'block';
        }

        if (this.elements.currentSessionTitle) {
            this.elements.currentSessionTitle.textContent = sessionId;
        }

        // Disable recording controls
        this.emit('ui:button_state_updated', { buttonId: 'startBtn', disabled: true });

        this.emit('database:session_viewing_entered', { sessionId });

        if (this.debugMode) {
            console.log(`👁️ Entered session viewing mode: ${sessionId}`);
        }
    }

    /**
     * Exit session viewing mode
     */
    exitSessionViewingMode() {
        if (!this.isSessionViewingMode) return;

        this.isSessionViewingMode = false;
        this.setState('isSessionViewingMode', false);
        this.setState('selectedSession', null);

        // Update UI to hide session viewing mode
        if (this.elements.sessionViewingIndicator) {
            this.elements.sessionViewingIndicator.style.display = 'none';
        }

        // Re-enable recording controls
        this.emit('ui:button_state_updated', { buttonId: 'startBtn', disabled: false });

        // Clear transcripts
        this.emit('transcript:clear_requested');

        this.emit('database:session_viewing_exited');

        if (this.debugMode) {
            console.log('👁️ Exited session viewing mode');
        }
    }

    /**
     * Open session browser
     */
    openSessionBrowser() {
        if (this.elements.sessionModal) {
            this.elements.sessionModal.style.display = 'block';
        }

        // Refresh sessions when opening
        this.loadSessions();
    }

    /**
     * Close session browser
     */
    closeSessionBrowser() {
        if (this.elements.sessionModal) {
            this.elements.sessionModal.style.display = 'none';
        }
    }

    /**
     * Toggle bookmark for current session
     */
    async toggleBookmark() {
        const currentSessionId = this.getCurrentSessionId();

        if (!currentSessionId) {
            this.emit('ui:notification', {
                type: 'warning',
                message: 'No active session to bookmark'
            });
            return;
        }

        try {
            console.log(`⭐ Toggling bookmark for session: ${currentSessionId}`);

            const response = await fetch(`/api/sessions/${currentSessionId}/bookmark`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                const isBookmarked = result.bookmarked;
                this.updateBookmarkStatus(isBookmarked);

                this.emit('ui:notification', {
                    type: 'success',
                    message: isBookmarked ? 'Session bookmarked' : 'Bookmark removed'
                });

                console.log(`⭐ Session ${currentSessionId} ${isBookmarked ? 'bookmarked' : 'unbookmarked'}`);
            } else {
                throw new Error(result.error || 'Failed to toggle bookmark');
            }
        } catch (error) {
            console.error('❌ Error toggling bookmark:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to toggle bookmark: ' + error.message
            });
        }
    }

    /**
     * Update bookmark status display
     */
    updateBookmarkStatus(isBookmarked) {
        if (this.elements.bookmarkBtn) {
            this.elements.bookmarkBtn.textContent = isBookmarked ? '⭐ Bookmarked' : '☆ Bookmark';
            this.elements.bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
        }

        if (this.elements.bookmarkStatus) {
            this.elements.bookmarkStatus.textContent = isBookmarked ? 'Bookmarked' : 'Not bookmarked';
        }
    }

    /**
     * Handle export request
     */
    handleExportRequest() {
        const currentSessionId = this.getCurrentSessionId();

        if (!currentSessionId) {
            this.emit('ui:notification', {
                type: 'warning',
                message: 'No active session to export'
            });
            return;
        }

        const format = this.elements.exportFormatSelect?.value || 'json';
        const content = this.elements.exportContentSelect?.value || 'both';

        this.emit('database:export_session', {
            sessionId: currentSessionId,
            format,
            content
        });
    }

    /**
     * Show export dialog for a specific session
     */
    showExportDialog(sessionId) {
        // For now, use default export settings
        // In the future, this could show a modal with export options
        this.emit('database:export_session', {
            sessionId,
            format: 'json',
            content: 'both'
        });
    }

    /**
     * Export session
     */
    async exportSession(data) {
        const { sessionId, format = 'json', content = 'both' } = data;

        try {
            this.setState('exportInProgress', true);

            console.log(`💾 Exporting session ${sessionId} as ${format} (${content})`);

            // Construct export URL
            const exportUrl = `/api/sessions/${sessionId}/export?format=${format}&content=${content}`;

            // Create a temporary link to trigger download
            const link = document.createElement('a');
            link.href = exportUrl;
            link.download = `session_${sessionId}_${content}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.emit('ui:notification', {
                type: 'success',
                message: `Session exported as ${format.toUpperCase()}`
            });

            this.emit('database:export_completed', {
                sessionId,
                format,
                content
            });

            console.log(`💾 Session ${sessionId} exported successfully`);
        } catch (error) {
            console.error('❌ Error exporting session:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to export session: ' + error.message
            });
        } finally {
            this.setState('exportInProgress', false);
        }
    }

    /**
     * Get current session ID
     */
    getCurrentSessionId() {
        // Check if in session viewing mode
        if (this.isSessionViewingMode) {
            return this.getState('selectedSession');
        }

        // Check if currently recording
        const recordingSessionId = this.getGlobalState('recording.sessionId');
        if (recordingSessionId) {
            return recordingSessionId;
        }

        return null;
    }

    /**
     * Handle SSE events related to database
     */
    handleSSEEvent(data) {
        switch (data.type) {
            case 'session_summary_generated':
                this.handleSessionSummaryGenerated(data);
                break;
            case 'session_summary_error':
                this.handleSessionSummaryError(data);
                break;
            default:
                if (this.debugMode) {
                    console.log('❓ Unknown database SSE event:', data.type);
                }
        }
    }

    /**
     * Handle session summary generated
     */
    handleSessionSummaryGenerated(data) {
        this.emit('ui:notification', {
            type: 'success',
            message: 'Session summary generated successfully'
        });

        if (this.debugMode) {
            console.log('📝 Session summary generated:', data);
        }
    }

    /**
     * Handle session summary error
     */
    handleSessionSummaryError(data) {
        this.emit('ui:notification', {
            type: 'error',
            message: 'Failed to generate session summary: ' + (data.error || 'Unknown error')
        });

        if (this.debugMode) {
            console.error('❌ Session summary error:', data);
        }
    }

    /**
     * Get sessions list
     */
    getSessions() {
        return this.getState('sessions');
    }

    /**
     * Get selected session
     */
    getSelectedSession() {
        return this.getState('selectedSession');
    }

    /**
     * Check if in session viewing mode
     */
    isInSessionViewingMode() {
        return this.getState('isSessionViewingMode');
    }

    /**
     * Get export status
     */
    getExportStatus() {
        return {
            inProgress: this.getState('exportInProgress'),
            availableFormats: this.config.exportFormats
        };
    }

    /**
     * Refresh sessions list
     */
    refreshSessions() {
        this.loadSessions();
    }

    /**
     * Search sessions by criteria
     */
    searchSessions(criteria) {
        const sessions = this.getState('sessions');

        if (!criteria || !criteria.trim()) {
            return sessions;
        }

        const searchTerm = criteria.toLowerCase();

        return sessions.filter(session => {
            return (
                session.id.toLowerCase().includes(searchTerm) ||
                (session.start_time && session.start_time.toLowerCase().includes(searchTerm)) ||
                (session.bookmarked && searchTerm.includes('bookmark'))
            );
        });
    }

    /**
     * Get bookmarked sessions
     */
    getBookmarkedSessions() {
        const sessions = this.getState('sessions');
        return sessions.filter(session => session.bookmarked);
    }

    /**
     * Get session statistics
     */
    getSessionStatistics() {
        const sessions = this.getState('sessions');

        return {
            total: sessions.length,
            bookmarked: sessions.filter(s => s.bookmarked).length,
            withRawTranscripts: sessions.filter(s => (s.raw_count || 0) > 0).length,
            withProcessedTranscripts: sessions.filter(s => (s.processed_count || 0) > 0).length
        };
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseModule;
} else {
    window.DatabaseModule = DatabaseModule;
}
