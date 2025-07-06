/**
 * Utils Module
 *
 * Provides utility functions for mobile detection, keyboard shortcuts,
 * clipboard operations, time formatting, and other helper functions.
 */
class UtilsModule extends ModuleBase {
    constructor(eventBus, stateStore, config = {}) {
        super('utils', eventBus, stateStore, config);

        this.keyboardListeners = [];
        this.mobileType = null;
    }

    /**
     * Get default configuration for the utils module
     */
    getDefaultConfig() {
        return {
            enableKeyboardShortcuts: true,
            enableMobileDetection: true,
            enableClipboardAPI: true,
            combineTimeoutMs: 3000
        };
    }

    /**
     * Initialize the utils module
     */
    async onInitialize() {
        // Detect mobile device
        if (this.config.enableMobileDetection) {
            this.mobileType = this.detectMobile();
            this.setState('isMobile', this.mobileType);
            this.setState('mobileType', this.mobileType);

            if (this.mobileType) {
                this.checkMobileCompatibility();
            }
        }

        // Set up keyboard shortcuts
        if (this.config.enableKeyboardShortcuts) {
            this.setupKeyboardShortcuts();
        }

        if (this.debugMode) {
            console.log('🔧 Utils module initialized', {
                mobile: this.mobileType,
                keyboardShortcuts: this.config.enableKeyboardShortcuts,
                clipboardAPI: this.config.enableClipboardAPI
            });
        }
    }

    /**
     * Clean up utils module
     */
    async onDestroy() {
        this.removeKeyboardListeners();
    }

    /**
     * Detect mobile device type
     * @returns {string|boolean} Mobile type or false if not mobile
     */
    detectMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;

        // Check for mobile devices
        if (/android/i.test(userAgent)) {
            return 'android';
        }

        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            return 'ios';
        }

        // Check for mobile-like screen sizes
        if (window.innerWidth <= 768) {
            return 'mobile';
        }

        return false;
    }

    /**
     * Check mobile compatibility and show warnings
     */
    checkMobileCompatibility() {
        if (!this.mobileType) return;

        console.warn('📱 Mobile device detected:', this.mobileType);

        // Check HTTPS requirement
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            this.emit('ui:notification', {
                type: 'error',
                message: 'HTTPS is required for microphone access on mobile devices. ' +
                        'Please use HTTPS or access via localhost for testing.'
            });
        }

        // Check for getUserMedia support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.emit('ui:notification', {
                type: 'error',
                message: 'Your mobile browser does not support microphone access. ' +
                        'Please try a different browser or update your current browser.'
            });
        }

        // Show mobile-specific warning
        this.showMobileWarning();
    }

    /**
     * Show mobile warning message
     */
    showMobileWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'mobile-warning';
        warningDiv.innerHTML = `
            <div style="background: #ff9500; color: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>📱 Mobile Device Detected</strong><br>
                <small>
                    • Microphone access may require user interaction<br>
                    • whisper.cpp streaming is not available on mobile<br>
                    • Some features may be limited<br>
                    • For best experience, use a desktop browser
                </small>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="float: right; background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
            </div>
        `;

        // Insert at the top of the page
        const container = document.querySelector('.container') || document.body;
        container.insertBefore(warningDiv, container.firstChild);
    }

    /**
     * Set up keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        const keyboardHandler = (event) => {
            // Only trigger if not in an input field
            if (document.activeElement.tagName !== 'INPUT' &&
                document.activeElement.tagName !== 'TEXTAREA' &&
                document.activeElement.tagName !== 'SELECT') {

                this.handleKeyboardShortcut(event);
            }
        };

        document.addEventListener('keydown', keyboardHandler);
        this.keyboardListeners.push(() => {
            document.removeEventListener('keydown', keyboardHandler);
        });
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyboardShortcut(event) {
        // Enter key to trigger LLM processing
        if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            this.emit('llm:manual_process_requested');
            return;
        }

        // Spacebar to pause/resume recording
        if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            this.emit('recording:toggle_pause_resume');
            return;
        }

        // Ctrl+B to bookmark current session
        if (event.key === 'b' && event.ctrlKey && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            this.emit('database:toggle_bookmark');
            return;
        }

        // Ctrl+C to copy transcripts (when not in input field)
        if (event.key === 'c' && event.ctrlKey && !event.altKey && !event.shiftKey) {
            // Let the browser handle this, but emit event for modules to know
            this.emit('utils:copy_requested');
            return;
        }
    }

    /**
     * Remove keyboard listeners
     */
    removeKeyboardListeners() {
        this.keyboardListeners.forEach(removeListener => {
            if (typeof removeListener === 'function') {
                removeListener();
            }
        });
        this.keyboardListeners = [];
    }

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard(text) {
        if (!this.config.enableClipboardAPI) {
            console.warn('Clipboard API is disabled');
            return false;
        }

        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);

            // Fallback method
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                const result = document.execCommand('copy');
                document.body.removeChild(textArea);
                return result;
            } catch (fallbackError) {
                console.error('Fallback copy method also failed:', fallbackError);
                return false;
            }
        }
    }

    /**
     * Format time duration
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted time string (MM:SS)
     */
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Format timestamp for display
     * @param {Date|string} timestamp - Timestamp to format
     * @returns {string} Formatted timestamp
     */
    formatTimestamp(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toLocaleTimeString();
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date
     */
    formatDate(date) {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleString();
    }

    /**
     * Calculate duration between two timestamps
     * @param {Date|string} start - Start timestamp
     * @param {Date|string} end - End timestamp
     * @returns {number} Duration in minutes
     */
    calculateDuration(start, end) {
        const startDate = start instanceof Date ? start : new Date(start);
        const endDate = end instanceof Date ? end : new Date(end);
        return Math.round((endDate - startDate) / 1000 / 60); // minutes
    }

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Validate data against a schema
     * @param {*} data - Data to validate
     * @param {Object} schema - Validation schema
     * @returns {boolean} Validation result
     */
    validateData(data, schema) {
        // Simple validation - can be extended
        if (schema.required && (data === null || data === undefined)) {
            return false;
        }

        if (schema.type && typeof data !== schema.type) {
            return false;
        }

        if (schema.minLength && data.length < schema.minLength) {
            return false;
        }

        if (schema.maxLength && data.length > schema.maxLength) {
            return false;
        }

        return true;
    }

    /**
     * Generate a unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if device is mobile
     * @returns {boolean} True if mobile
     */
    isMobile() {
        return !!this.mobileType;
    }

    /**
     * Get mobile type
     * @returns {string|boolean} Mobile type or false
     */
    getMobileType() {
        return this.mobileType;
    }

    /**
     * Escape HTML characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UtilsModule;
} else {
    window.UtilsModule = UtilsModule;
}
