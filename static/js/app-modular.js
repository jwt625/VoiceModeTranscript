/**
 * Modular Application Orchestrator
 *
 * Main application class that initializes and coordinates all modules using
 * the EventBus and StateStore architecture. Replaces the monolithic app.js.
 */
class ModularTranscriptRecorder {
    constructor() {
        this.eventBus = null;
        this.stateStore = null;
        this.modules = new Map();
        this.isInitialized = false;
        this.debugMode = false;

        // Module initialization order (based on dependencies)
        this.moduleOrder = [
            'utils',
            'sse',
            'ui',
            'device',
            'recording',
            'transcript',
            'llm',
            'database'
        ];
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Modular Transcript Recorder...');

            // Initialize core systems
            this.initializeCoreSystem();

            // Load module configuration
            this.loadModuleConfiguration();

            // Initialize modules in dependency order
            await this.initializeModules();

            // Set up global event handlers
            this.setupGlobalEventHandlers();

            // Mark as initialized
            this.isInitialized = true;

            // Emit application ready event
            this.eventBus.emit('app:initialized');
            this.eventBus.emit('app:ready');

            console.log('✅ Modular Transcript Recorder initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            this.handleInitializationError(error);
        }
    }

    /**
     * Initialize core EventBus and StateStore systems
     */
    initializeCoreSystem() {
        console.log('🔧 Initializing core systems...');

        // Initialize EventBus
        this.eventBus = new EventBus();
        this.eventBus.setDebugMode(this.debugMode);

        // Initialize StateStore with EventBus
        this.stateStore = new StateStore({}, this.eventBus);
        this.stateStore.setDebugMode(this.debugMode);

        // Set up initial application state
        this.initializeApplicationState();

        console.log('✅ Core systems initialized');
    }

    /**
     * Initialize application state
     */
    initializeApplicationState() {
        this.stateStore.setState('app.initialized', false);
        this.stateStore.setState('app.ready', false);
        this.stateStore.setState('app.version', '2.0.0');
        this.stateStore.setState('app.moduleCount', this.moduleOrder.length);
    }

    /**
     * Load module configuration
     */
    loadModuleConfiguration() {
        if (typeof ModuleConfig === 'undefined') {
            throw new Error('ModuleConfig not loaded. Please ensure module-config.js is included.');
        }

        // Validate module configuration
        this.moduleOrder.forEach(moduleName => {
            if (!ModuleConfig.validateModuleConfig(moduleName)) {
                throw new Error(`Invalid configuration for module: ${moduleName}`);
            }
        });

        console.log('✅ Module configuration loaded and validated');
    }

    /**
     * Initialize all modules in dependency order
     */
    async initializeModules() {
        console.log('🔧 Initializing modules...');

        for (const moduleName of this.moduleOrder) {
            await this.initializeModule(moduleName);
        }

        console.log('✅ All modules initialized');
    }

    /**
     * Initialize a specific module
     */
    async initializeModule(moduleName) {
        try {
            console.log(`🔧 Initializing ${moduleName} module...`);

            // Get module configuration
            const moduleConfig = ModuleConfig.MODULE_DEFINITIONS[moduleName];
            if (!moduleConfig) {
                throw new Error(`Module configuration not found: ${moduleName}`);
            }

            // Get module class
            const ModuleClass = window[moduleConfig.className];
            if (!ModuleClass) {
                throw new Error(`Module class not found: ${moduleConfig.className}`);
            }

            // Create module instance
            const moduleInstance = new ModuleClass(
                this.eventBus,
                this.stateStore,
                moduleConfig.config || {}
            );

            // Set debug mode if enabled
            if (this.debugMode) {
                moduleInstance.setDebugMode(true);
            }

            // Initialize the module
            await moduleInstance.initialize();

            // Store module reference
            this.modules.set(moduleName, moduleInstance);

            console.log(`✅ ${moduleName} module initialized`);

        } catch (error) {
            console.error(`❌ Failed to initialize ${moduleName} module:`, error);
            throw error;
        }
    }

    /**
     * Set up global event handlers
     */
    setupGlobalEventHandlers() {
        // Handle application-level events
        this.eventBus.on('app:error', (data) => this.handleApplicationError(data));
        this.eventBus.on('app:exit_session_viewing_mode', () => this.handleExitSessionViewing());
        this.eventBus.on('app:validate_state_sync', (data) => this.handleStateSync(data));

        // Handle module lifecycle events
        this.eventBus.on('module:initialized', (data) => this.handleModuleInitialized(data));
        this.eventBus.on('module:destroyed', (data) => this.handleModuleDestroyed(data));
        this.eventBus.on('module:enabled', (data) => this.handleModuleEnabled(data));
        this.eventBus.on('module:disabled', (data) => this.handleModuleDisabled(data));

        // Handle state changes
        this.eventBus.on('state:changed', (data) => this.handleStateChange(data));

        console.log('✅ Global event handlers set up');
    }

    /**
     * Handle application error
     */
    handleApplicationError(data) {
        console.error('🚨 Application error:', data);

        // Show user notification
        this.eventBus.emit('ui:notification', {
            type: 'error',
            message: 'Application error: ' + (data.message || 'Unknown error')
        });
    }

    /**
     * Handle exit session viewing mode
     */
    handleExitSessionViewing() {
        // This is handled by the database module, but we can add global logic here if needed
        if (this.debugMode) {
            console.log('🔄 Exiting session viewing mode');
        }
    }

    /**
     * Handle state synchronization with server
     */
    handleStateSync(serverState) {
        if (this.debugMode) {
            console.log('🔄 Validating state sync:', serverState);
        }

        // The recording module handles the actual sync validation
        // This is just for global awareness
    }

    /**
     * Handle module initialized event
     */
    handleModuleInitialized(data) {
        if (this.debugMode) {
            console.log(`📦 Module initialized: ${data.module}`);
        }
    }

    /**
     * Handle module destroyed event
     */
    handleModuleDestroyed(data) {
        if (this.debugMode) {
            console.log(`📦 Module destroyed: ${data.module}`);
        }
    }

    /**
     * Handle module enabled event
     */
    handleModuleEnabled(data) {
        if (this.debugMode) {
            console.log(`📦 Module enabled: ${data.module}`);
        }
    }

    /**
     * Handle module disabled event
     */
    handleModuleDisabled(data) {
        if (this.debugMode) {
            console.log(`📦 Module disabled: ${data.module}`);
        }
    }

    /**
     * Handle state change event
     */
    handleStateChange(data) {
        if (this.debugMode) {
            console.log(`🏪 State changed: ${data.path}`, data.value);
        }
    }

    /**
     * Handle initialization error
     */
    handleInitializationError(error) {
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            font-family: monospace;
        `;
        errorDiv.innerHTML = `
            <h3>❌ Application Initialization Failed</h3>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Please check the browser console for more details.</strong></p>
            <button onclick="location.reload()" style="background: white; color: #ef4444; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
                Reload Page
            </button>
        `;
        document.body.appendChild(errorDiv);
    }

    /**
     * Enable debug mode for all systems
     */
    enableDebugMode() {
        this.debugMode = true;

        if (this.eventBus) {
            this.eventBus.setDebugMode(true);
        }

        if (this.stateStore) {
            this.stateStore.setDebugMode(true);
        }

        // Enable debug mode for all modules
        this.modules.forEach(module => {
            module.setDebugMode(true);
        });

        console.log('🐛 Debug mode enabled for all systems');
    }

    /**
     * Disable debug mode for all systems
     */
    disableDebugMode() {
        this.debugMode = false;

        if (this.eventBus) {
            this.eventBus.setDebugMode(false);
        }

        if (this.stateStore) {
            this.stateStore.setDebugMode(false);
        }

        // Disable debug mode for all modules
        this.modules.forEach(module => {
            module.setDebugMode(false);
        });

        console.log('🐛 Debug mode disabled for all systems');
    }

    /**
     * Get module by name
     */
    getModule(moduleName) {
        return this.modules.get(moduleName);
    }

    /**
     * Get all modules
     */
    getAllModules() {
        return Array.from(this.modules.values());
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            moduleCount: this.modules.size,
            debugMode: this.debugMode,
            modules: Array.from(this.modules.keys()),
            eventBusInfo: this.eventBus?.getDebugInfo(),
            stateStoreInfo: this.stateStore?.getDebugInfo()
        };
    }

    /**
     * Destroy the application and clean up all modules
     */
    async destroy() {
        console.log('🔄 Destroying application...');

        // Destroy modules in reverse order
        const reverseOrder = [...this.moduleOrder].reverse();

        for (const moduleName of reverseOrder) {
            const module = this.modules.get(moduleName);
            if (module) {
                try {
                    await module.destroy();
                    console.log(`✅ ${moduleName} module destroyed`);
                } catch (error) {
                    console.error(`❌ Error destroying ${moduleName} module:`, error);
                }
            }
        }

        // Clear modules
        this.modules.clear();

        // Clear event bus and state store
        if (this.eventBus) {
            this.eventBus.clear();
        }

        if (this.stateStore) {
            this.stateStore.reset();
        }

        this.isInitialized = false;

        console.log('✅ Application destroyed');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting Modular Transcript Recorder...');

    try {
        // Create and initialize the application
        window.transcriptRecorder = new ModularTranscriptRecorder();

        // Enable debug mode if URL parameter is present
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            window.transcriptRecorder.enableDebugMode();
        }

        // Initialize the application
        await window.transcriptRecorder.initialize();

        // Make modules accessible globally for debugging
        if (window.transcriptRecorder.debugMode) {
            window.modules = window.transcriptRecorder.getAllModules();
            window.eventBus = window.transcriptRecorder.eventBus;
            window.stateStore = window.transcriptRecorder.stateStore;
            console.log('🐛 Debug objects available: window.modules, window.eventBus, window.stateStore');
        }

    } catch (error) {
        console.error('❌ Failed to start application:', error);
    }
});
