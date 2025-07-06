/**
 * Event Bus System for Module Communication
 *
 * Provides a centralized event system for loose coupling between modules.
 * Supports event emission, subscription, and unsubscription.
 */
class EventBus {
    constructor() {
        this.events = new Map();
        this.debugMode = false;
    }

    /**
     * Enable or disable debug logging
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    /**
     * Subscribe to an event
     * @param {string} eventType - The event type to listen for
     * @param {Function} handler - The handler function to call
     * @param {Object} context - Optional context for the handler
     * @returns {Function} Unsubscribe function
     */
    on(eventType, handler, context = null) {
        if (typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }

        if (!this.events.has(eventType)) {
            this.events.set(eventType, []);
        }

        const subscription = {
            handler,
            context,
            id: this.generateSubscriptionId()
        };

        this.events.get(eventType).push(subscription);

        if (this.debugMode) {
            console.log(`📡 EventBus: Subscribed to '${eventType}' (ID: ${subscription.id})`);
        }

        // Return unsubscribe function
        return () => this.off(eventType, subscription.id);
    }

    /**
     * Subscribe to an event that will only fire once
     * @param {string} eventType - The event type to listen for
     * @param {Function} handler - The handler function to call
     * @param {Object} context - Optional context for the handler
     * @returns {Function} Unsubscribe function
     */
    once(eventType, handler, context = null) {
        const unsubscribe = this.on(eventType, (...args) => {
            unsubscribe();
            handler.apply(context, args);
        }, context);

        return unsubscribe;
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventType - The event type
     * @param {string} subscriptionId - The subscription ID to remove
     */
    off(eventType, subscriptionId) {
        if (!this.events.has(eventType)) {
            return;
        }

        const handlers = this.events.get(eventType);
        const index = handlers.findIndex(sub => sub.id === subscriptionId);

        if (index !== -1) {
            handlers.splice(index, 1);

            if (this.debugMode) {
                console.log(`📡 EventBus: Unsubscribed from '${eventType}' (ID: ${subscriptionId})`);
            }

            // Clean up empty event arrays
            if (handlers.length === 0) {
                this.events.delete(eventType);
            }
        }
    }

    /**
     * Remove all subscriptions for an event type
     * @param {string} eventType - The event type to clear
     */
    removeAllListeners(eventType) {
        if (this.events.has(eventType)) {
            this.events.delete(eventType);

            if (this.debugMode) {
                console.log(`📡 EventBus: Removed all listeners for '${eventType}'`);
            }
        }
    }

    /**
     * Emit an event to all subscribers
     * @param {string} eventType - The event type to emit
     * @param {*} data - The data to pass to handlers
     * @param {Object} options - Emission options
     */
    emit(eventType, data = null, options = {}) {
        const { async = false, timeout = 5000 } = options;

        if (this.debugMode) {
            console.log(`📡 EventBus: Emitting '${eventType}'`, data);
        }

        if (!this.events.has(eventType)) {
            if (this.debugMode) {
                console.log(`📡 EventBus: No listeners for '${eventType}'`);
            }
            return;
        }

        const handlers = [...this.events.get(eventType)]; // Copy to avoid modification during iteration

        if (async) {
            // Emit asynchronously
            setTimeout(() => {
                this.executeHandlers(eventType, handlers, data, timeout);
            }, 0);
        } else {
            // Emit synchronously
            this.executeHandlers(eventType, handlers, data, timeout);
        }
    }

    /**
     * Execute event handlers
     * @private
     */
    executeHandlers(eventType, handlers, data, timeout) {
        handlers.forEach(subscription => {
            try {
                const { handler, context } = subscription;

                if (timeout > 0) {
                    // Execute with timeout protection
                    const timeoutId = setTimeout(() => {
                        console.warn(`⚠️ EventBus: Handler for '${eventType}' timed out after ${timeout}ms`);
                    }, timeout);

                    const result = handler.call(context, data);

                    // Handle promises
                    if (result && typeof result.then === 'function') {
                        result
                            .then(() => clearTimeout(timeoutId))
                            .catch(error => {
                                clearTimeout(timeoutId);
                                console.error(`❌ EventBus: Async handler error for '${eventType}':`, error);
                            });
                    } else {
                        clearTimeout(timeoutId);
                    }
                } else {
                    // Execute without timeout
                    handler.call(context, data);
                }
            } catch (error) {
                console.error(`❌ EventBus: Handler error for '${eventType}':`, error);
            }
        });
    }

    /**
     * Generate a unique subscription ID
     * @private
     */
    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the number of listeners for an event type
     * @param {string} eventType - The event type
     * @returns {number} Number of listeners
     */
    listenerCount(eventType) {
        return this.events.has(eventType) ? this.events.get(eventType).length : 0;
    }

    /**
     * Get all event types that have listeners
     * @returns {string[]} Array of event types
     */
    eventTypes() {
        return Array.from(this.events.keys());
    }

    /**
     * Clear all event listeners
     */
    clear() {
        this.events.clear();

        if (this.debugMode) {
            console.log('📡 EventBus: Cleared all event listeners');
        }
    }

    /**
     * Get debug information about the event bus
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        const info = {
            totalEventTypes: this.events.size,
            totalSubscriptions: 0,
            eventTypes: {}
        };

        for (const [eventType, handlers] of this.events) {
            info.eventTypes[eventType] = handlers.length;
            info.totalSubscriptions += handlers.length;
        }

        return info;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
} else {
    window.EventBus = EventBus;
}
