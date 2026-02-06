"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhosttyWindowAction = void 0;
const streamdeck_1 = require("@elgato/streamdeck");
const WindowStateManager_1 = require("../services/WindowStateManager");
// Map of action ID to assigned window index
const buttonAssignments = new Map();
// Track all active actions in order of appearance
const activeActions = [];
// Shared state manager instance
let stateManager = null;
// Images for each state
const STATE_IMAGES = {
    waiting: 'images/waiting',
    working: 'images/working',
    running: 'images/running',
    notRunning: 'images/not-running',
};
let GhosttyWindowAction = (() => {
    let _classDecorators = [(0, streamdeck_1.action)({ UUID: 'com.chfields.ghostty-claude.window' })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = streamdeck_1.SingletonAction;
    var GhosttyWindowAction = _classThis = class extends _classSuper {
        /**
         * Called when a button appears on the Stream Deck
         */
        async onWillAppear(ev) {
            const actionInstance = ev.action;
            const actionId = actionInstance.id;
            // Add to active actions if not already present
            if (!activeActions.find(a => a.id === actionId)) {
                activeActions.push(actionInstance);
            }
            // Initialize state manager on first button
            if (!stateManager) {
                stateManager = new WindowStateManager_1.WindowStateManager();
                // Listen for state changes
                stateManager.addListener((change) => {
                    this.updateAllButtons(change.windows);
                });
                // Start polling
                stateManager.start(1000);
            }
            // Assign this button to a window slot based on its position
            const buttonIndex = activeActions.findIndex(a => a.id === actionId);
            buttonAssignments.set(actionId, buttonIndex);
            // Update this button with current state
            const windows = stateManager.getWindows();
            await this.updateButton(actionInstance, buttonIndex, windows);
        }
        /**
         * Called when a button disappears from the Stream Deck
         */
        async onWillDisappear(ev) {
            const actionId = ev.action.id;
            // Remove from tracking
            const index = activeActions.findIndex(a => a.id === actionId);
            if (index !== -1) {
                activeActions.splice(index, 1);
            }
            buttonAssignments.delete(actionId);
            // Stop state manager if no buttons left
            if (activeActions.length === 0 && stateManager) {
                stateManager.stop();
                stateManager = null;
            }
        }
        /**
         * Called when a button is pressed
         */
        async onKeyDown(ev) {
            const actionInstance = ev.action;
            const actionId = actionInstance.id;
            const buttonIndex = buttonAssignments.get(actionId);
            if (buttonIndex === undefined || !stateManager) {
                return;
            }
            const windows = stateManager.getWindows();
            if (buttonIndex < windows.length) {
                const window = windows[buttonIndex];
                try {
                    await stateManager.focusWindow(window.id);
                    // Brief visual feedback - flash the title
                    await actionInstance.setTitle('...');
                    setTimeout(async () => {
                        if (stateManager) {
                            await this.updateButton(actionInstance, buttonIndex, stateManager.getWindows());
                        }
                    }, 200);
                }
                catch (err) {
                    console.error('Failed to focus window:', err);
                    await actionInstance.showAlert();
                }
            }
        }
        /**
         * Update all buttons with current window state
         */
        async updateAllButtons(windows) {
            for (const actionInstance of activeActions) {
                const buttonIndex = buttonAssignments.get(actionInstance.id);
                if (buttonIndex !== undefined) {
                    await this.updateButton(actionInstance, buttonIndex, windows);
                }
            }
        }
        /**
         * Update a single button's display
         */
        async updateButton(actionInstance, buttonIndex, windows) {
            if (buttonIndex >= windows.length) {
                // No window for this button - show empty state
                await actionInstance.setTitle('');
                await actionInstance.setImage(STATE_IMAGES.notRunning);
                return;
            }
            const window = windows[buttonIndex];
            // Set title to display name, formatted for multiple lines
            const displayName = window.displayName || window.title;
            const formattedTitle = this.formatTitle(displayName);
            await actionInstance.setTitle(formattedTitle);
            // Set image based on Claude state
            const imageKey = window.claudeState === 'notRunning' ? 'notRunning' : window.claudeState;
            await actionInstance.setImage(STATE_IMAGES[imageKey] || STATE_IMAGES.notRunning);
        }
        /**
         * Format title for multi-line display on button
         */
        formatTitle(title) {
            // If short enough, return as-is
            if (title.length <= 10) {
                return title;
            }
            // Try to split at hyphen or space near middle
            const midpoint = Math.floor(title.length / 2);
            // Look for hyphen or space to split at
            let splitIndex = -1;
            // Search outward from midpoint for a good split point
            for (let i = 0; i <= midpoint; i++) {
                if (midpoint + i < title.length && (title[midpoint + i] === '-' || title[midpoint + i] === ' ')) {
                    splitIndex = midpoint + i;
                    break;
                }
                if (midpoint - i >= 0 && (title[midpoint - i] === '-' || title[midpoint - i] === ' ')) {
                    splitIndex = midpoint - i;
                    break;
                }
            }
            if (splitIndex > 0 && splitIndex < title.length - 1) {
                const char = title[splitIndex];
                if (char === '-') {
                    // Keep hyphen on first line
                    return title.substring(0, splitIndex + 1) + '\n' + title.substring(splitIndex + 1);
                }
                else {
                    // Space - don't include it
                    return title.substring(0, splitIndex) + '\n' + title.substring(splitIndex + 1);
                }
            }
            // No good split point - just split at midpoint
            return title.substring(0, midpoint) + '\n' + title.substring(midpoint);
        }
    };
    __setFunctionName(_classThis, "GhosttyWindowAction");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GhosttyWindowAction = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GhosttyWindowAction = _classThis;
})();
exports.GhosttyWindowAction = GhosttyWindowAction;
//# sourceMappingURL=GhosttyWindowAction.js.map