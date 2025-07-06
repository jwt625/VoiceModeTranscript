/**
 * SSE (Server-Sent Events) Module
 *
 * Handles Server-Sent Events connection, message routing, and reconnection logic.
 * Provides a centralized way to manage real-time communication with the server.
 */
class SSEModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('sse', eventBus, stateStore, config);

        this.eventSource = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.isConnected = false;
        this.lastHeartbeat = null;
        this.heartbeatTimer = null;
    }

    /**
     * Get default configuration for the SSE module
     */
    getDefaultConfig() {
        return {
            reconnectInterval: 5000,
            maxReconnectAttempts: 10,
            heartbeatTimeout: 30000,
            endpoint: '/stream'
        };
    }

    /**
     * Get initial state for the SSE module
     */
    getInitialState() {
        return {
            isConnected: false,
            reconnectAttempts: 0,
            lastHeartbeat: null,
            connectionState: 'disconnected'
        };
    }

    /**
     * Initialize the SSE module
     */
    async onInitialize() {
        this.setupSSEConnection();
        this.startHeartbeatMonitor();

        if (this.debugMode) {
            console.log('🔧 SSE module initialized');
        }
    }

    /**
     * Clean up SSE module
     */
    async onDestroy() {
        this.disconnect();
        this.stopHeartbeatMonitor();
    }

    /**
     * Set up SSE connection
     */
    setupSSEConnection() {
        if (this.eventSource) {
            this.disconnect();
        }

        console.log('📡 Setting up SSE connection...');

        try {
            this.eventSource = new EventSource(this.config.endpoint);
            this.setupEventListeners();
            this.setState('connectionState', 'connecting');
        } catch (error) {
            console.error('❌ Failed to create SSE connection:', error);
            this.handleConnectionError(error);
        }
    }

    /**
     * Set up event listeners for SSE
     */
    setupEventListeners() {
        if (!this.eventSource) return;

        this.eventSource.onopen = (event) => {
            console.log('📡 SSE connection opened');
            this.handleConnectionOpen();
        };

        this.eventSource.onerror = (error) => {
            console.error('❌ SSE connection error:', error);
            this.handleConnectionError(error);
        };

        this.eventSource.onmessage = (event) => {
            this.handleMessage(event);
        };
    }

    /**
     * Handle SSE connection open
     */
    handleConnectionOpen() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastHeartbeat = Date.now();

        this.setState('isConnected', true);
        this.setState('reconnectAttempts', 0);
        this.setState('connectionState', 'connected');
        this.setState('lastHeartbeat', this.lastHeartbeat);

        this.emit('sse:connected');
        this.emit('ui:status_updated', { status: 'ready', message: 'Connected' });

        if (this.debugMode) {
            console.log('✅ SSE connection established');
        }
    }

    /**
     * Handle SSE connection error
     */
    handleConnectionError(error) {
        this.isConnected = false;
        this.setState('isConnected', false);
        this.setState('connectionState', 'error');

        this.emit('sse:error', { error });
        this.emit('ui:status_updated', { status: 'error', message: 'Connection Error' });

        // Attempt reconnection if not at max attempts
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
        } else {
            console.error('❌ Max reconnection attempts reached');
            this.emit('sse:max_reconnects_reached');
        }
    }

    /**
     * Handle incoming SSE message
     */
    handleMessage(event) {
        try {
            if (this.debugMode) {
                console.log('🔍 Raw SSE event data:', event.data);
            }

            const data = JSON.parse(event.data);

            if (this.debugMode) {
                console.log('📨 SSE message parsed:', data);
            }

            this.routeMessage(data);
        } catch (error) {
            console.error('❌ Error parsing SSE message:', error, 'Raw data:', event.data);
            this.emit('sse:parse_error', { error, rawData: event.data });
        }
    }

    /**
     * Route SSE message to appropriate handlers
     */
    routeMessage(data) {
        const messageType = data.type;

        // Update heartbeat for any message
        this.lastHeartbeat = Date.now();
        this.setState('lastHeartbeat', this.lastHeartbeat);

        // Handle heartbeat messages
        if (messageType === 'heartbeat') {
            console.log('💓 Heartbeat received');
            this.handleHeartbeat(data);
            return;
        }

        // Emit specific event for the message type
        this.emit(`sse:message_received`, data);
        this.emit(`sse:${messageType}`, data);

        // Route to specific modules based on message type
        switch (messageType) {
            case 'recording_started':
            case 'recording_stopped':
            case 'recording_paused':
            case 'recording_resumed':
                this.emit('recording:sse_event', data);
                break;

            case 'raw_transcript':
                this.emit('transcript:raw_received', data);
                break;

            case 'llm_processing_start':
            case 'llm_processing_complete':
            case 'llm_processing_error':
            case 'llm_auto_processing_triggered':
                this.emit('llm:sse_event', data);
                break;

            case 'session_summary_generated':
            case 'session_summary_error':
                this.emit('database:sse_event', data);
                break;

            case 'audio_level':
                this.emit('device:audio_level', data);
                break;

            case 'whisper_error':
                this.emit('recording:whisper_error', data);
                break;

            default:
                if (this.debugMode) {
                    console.log('❓ Unknown SSE message type:', messageType, data);
                }
                this.emit('sse:unknown_message', data);
        }
    }

    /**
     * Handle heartbeat message
     */
    handleHeartbeat(data) {
        // Handle heartbeat with optional state sync
        if (data.state_sync) {
            this.emit('app:validate_state_sync', data.state_sync);
        }

        this.emit('sse:heartbeat', data);
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectAttempts++;
        this.setState('reconnectAttempts', this.reconnectAttempts);
        this.setState('connectionState', 'reconnecting');

        const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5); // Exponential backoff

        console.log(`🔄 Scheduling SSE reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimer = setTimeout(() => {
            this.setupSSEConnection();
        }, delay);

        this.emit('sse:reconnecting', {
            attempt: this.reconnectAttempts,
            delay
        });
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeatMonitor() {
        this.heartbeatTimer = setInterval(() => {
            this.checkHeartbeat();
        }, this.config.heartbeatTimeout / 2); // Check every half timeout period
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeatMonitor() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Check if heartbeat is still active
     */
    checkHeartbeat() {
        if (!this.isConnected || !this.lastHeartbeat) {
            return;
        }

        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

        if (timeSinceLastHeartbeat > this.config.heartbeatTimeout) {
            console.warn('⚠️ SSE heartbeat timeout detected');
            this.handleConnectionError(new Error('Heartbeat timeout'));
        }
    }

    /**
     * Manually disconnect SSE
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.isConnected = false;
        this.setState('isConnected', false);
        this.setState('connectionState', 'disconnected');

        this.emit('sse:disconnected');

        if (this.debugMode) {
            console.log('📡 SSE connection closed');
        }
    }

    /**
     * Manually reconnect SSE
     */
    reconnect() {
        console.log('🔄 Manual SSE reconnection requested');
        this.reconnectAttempts = 0;
        this.setState('reconnectAttempts', 0);
        this.setupSSEConnection();
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            lastHeartbeat: this.lastHeartbeat,
            connectionState: this.getState('connectionState')
        };
    }

    /**
     * Check if SSE is connected
     */
    isSSEConnected() {
        return this.isConnected;
    }

    /**
     * Get time since last heartbeat
     */
    getTimeSinceLastHeartbeat() {
        if (!this.lastHeartbeat) {
            return null;
        }
        return Date.now() - this.lastHeartbeat;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SSEModule;
} else {
    window.SSEModule = SSEModule;
}
