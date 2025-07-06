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
        // Database inspector elements
        this.elements.sessionBrowserBtn = document.getElementById('database-btn');
        this.elements.databaseModal = document.getElementById('database-modal');
        this.elements.closeModalBtn = document.getElementById('close-modal-btn');
        this.elements.statsGrid = document.getElementById('stats-grid');
        this.elements.tableContent = document.getElementById('table-content');
        this.elements.rawTab = document.getElementById('raw-tab');
        this.elements.processedTab = document.getElementById('processed-tab');
        this.elements.sessionsTab = document.getElementById('sessions-tab');
        this.elements.sessionBrowserTab = document.getElementById('session-browser-tab');

        // Session browser elements
        this.elements.sessionBrowserControls = document.getElementById('session-browser-controls');
        this.elements.loadSessionBtn = document.getElementById('load-session-btn');
        this.elements.exportSessionBtn = document.getElementById('export-session-btn');
        this.elements.generateSummaryBtn = document.getElementById('generate-summary-btn');
        this.elements.selectedSessionInfo = document.getElementById('selected-session-info');
        this.elements.showBookmarkedOnlyCheckbox = document.getElementById('show-bookmarked-only');
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
                this.openDatabaseInspector();
            });
        }

        if (this.elements.closeModalBtn) {
            this.elements.closeModalBtn.addEventListener('click', () => {
                this.closeDatabaseInspector();
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

        // Tab click listeners
        if (this.elements.rawTab) {
            this.elements.rawTab.addEventListener('click', () => this.showDatabaseTable('raw'));
        }
        if (this.elements.processedTab) {
            this.elements.processedTab.addEventListener('click', () => this.showDatabaseTable('processed'));
        }
        if (this.elements.sessionsTab) {
            this.elements.sessionsTab.addEventListener('click', () => this.showDatabaseTable('sessions'));
        }
        if (this.elements.sessionBrowserTab) {
            this.elements.sessionBrowserTab.addEventListener('click', () => this.showSessionBrowser());
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
     * Open database inspector
     */
    async openDatabaseInspector() {
        try {
            if (this.elements.databaseModal) {
                this.elements.databaseModal.style.display = 'flex';
            }

            // Load database stats
            await this.loadDatabaseStats();

            // Show raw transcripts by default
            await this.showDatabaseTable('raw');

        } catch (error) {
            console.error('Error opening database inspector:', error);
            this.emit('ui:notification', {
                type: 'error',
                message: 'Failed to load database information'
            });
        }
    }

    /**
     * Close database inspector
     */
    closeDatabaseInspector() {
        if (this.elements.databaseModal) {
            this.elements.databaseModal.style.display = 'none';
        }
    }

    /**
     * Load database stats
     */
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
            if (this.elements.statsGrid) {
                this.elements.statsGrid.innerHTML = '<p>Error loading database statistics</p>';
            }
        }
    }

    /**
     * Display database stats
     */
    displayDatabaseStats(stats, recentSessions) {
        if (this.elements.statsGrid) {
            this.elements.statsGrid.innerHTML = `
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
    }

    /**
     * Show database table
     */
    async showDatabaseTable(tableType) {
        // Update tab states
        this.updateTabStates(tableType);

        if (tableType === 'raw') {
            await this.loadRawTranscripts();
        } else if (tableType === 'processed') {
            await this.loadProcessedTranscripts();
        } else if (tableType === 'sessions') {
            await this.loadRecentSessions();
        }
    }

    /**
     * Update tab states
     */
    updateTabStates(activeTab) {
        // Remove active class from all tabs
        if (this.elements.rawTab) this.elements.rawTab.classList.remove('active');
        if (this.elements.processedTab) this.elements.processedTab.classList.remove('active');
        if (this.elements.sessionsTab) this.elements.sessionsTab.classList.remove('active');
        if (this.elements.sessionBrowserTab) this.elements.sessionBrowserTab.classList.remove('active');

        // Add active class to the selected tab and manage session browser controls
        switch (activeTab) {
            case 'raw':
                if (this.elements.rawTab) this.elements.rawTab.classList.add('active');
                if (this.elements.sessionBrowserControls) this.elements.sessionBrowserControls.style.display = 'none';
                break;
            case 'processed':
                if (this.elements.processedTab) this.elements.processedTab.classList.add('active');
                if (this.elements.sessionBrowserControls) this.elements.sessionBrowserControls.style.display = 'none';
                break;
            case 'sessions':
                if (this.elements.sessionsTab) this.elements.sessionsTab.classList.add('active');
                if (this.elements.sessionBrowserControls) this.elements.sessionBrowserControls.style.display = 'none';
                break;
            case 'session-browser':
                if (this.elements.sessionBrowserTab) this.elements.sessionBrowserTab.classList.add('active');
                break;
        }
    }

    /**
     * Load raw transcripts (simplified version)
     */
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
            if (this.elements.tableContent) {
                this.elements.tableContent.innerHTML = '<p>Error loading raw transcripts</p>';
            }
        }
    }

    /**
     * Display raw transcripts (simplified version)
     */
    displayRawTranscripts(transcripts, pagination) {
        if (!this.elements.tableContent) return;

        if (transcripts.length === 0) {
            this.elements.tableContent.innerHTML = '<p>No raw transcripts found</p>';
            return;
        }

        let html = '<table class="database-table"><thead><tr><th>Timestamp</th><th>Source</th><th>Text</th></tr></thead><tbody>';
        transcripts.forEach(transcript => {
            html += `<tr>
                <td>${new Date(transcript.timestamp).toLocaleString()}</td>
                <td>${transcript.audio_source || 'unknown'}</td>
                <td>${transcript.text}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        this.elements.tableContent.innerHTML = html;
    }

    /**
     * Load processed transcripts
     */
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
            if (this.elements.tableContent) {
                this.elements.tableContent.innerHTML = '<p>Error loading processed transcripts</p>';
            }
        }
    }

    /**
     * Display processed transcripts
     */
    displayProcessedTranscripts(transcripts, pagination) {
        if (!this.elements.tableContent) return;

        if (transcripts.length === 0) {
            this.elements.tableContent.innerHTML = '<p>No processed transcripts found</p>';
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

        this.elements.tableContent.innerHTML = tableHtml;
    }

    /**
     * Load recent sessions
     */
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
            if (this.elements.tableContent) {
                this.elements.tableContent.innerHTML = '<p>Error loading sessions</p>';
            }
        }
    }

    /**
     * Display recent sessions
     */
    displayRecentSessions(sessions) {
        if (!this.elements.tableContent) return;

        if (sessions.length === 0) {
            this.elements.tableContent.innerHTML = '<p>No recent sessions found</p>';
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

        this.elements.tableContent.innerHTML = tableHtml;
    }

    /**
     * Show session browser
     */
    async showSessionBrowser() {
        // Update tab states
        this.updateTabStates('session-browser');

        // Show session browser controls
        if (this.elements.sessionBrowserControls) {
            this.elements.sessionBrowserControls.style.display = 'block';
        }

        // Restore bookmark filter state from localStorage
        if (this.elements.showBookmarkedOnlyCheckbox) {
            const savedFilter = localStorage.getItem('bookmarkFilter');
            if (savedFilter !== null) {
                this.elements.showBookmarkedOnlyCheckbox.checked = savedFilter === 'true';
            }
        }

        // Reset selection state
        this.selectedSessionId = null;
        if (this.elements.loadSessionBtn) {
            this.elements.loadSessionBtn.disabled = true;
        }
        if (this.elements.exportSessionBtn) {
            this.elements.exportSessionBtn.disabled = true;
        }
        if (this.elements.generateSummaryBtn) {
            this.elements.generateSummaryBtn.disabled = true;
        }
        if (this.elements.selectedSessionInfo) {
            this.elements.selectedSessionInfo.textContent = 'No session selected';
        }

        // Load sessions
        await this.loadSessionsTable();
    }

    /**
     * Load sessions table for session browser
     */
    async loadSessionsTable(bookmarkedOnly = null) {
        try {
            // Use the checkbox state if no explicit filter provided
            if (bookmarkedOnly === null && this.elements.showBookmarkedOnlyCheckbox) {
                bookmarkedOnly = this.elements.showBookmarkedOnlyCheckbox.checked;
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
            if (this.elements.tableContent) {
                this.elements.tableContent.innerHTML = '<p>Error loading sessions</p>';
            }
        }
    }

    /**
     * Display selectable sessions for session browser
     */
    displaySelectableSessions(sessions) {
        if (!this.elements.tableContent) return;

        if (sessions.length === 0) {
            this.elements.tableContent.innerHTML = '<p>No sessions found</p>';
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

        this.elements.tableContent.innerHTML = tableHtml;

        // Add click listeners for session selection
        this.setupSessionClickListeners();
    }

    /**
     * Update bookmark count display
     */
    updateBookmarkCount(sessions) {
        if (!this.elements.bookmarkCountSpan) return;

        const bookmarkedCount = sessions.filter(s => s.bookmarked).length;
        this.elements.bookmarkCountSpan.textContent = `(${bookmarkedCount} bookmarked)`;
    }

    /**
     * Setup click listeners for session rows
     */
    setupSessionClickListeners() {
        if (!this.elements.tableContent) return;

        const sessionRows = this.elements.tableContent.querySelectorAll('tr.selectable');
        sessionRows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't select if clicking on bookmark star
                if (e.target.classList.contains('bookmark-star')) {
                    return;
                }
                this.selectSession(row);
            });
        });

        // Add bookmark star click listeners
        const bookmarkStars = this.elements.tableContent.querySelectorAll('.bookmark-star');
        bookmarkStars.forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSessionBookmark(star.dataset.sessionId);
            });
        });
    }

    /**
     * Select a session row
     */
    selectSession(row) {
        // Remove previous selection
        if (this.elements.tableContent) {
            this.elements.tableContent.querySelectorAll('tr.selected').forEach(r => {
                r.classList.remove('selected');
            });
        }

        // Add selection to clicked row
        row.classList.add('selected');
        this.selectedSessionId = row.dataset.sessionId;

        // Enable action buttons
        if (this.elements.loadSessionBtn) {
            this.elements.loadSessionBtn.disabled = false;
        }
        if (this.elements.exportSessionBtn) {
            this.elements.exportSessionBtn.disabled = false;
        }
        if (this.elements.generateSummaryBtn) {
            this.elements.generateSummaryBtn.disabled = false;
        }

        // Update selected session info
        if (this.elements.selectedSessionInfo) {
            this.elements.selectedSessionInfo.textContent = `Selected: ${this.selectedSessionId.replace('session_', '')}`;
        }
    }

    /**
     * Toggle session bookmark (placeholder for now)
     */
    async toggleSessionBookmark(sessionId) {
        console.log('Toggle bookmark for session:', sessionId);
        // This would need to be implemented with the actual bookmark API
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
