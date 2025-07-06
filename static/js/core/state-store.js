/**
 * State Store System for Centralized State Management
 *
 * Provides a centralized state management system with subscription capabilities.
 * Supports nested state updates, validation, and change notifications.
 */
class StateStore {
    constructor(initialState = {}, eventBus = null) {
        this.state = this.deepClone(initialState);
        this.eventBus = eventBus;
        this.subscriptions = new Map();
        this.validators = new Map();
        this.debugMode = false;
        this.history = [];
        this.maxHistorySize = 50;
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    /**
     * Get the current state or a specific path
     * @param {string} path - Optional dot-notation path to specific state
     * @returns {*} The state value
     */
    getState(path = null) {
        if (path === null) {
            return this.deepClone(this.state);
        }

        return this.getNestedValue(this.state, path);
    }

    /**
     * Set state at a specific path
     * @param {string} path - Dot-notation path to set
     * @param {*} value - The value to set
     * @param {Object} options - Update options
     */
    setState(path, value, options = {}) {
        const { validate = true, notify = true, merge = false } = options;

        // Validate the update if validator exists
        if (validate && this.validators.has(path)) {
            const validator = this.validators.get(path);
            const isValid = validator(value, this.getState(path));

            if (!isValid) {
                throw new Error(`State validation failed for path: ${path}`);
            }
        }

        // Store previous state for history
        const previousState = this.deepClone(this.state);
        const previousValue = this.getNestedValue(this.state, path);

        // Update the state
        if (merge && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const currentValue = this.getNestedValue(this.state, path) || {};
            this.setNestedValue(this.state, path, { ...currentValue, ...value });
        } else {
            this.setNestedValue(this.state, path, value);
        }

        // Add to history
        this.addToHistory(path, previousValue, value);

        if (this.debugMode) {
            console.log(`🏪 StateStore: Updated '${path}'`, { from: previousValue, to: value });
        }

        // Notify subscribers if enabled
        if (notify) {
            this.notifySubscribers(path, value, previousValue);

            // Emit global state change event if event bus is available
            if (this.eventBus) {
                this.eventBus.emit('state:changed', {
                    path,
                    value,
                    previousValue,
                    state: this.getState()
                });
            }
        }
    }

    /**
     * Subscribe to state changes at a specific path
     * @param {string} path - Dot-notation path to watch
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback, options = {}) {
        const { immediate = false, deep = false } = options;

        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (!this.subscriptions.has(path)) {
            this.subscriptions.set(path, []);
        }

        const subscription = {
            callback,
            deep,
            id: this.generateSubscriptionId()
        };

        this.subscriptions.get(path).push(subscription);

        if (this.debugMode) {
            console.log(`🏪 StateStore: Subscribed to '${path}' (ID: ${subscription.id})`);
        }

        // Call immediately with current value if requested
        if (immediate) {
            const currentValue = this.getState(path);
            callback(currentValue, undefined, path);
        }

        // Return unsubscribe function
        return () => this.unsubscribe(path, subscription.id);
    }

    /**
     * Unsubscribe from state changes
     * @param {string} path - The path to unsubscribe from
     * @param {string} subscriptionId - The subscription ID
     */
    unsubscribe(path, subscriptionId) {
        if (!this.subscriptions.has(path)) {
            return;
        }

        const callbacks = this.subscriptions.get(path);
        const index = callbacks.findIndex(sub => sub.id === subscriptionId);

        if (index !== -1) {
            callbacks.splice(index, 1);

            if (this.debugMode) {
                console.log(`🏪 StateStore: Unsubscribed from '${path}' (ID: ${subscriptionId})`);
            }

            // Clean up empty subscription arrays
            if (callbacks.length === 0) {
                this.subscriptions.delete(path);
            }
        }
    }

    /**
     * Add a validator for a specific path
     * @param {string} path - Dot-notation path
     * @param {Function} validator - Validator function
     */
    addValidator(path, validator) {
        if (typeof validator !== 'function') {
            throw new Error('Validator must be a function');
        }

        this.validators.set(path, validator);

        if (this.debugMode) {
            console.log(`🏪 StateStore: Added validator for '${path}'`);
        }
    }

    /**
     * Remove a validator for a specific path
     * @param {string} path - Dot-notation path
     */
    removeValidator(path) {
        this.validators.delete(path);

        if (this.debugMode) {
            console.log(`🏪 StateStore: Removed validator for '${path}'`);
        }
    }

    /**
     * Notify subscribers of state changes
     * @private
     */
    notifySubscribers(path, newValue, oldValue) {
        // Notify exact path subscribers
        if (this.subscriptions.has(path)) {
            this.subscriptions.get(path).forEach(subscription => {
                try {
                    subscription.callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`❌ StateStore: Subscriber error for '${path}':`, error);
                }
            });
        }

        // Notify deep subscribers (watching parent paths)
        for (const [subscribedPath, subscriptions] of this.subscriptions) {
            if (subscribedPath !== path && path.startsWith(subscribedPath + '.')) {
                subscriptions.forEach(subscription => {
                    if (subscription.deep) {
                        try {
                            subscription.callback(newValue, oldValue, path);
                        } catch (error) {
                            console.error(`❌ StateStore: Deep subscriber error for '${subscribedPath}':`, error);
                        }
                    }
                });
            }
        }
    }

    /**
     * Get nested value using dot notation
     * @private
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Set nested value using dot notation
     * @private
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();

        const target = keys.reduce((current, key) => {
            if (current[key] === undefined || current[key] === null) {
                current[key] = {};
            }
            return current[key];
        }, obj);

        target[lastKey] = value;
    }

    /**
     * Deep clone an object
     * @private
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepClone(item));
        }

        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }

        return cloned;
    }

    /**
     * Generate a unique subscription ID
     * @private
     */
    generateSubscriptionId() {
        return `state_sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add state change to history
     * @private
     */
    addToHistory(path, oldValue, newValue) {
        this.history.push({
            timestamp: Date.now(),
            path,
            oldValue: this.deepClone(oldValue),
            newValue: this.deepClone(newValue)
        });

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * Get state change history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} History entries
     */
    getHistory(limit = null) {
        const history = [...this.history];
        return limit ? history.slice(-limit) : history;
    }

    /**
     * Clear state change history
     */
    clearHistory() {
        this.history = [];

        if (this.debugMode) {
            console.log('🏪 StateStore: Cleared history');
        }
    }

    /**
     * Reset state to initial values
     * @param {Object} newInitialState - Optional new initial state
     */
    reset(newInitialState = {}) {
        const oldState = this.deepClone(this.state);
        this.state = this.deepClone(newInitialState);

        if (this.debugMode) {
            console.log('🏪 StateStore: State reset');
        }

        // Notify all subscribers of the reset
        for (const [path, subscriptions] of this.subscriptions) {
            const newValue = this.getState(path);
            const oldValue = this.getNestedValue(oldState, path);

            subscriptions.forEach(subscription => {
                try {
                    subscription.callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`❌ StateStore: Reset notification error for '${path}':`, error);
                }
            });
        }

        // Emit reset event
        if (this.eventBus) {
            this.eventBus.emit('state:reset', {
                oldState,
                newState: this.getState()
            });
        }
    }

    /**
     * Get debug information about the state store
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        return {
            stateKeys: Object.keys(this.state),
            subscriptionPaths: Array.from(this.subscriptions.keys()),
            validatorPaths: Array.from(this.validators.keys()),
            historySize: this.history.length,
            totalSubscriptions: Array.from(this.subscriptions.values())
                .reduce((total, subs) => total + subs.length, 0)
        };
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateStore;
} else {
    window.StateStore = StateStore;
}
