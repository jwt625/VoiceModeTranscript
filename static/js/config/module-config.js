/**
 * Module Configuration
 *
 * Defines configuration settings, dependencies, and initialization order for all modules.
 */

/**
 * Module definitions with their dependencies and configuration
 */
const MODULE_DEFINITIONS = {
    // Core utility module - no dependencies
    utils: {
        path: 'modules/utils.js',
        className: 'UtilsModule',
        dependencies: [],
        config: {
            enableKeyboardShortcuts: true,
            enableMobileDetection: true,
            enableClipboardAPI: true
        }
    },

    // Server-Sent Events module - depends on utils
    sse: {
        path: 'modules/sse.js',
        className: 'SSEModule',
        dependencies: ['utils'],
        config: {
            reconnectInterval: 5000,
            maxReconnectAttempts: 10,
            heartbeatTimeout: 30000
        }
    },

    // UI module - depends on utils
    ui: {
        path: 'modules/ui.js',
        className: 'UIModule',
        dependencies: ['utils'],
        config: {
            notificationTimeout: 5000,
            animationDuration: 300,
            enableAnimations: true
        }
    },

    // Device management module - depends on utils
    device: {
        path: 'modules/device.js',
        className: 'DeviceModule',
        dependencies: ['utils'],
        config: {
            audioLevelUpdateInterval: 100,
            deviceRefreshInterval: 30000
        }
    },

    // Recording module - depends on device, sse, ui
    recording: {
        path: 'modules/recording.js',
        className: 'RecordingModule',
        dependencies: ['device', 'sse', 'ui'],
        config: {
            durationUpdateInterval: 1000,
            autoSaveInterval: 30000
        }
    },

    // Transcript module - depends on ui, utils
    transcript: {
        path: 'modules/transcript.js',
        className: 'TranscriptModule',
        dependencies: ['ui', 'utils'],
        config: {
            combineTimeout: 3000,
            maxTranscriptEntries: 1000,
            qualityMetricsEnabled: true
        }
    },

    // LLM module - depends on transcript, ui, sse
    llm: {
        path: 'modules/llm.js',
        className: 'LLMModule',
        dependencies: ['transcript', 'ui', 'sse'],
        config: {
            autoProcessingInterval: 120000, // 2 minutes
            processingTimeout: 60000,
            maxRetries: 3
        }
    },

    // Database module - depends on ui, utils
    database: {
        path: 'modules/database.js',
        className: 'DatabaseModule',
        dependencies: ['ui', 'utils'],
        config: {
            exportFormats: ['json', 'txt', 'csv'],
            maxSessionsToLoad: 100
        }
    }
};

/**
 * Global application configuration
 */
const APP_CONFIG = {
    // Debug settings
    debug: {
        enabled: false,
        modules: [], // Empty array means all modules, or specify module names
        eventBus: false,
        stateStore: false
    },

    // Event bus configuration
    eventBus: {
        timeout: 5000,
        asyncEmission: false
    },

    // State store configuration
    stateStore: {
        maxHistorySize: 50,
        enableValidation: true
    },

    // Module loading configuration
    moduleLoading: {
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000
    },

    // Application-wide settings
    app: {
        name: 'Voice Mode Transcript Recorder',
        version: '2.0.0',
        enableStateRecovery: true,
        enablePerformanceMonitoring: false
    }
};

/**
 * Event type definitions for type safety and documentation
 */
const EVENT_TYPES = {
    // Application lifecycle events
    APP_INITIALIZED: 'app:initialized',
    APP_READY: 'app:ready',
    APP_ERROR: 'app:error',

    // Module lifecycle events
    MODULE_INITIALIZED: 'module:initialized',
    MODULE_DESTROYED: 'module:destroyed',
    MODULE_ENABLED: 'module:enabled',
    MODULE_DISABLED: 'module:disabled',

    // Recording events
    RECORDING_STARTED: 'recording:started',
    RECORDING_STOPPED: 'recording:stopped',
    RECORDING_PAUSED: 'recording:paused',
    RECORDING_RESUMED: 'recording:resumed',
    RECORDING_ERROR: 'recording:error',

    // Transcript events
    TRANSCRIPT_ADDED: 'transcript:added',
    TRANSCRIPT_UPDATED: 'transcript:updated',
    TRANSCRIPT_CLEARED: 'transcript:cleared',
    TRANSCRIPT_COMBINED: 'transcript:combined',

    // LLM processing events
    LLM_PROCESSING_STARTED: 'llm:processing_started',
    LLM_PROCESSING_COMPLETED: 'llm:processing_completed',
    LLM_PROCESSING_ERROR: 'llm:processing_error',
    LLM_AUTO_PROCESSING_TRIGGERED: 'llm:auto_processing_triggered',

    // UI events
    UI_NOTIFICATION: 'ui:notification',
    UI_PANEL_TOGGLED: 'ui:panel_toggled',
    UI_STATUS_UPDATED: 'ui:status_updated',

    // Device events
    DEVICE_SELECTED: 'device:selected',
    DEVICE_AUDIO_LEVEL: 'device:audio_level',
    DEVICE_ERROR: 'device:error',

    // Database events
    DATABASE_SESSION_LOADED: 'database:session_loaded',
    DATABASE_EXPORT_COMPLETED: 'database:export_completed',
    DATABASE_ERROR: 'database:error',

    // SSE events
    SSE_CONNECTED: 'sse:connected',
    SSE_DISCONNECTED: 'sse:disconnected',
    SSE_ERROR: 'sse:error',
    SSE_MESSAGE_RECEIVED: 'sse:message_received',

    // State events
    STATE_CHANGED: 'state:changed',
    STATE_RESET: 'state:reset'
};

/**
 * State path definitions for consistent state management
 */
const STATE_PATHS = {
    // Application state
    APP_INITIALIZED: 'app.initialized',
    APP_READY: 'app.ready',

    // Recording state
    RECORDING_IS_RECORDING: 'recording.isRecording',
    RECORDING_IS_PAUSED: 'recording.isPaused',
    RECORDING_SESSION_ID: 'recording.sessionId',
    RECORDING_START_TIME: 'recording.startTime',
    RECORDING_DURATION: 'recording.duration',

    // Transcript state
    TRANSCRIPT_RAW_COUNT: 'transcript.rawCount',
    TRANSCRIPT_PROCESSED_COUNT: 'transcript.processedCount',
    TRANSCRIPT_RAW_ENTRIES: 'transcript.rawEntries',
    TRANSCRIPT_PROCESSED_ENTRIES: 'transcript.processedEntries',

    // LLM state
    LLM_IS_PROCESSING: 'llm.isProcessing',
    LLM_CURRENT_JOB: 'llm.currentJob',
    LLM_AUTO_PROCESSING_ENABLED: 'llm.autoProcessingEnabled',
    LLM_AUTO_PROCESSING_INTERVAL: 'llm.autoProcessingInterval',

    // UI state
    UI_RAW_PANEL_VISIBLE: 'ui.rawPanelVisible',
    UI_PROCESSED_PANEL_VISIBLE: 'ui.processedPanelVisible',
    UI_CURRENT_STATUS: 'ui.currentStatus',

    // Device state
    DEVICE_SELECTED_MIC: 'device.selectedMic',
    DEVICE_SELECTED_SYSTEM: 'device.selectedSystem',
    DEVICE_AVAILABLE_DEVICES: 'device.availableDevices',

    // Database state
    DATABASE_SELECTED_SESSION: 'database.selectedSession',
    DATABASE_SESSIONS: 'database.sessions',
    DATABASE_IS_LOADING: 'database.isLoading'
};

/**
 * Utility function to get module initialization order based on dependencies
 * @returns {string[]} Array of module names in initialization order
 */
function getModuleInitializationOrder() {
    const modules = Object.keys(MODULE_DEFINITIONS);
    const resolved = [];
    const resolving = new Set();

    function resolve(moduleName) {
        if (resolved.includes(moduleName)) {
            return;
        }

        if (resolving.has(moduleName)) {
            throw new Error(`Circular dependency detected involving module: ${moduleName}`);
        }

        resolving.add(moduleName);

        const module = MODULE_DEFINITIONS[moduleName];
        if (!module) {
            throw new Error(`Module definition not found: ${moduleName}`);
        }

        // Resolve dependencies first
        module.dependencies.forEach(dep => resolve(dep));

        resolving.delete(moduleName);
        resolved.push(moduleName);
    }

    modules.forEach(module => resolve(module));
    return resolved;
}

/**
 * Validate module configuration
 * @param {string} moduleName - Name of the module to validate
 * @returns {boolean} True if valid
 */
function validateModuleConfig(moduleName) {
    const module = MODULE_DEFINITIONS[moduleName];

    if (!module) {
        console.error(`Module definition not found: ${moduleName}`);
        return false;
    }

    if (!module.path) {
        console.error(`Module path not defined: ${moduleName}`);
        return false;
    }

    if (!module.className) {
        console.error(`Module class name not defined: ${moduleName}`);
        return false;
    }

    if (!Array.isArray(module.dependencies)) {
        console.error(`Module dependencies must be an array: ${moduleName}`);
        return false;
    }

    // Check if all dependencies exist
    for (const dep of module.dependencies) {
        if (!MODULE_DEFINITIONS[dep]) {
            console.error(`Dependency not found: ${dep} (required by ${moduleName})`);
            return false;
        }
    }

    return true;
}

// Export configuration objects
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MODULE_DEFINITIONS,
        APP_CONFIG,
        EVENT_TYPES,
        STATE_PATHS,
        getModuleInitializationOrder,
        validateModuleConfig
    };
} else {
    window.ModuleConfig = {
        MODULE_DEFINITIONS,
        APP_CONFIG,
        EVENT_TYPES,
        STATE_PATHS,
        getModuleInitializationOrder,
        validateModuleConfig
    };
}
