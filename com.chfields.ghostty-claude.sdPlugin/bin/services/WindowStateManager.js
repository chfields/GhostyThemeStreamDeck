"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowStateManager = void 0;
const ThemePickerClient_1 = require("./ThemePickerClient");
// Priority order for sorting windows (higher = more important = shown first)
const STATE_PRIORITY = {
    waiting: 4, // Needs input - highest priority
    notRunning: 3, // Available for new work
    working: 2, // Claude processing - busy
    running: 1, // Claude detected but state unknown
};
class WindowStateManager {
    constructor() {
        this.pollInterval = null;
        this.lastWindowsJson = '';
        this.listeners = new Set();
        this.currentWindows = [];
        this.isPolling = false;
        this.client = new ThemePickerClient_1.ThemePickerClient();
    }
    /**
     * Start polling for window state changes
     */
    start(intervalMs = 1000) {
        if (this.pollInterval) {
            return; // Already polling
        }
        this.isPolling = true;
        // Initial poll
        this.poll();
        // Start periodic polling
        this.pollInterval = setInterval(() => {
            this.poll();
        }, intervalMs);
    }
    /**
     * Stop polling
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isPolling = false;
    }
    /**
     * Add a listener for state changes
     */
    addListener(listener) {
        this.listeners.add(listener);
    }
    /**
     * Remove a listener
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    /**
     * Get current windows sorted by priority
     */
    getWindows() {
        return this.sortWindowsByPriority([...this.currentWindows]);
    }
    /**
     * Get a specific window by ID
     */
    getWindow(windowId) {
        return this.currentWindows.find(w => w.id === windowId);
    }
    /**
     * Focus a window
     */
    async focusWindow(windowId) {
        await this.client.focusWindow(windowId);
    }
    /**
     * Check if API is available
     */
    async isAvailable() {
        return this.client.isAvailable();
    }
    /**
     * Sort windows by Claude state priority
     * Priority: waiting > notRunning > working > running
     */
    sortWindowsByPriority(windows) {
        return windows.sort((a, b) => {
            const priorityA = STATE_PRIORITY[a.claudeState];
            const priorityB = STATE_PRIORITY[b.claudeState];
            return priorityB - priorityA; // Higher priority first
        });
    }
    /**
     * Poll the API for window updates
     */
    async poll() {
        try {
            const windows = await this.client.getWindows();
            const sortedWindows = this.sortWindowsByPriority(windows);
            const windowsJson = JSON.stringify(sortedWindows);
            // Check if windows have changed
            const hasChanges = windowsJson !== this.lastWindowsJson;
            if (hasChanges) {
                this.lastWindowsJson = windowsJson;
                this.currentWindows = sortedWindows;
                // Notify listeners
                const change = {
                    windows: sortedWindows,
                    hasChanges: true,
                };
                for (const listener of this.listeners) {
                    try {
                        listener(change);
                    }
                    catch (err) {
                        console.error('Error in state change listener:', err);
                    }
                }
            }
        }
        catch (err) {
            // API not available - clear windows and notify
            if (this.currentWindows.length > 0) {
                this.currentWindows = [];
                this.lastWindowsJson = '';
                const change = {
                    windows: [],
                    hasChanges: true,
                };
                for (const listener of this.listeners) {
                    try {
                        listener(change);
                    }
                    catch (listenerErr) {
                        console.error('Error in state change listener:', listenerErr);
                    }
                }
            }
        }
    }
}
exports.WindowStateManager = WindowStateManager;
//# sourceMappingURL=WindowStateManager.js.map