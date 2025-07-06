/**
 * Base Module Class
 *
 * Provides a common interface and functionality for all application modules.
 * Handles event communication, state management, and lifecycle methods.
 */
class ModuleBase {
    constructor(name, eventBus, stateStore, config = {}) {
        if (!name) {
            throw new Error('Module name is required');
        }

        if (!eventBus) {
            throw new Error('EventBus instance is required');
        }

        if (!stateStore) {
            throw new Error('StateStore instance is required');
        }

        this.name = name;
        this.eventBus = eventBus;
        this.stateStore = stateStore;
        this.config = { ...this.getDefaultConfig(), ...config };

        this.isInitialized = false;
        this.isEnabled = true;
        this.subscriptions = [];
        this.stateSubscriptions = [];
        this.debugMode = false;

        // Bind methods to preserve context
        this.initialize = this.initialize.bind(this);
        this.destroy = this.destroy.bind(this);
        this.enable = this.enable.bind(this);
        this.disable = this.disable.bind(this);
    }

    /**
     * Get default configuration for the module
     * Override in subclasses to provide module-specific defaults
     * @returns {Object} Default configuration
     */
    getDefaultConfig() {
        return {};
    }

    /**
     * Initialize the module
     * This method should be called after construction
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn(`⚠️ Module '${this.name}' is already initialized`);
            return;
        }

        try {
            if (this.debugMode) {
                console.log(`🔧 Initializing module: ${this.name}`);
            }

            // Initialize module state
            await this.initializeState();

            // Set up event listeners
            this.setupEventListeners();

            // Set up state subscriptions
            this.setupStateSubscriptions();

            // Perform module-specific initialization
            await this.onInitialize();

            this.isInitialized = true;

            // Emit initialization complete event
            this.emit('module:initialized', { module: this.name });

            if (this.debugMode) {
                console.log(`✅ Module '${this.name}' initialized successfully`);
            }
        } catch (error) {
            console.error(`❌ Failed to initialize module '${this.name}':`, error);
            throw error;
        }
    }

    /**
     * Initialize module state
     * Override in subclasses to set up initial state
     */
    async initializeState() {
        // Default implementation - override in subclasses
        const initialState = this.getInitialState();
        if (initialState && Object.keys(initialState).length > 0) {
            for (const [path, value] of Object.entries(initialState)) {
                this.setState(`${this.name}.${path}`, value, { notify: false });
            }
        }
    }

    /**
     * Get initial state for the module
     * Override in subclasses to provide initial state
     * @returns {Object} Initial state object
     */
    getInitialState() {
        return {};
    }

    /**
     * Set up event listeners
     * Override in subclasses to add module-specific event listeners
     */
    setupEventListeners() {
        // Default implementation - override in subclasses
    }

    /**
     * Set up state subscriptions
     * Override in subclasses to add module-specific state subscriptions
     */
    setupStateSubscriptions() {
        // Default implementation - override in subclasses
    }

    /**
     * Module-specific initialization logic
     * Override in subclasses for custom initialization
     */
    async onInitialize() {
        // Default implementation - override in subclasses
    }

    /**
     * Destroy the module and clean up resources
     */
    async destroy() {
        if (!this.isInitialized) {
            return;
        }

        try {
            if (this.debugMode) {
                console.log(`🔧 Destroying module: ${this.name}`);
            }

            // Perform module-specific cleanup
            await this.onDestroy();

            // Clean up event subscriptions
            this.subscriptions.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this.subscriptions = [];

            // Clean up state subscriptions
            this.stateSubscriptions.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this.stateSubscriptions = [];

            this.isInitialized = false;

            // Emit destruction complete event
            this.emit('module:destroyed', { module: this.name });

            if (this.debugMode) {
                console.log(`✅ Module '${this.name}' destroyed successfully`);
            }
        } catch (error) {
            console.error(`❌ Failed to destroy module '${this.name}':`, error);
            throw error;
        }
    }

    /**
     * Module-specific cleanup logic
     * Override in subclasses for custom cleanup
     */
    async onDestroy() {
        // Default implementation - override in subclasses
    }

    /**
     * Enable the module
     */
    enable() {
        if (this.isEnabled) {
            return;
        }

        this.isEnabled = true;
        this.onEnable();
        this.emit('module:enabled', { module: this.name });

        if (this.debugMode) {
            console.log(`✅ Module '${this.name}' enabled`);
        }
    }

    /**
     * Disable the module
     */
    disable() {
        if (!this.isEnabled) {
            return;
        }

        this.isEnabled = false;
        this.onDisable();
        this.emit('module:disabled', { module: this.name });

        if (this.debugMode) {
            console.log(`⏸️ Module '${this.name}' disabled`);
        }
    }

    /**
     * Module-specific enable logic
     * Override in subclasses for custom enable behavior
     */
    onEnable() {
        // Default implementation - override in subclasses
    }

    /**
     * Module-specific disable logic
     * Override in subclasses for custom disable behavior
     */
    onDisable() {
        // Default implementation - override in subclasses
    }

    /**
     * Emit an event through the event bus
     * @param {string} eventType - The event type
     * @param {*} data - The event data
     * @param {Object} options - Emission options
     */
    emit(eventType, data = null, options = {}) {
        if (!this.isEnabled) {
            if (this.debugMode) {
                console.log(`⏸️ Module '${this.name}' is disabled, skipping event emission: ${eventType}`);
            }
            return;
        }

        this.eventBus.emit(eventType, data, options);
    }

    /**
     * Subscribe to an event
     * @param {string} eventType - The event type
     * @param {Function} handler - The event handler
     * @param {Object} context - Optional context for the handler
     * @returns {Function} Unsubscribe function
     */
    on(eventType, handler, context = null) {
        const unsubscribe = this.eventBus.on(eventType, handler, context || this);
        this.subscriptions.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Subscribe to an event that will only fire once
     * @param {string} eventType - The event type
     * @param {Function} handler - The event handler
     * @param {Object} context - Optional context for the handler
     * @returns {Function} Unsubscribe function
     */
    once(eventType, handler, context = null) {
        const unsubscribe = this.eventBus.once(eventType, handler, context || this);
        this.subscriptions.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Get state from the state store
     * @param {string} path - Optional path to specific state
     * @returns {*} The state value
     */
    getState(path = null) {
        const fullPath = path ? `${this.name}.${path}` : this.name;
        return this.stateStore.getState(fullPath);
    }

    /**
     * Get global state (not scoped to this module)
     * @param {string} path - Path to global state
     * @returns {*} The state value
     */
    getGlobalState(path = null) {
        return this.stateStore.getState(path);
    }

    /**
     * Set state in the state store
     * @param {string} path - Path to set (will be scoped to module)
     * @param {*} value - The value to set
     * @param {Object} options - Update options
     */
    setState(path, value, options = {}) {
        const fullPath = `${this.name}.${path}`;
        this.stateStore.setState(fullPath, value, options);
    }

    /**
     * Set global state (not scoped to this module)
     * @param {string} path - Path to set
     * @param {*} value - The value to set
     * @param {Object} options - Update options
     */
    setGlobalState(path, value, options = {}) {
        this.stateStore.setState(path, value, options);
    }

    /**
     * Subscribe to state changes
     * @param {string} path - Path to watch (will be scoped to module)
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {Function} Unsubscribe function
     */
    subscribeToState(path, callback, options = {}) {
        const fullPath = `${this.name}.${path}`;
        const unsubscribe = this.stateStore.subscribe(fullPath, callback, options);
        this.stateSubscriptions.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Subscribe to global state changes
     * @param {string} path - Path to watch
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {Function} Unsubscribe function
     */
    subscribeToGlobalState(path, callback, options = {}) {
        const unsubscribe = this.stateStore.subscribe(path, callback, options);
        this.stateSubscriptions.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    /**
     * Get module status information
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            name: this.name,
            isInitialized: this.isInitialized,
            isEnabled: this.isEnabled,
            subscriptionCount: this.subscriptions.length,
            stateSubscriptionCount: this.stateSubscriptions.length,
            config: this.config
        };
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModuleBase;
} else {
    window.ModuleBase = ModuleBase;
}
