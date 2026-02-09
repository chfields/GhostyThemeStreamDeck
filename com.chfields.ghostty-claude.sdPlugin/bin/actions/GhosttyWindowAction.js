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
// Track all active actions
const activeActions = new Map();
// Track used indices to find lowest available
const usedIndices = new Set();
// Shared state manager instance
let stateManager = null;
// Images for each state
const STATE_IMAGES = {
    asking: 'images/asking',
    waiting: 'images/waiting',
    working: 'images/working',
    running: 'images/running',
    notRunning: 'images/not-running',
    launchRandom: 'images/launch-random',
    workstream: 'images/workstream',
    search: 'images/search',
};
// --- Workstream mode state ---
let workstreamModeActive = false;
let cachedWorkstreams = [];
let workstreamModeTimeout = null;
// Maps action ID -> assigned workstream or 'search' sentinel
const workstreamAssignments = new Map();
// Maps action ID -> keyDown timestamp for long-press detection
const keyDownTimestamps = new Map();
const LONG_PRESS_MS = 500;
const WORKSTREAM_MODE_TIMEOUT_MS = 10000;
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
            // Track this action
            activeActions.set(actionId, actionInstance);
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
            // Use physical position for consistent ordering across restarts
            let buttonIndex;
            const payload = ev.payload;
            const coords = payload.coordinates;
            if (coords) {
                // Calculate index from position: row * columns + column
                // Standard Stream Deck has 5 columns, XL has 8, Mini has 3
                const columns = 5;
                buttonIndex = coords.row * columns + coords.column;
            }
            else {
                // Fallback: find lowest available index
                buttonIndex = 0;
                while (usedIndices.has(buttonIndex)) {
                    buttonIndex++;
                }
            }
            usedIndices.add(buttonIndex);
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
            // Release the index
            const buttonIndex = buttonAssignments.get(actionId);
            if (buttonIndex !== undefined) {
                usedIndices.delete(buttonIndex);
            }
            // Remove from tracking
            activeActions.delete(actionId);
            buttonAssignments.delete(actionId);
            keyDownTimestamps.delete(actionId);
            workstreamAssignments.delete(actionId);
            // Stop state manager if no buttons left
            if (activeActions.size === 0 && stateManager) {
                stateManager.stop();
                stateManager = null;
            }
        }
        /**
         * Called when a button is pressed down
         */
        async onKeyDown(ev) {
            const actionInstance = ev.action;
            const actionId = actionInstance.id;
            const buttonIndex = buttonAssignments.get(actionId);
            if (buttonIndex === undefined || !stateManager) {
                return;
            }
            if (workstreamModeActive) {
                // In workstream mode: just record timestamp (action on key up)
                keyDownTimestamps.set(actionId, Date.now());
                return;
            }
            const windows = stateManager.getWindows();
            if (buttonIndex < windows.length) {
                // Assigned window button: focus immediately for responsive feel
                const window = windows[buttonIndex];
                try {
                    await stateManager.focusWindow(window.id);
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
            else {
                // Dice button: record timestamp, defer action to onKeyUp for long-press detection
                keyDownTimestamps.set(actionId, Date.now());
            }
        }
        /**
         * Called when a button is released
         */
        async onKeyUp(ev) {
            const actionInstance = ev.action;
            const actionId = actionInstance.id;
            const buttonIndex = buttonAssignments.get(actionId);
            const downTimestamp = keyDownTimestamps.get(actionId);
            keyDownTimestamps.delete(actionId);
            if (buttonIndex === undefined || !stateManager) {
                return;
            }
            if (workstreamModeActive) {
                // In workstream mode: execute the assignment
                const assignment = workstreamAssignments.get(actionId);
                if (assignment === 'search') {
                    // Search button: open Quick Launch panel
                    try {
                        await stateManager.openQuickLaunch();
                    }
                    catch (err) {
                        console.error('Failed to open Quick Launch:', err);
                    }
                    this.exitWorkstreamMode();
                }
                else if (assignment) {
                    // Workstream button: launch the workstream
                    try {
                        await actionInstance.setTitle('...');
                        await stateManager.launchWorkstream(assignment.id);
                    }
                    catch (err) {
                        console.error('Failed to launch workstream:', err);
                        await actionInstance.showAlert();
                    }
                    this.exitWorkstreamMode();
                }
                else {
                    // Window button pressed during workstream mode: exit mode
                    this.exitWorkstreamMode();
                }
                return;
            }
            // Normal mode: only dice buttons reach onKeyUp (window buttons acted on keyDown)
            if (!downTimestamp) {
                return;
            }
            const windows = stateManager.getWindows();
            if (buttonIndex < windows.length) {
                // Window button — already handled in onKeyDown
                return;
            }
            const pressDuration = Date.now() - downTimestamp;
            if (pressDuration >= LONG_PRESS_MS) {
                // Long press on dice button: enter workstream mode
                await this.enterWorkstreamMode();
            }
            else {
                // Short press on dice button: launch random
                try {
                    await actionInstance.setTitle('...');
                    await stateManager.launchRandom();
                    setTimeout(async () => {
                        if (stateManager) {
                            await this.updateButton(actionInstance, buttonIndex, stateManager.getWindows());
                        }
                    }, 500);
                }
                catch (err) {
                    console.error('Failed to launch random:', err);
                    await actionInstance.showAlert();
                }
            }
        }
        /**
         * Enter workstream mode: fetch workstreams and assign to dice buttons
         */
        async enterWorkstreamMode() {
            if (!stateManager)
                return;
            try {
                const allWorkstreams = await stateManager.getWorkstreams();
                // Exclude workstreams that are already open
                const openWorkstreamNames = new Set(stateManager.getWindows()
                    .map(w => w.workstreamName)
                    .filter((name) => name != null));
                cachedWorkstreams = allWorkstreams.filter(ws => !openWorkstreamNames.has(ws.name));
            }
            catch (err) {
                console.error('Failed to fetch workstreams:', err);
                return;
            }
            // 0 available workstreams: open Quick Launch directly instead
            if (cachedWorkstreams.length === 0) {
                try {
                    await stateManager.openQuickLaunch();
                }
                catch (err) {
                    console.error('Failed to open Quick Launch:', err);
                }
                return;
            }
            workstreamModeActive = true;
            workstreamAssignments.clear();
            // Find dice buttons (those beyond window count)
            const windows = stateManager.getWindows();
            const diceActionIds = [];
            for (const [actionId] of activeActions) {
                const idx = buttonAssignments.get(actionId);
                if (idx !== undefined && idx >= windows.length) {
                    diceActionIds.push(actionId);
                }
            }
            // Sort dice buttons by their button index for consistent ordering
            diceActionIds.sort((a, b) => {
                const idxA = buttonAssignments.get(a) ?? 0;
                const idxB = buttonAssignments.get(b) ?? 0;
                return idxA - idxB;
            });
            // Assign workstreams to dice buttons
            const needsSearchButton = cachedWorkstreams.length >= diceActionIds.length;
            const workstreamSlots = needsSearchButton ? diceActionIds.length - 1 : diceActionIds.length;
            for (let i = 0; i < diceActionIds.length; i++) {
                const actionId = diceActionIds[i];
                if (i < workstreamSlots && i < cachedWorkstreams.length) {
                    workstreamAssignments.set(actionId, cachedWorkstreams[i]);
                }
                else if (needsSearchButton && i === workstreamSlots) {
                    workstreamAssignments.set(actionId, 'search');
                }
                // Remaining dice buttons (if any) get no assignment — pressing exits mode
            }
            await this.renderWorkstreamMode();
            this.resetWorkstreamModeTimeout();
        }
        /**
         * Exit workstream mode and restore normal display
         */
        exitWorkstreamMode() {
            workstreamModeActive = false;
            cachedWorkstreams = [];
            workstreamAssignments.clear();
            if (workstreamModeTimeout) {
                clearTimeout(workstreamModeTimeout);
                workstreamModeTimeout = null;
            }
            // Restore normal display
            if (stateManager) {
                const windows = stateManager.getWindows();
                this.updateAllButtons(windows);
            }
        }
        /**
         * Render workstream mode: show workstream names on purple, search on overflow
         */
        async renderWorkstreamMode() {
            for (const [actionId, actionInstance] of activeActions) {
                const assignment = workstreamAssignments.get(actionId);
                if (assignment === 'search') {
                    await actionInstance.setTitle('Search');
                    await actionInstance.setImage(STATE_IMAGES.search);
                }
                else if (assignment) {
                    const formattedName = this.formatTitle(assignment.name);
                    await actionInstance.setTitle(formattedName);
                    await actionInstance.setImage(STATE_IMAGES.workstream);
                }
                // Window buttons keep their current display (not in workstreamAssignments)
            }
        }
        /**
         * Reset the auto-exit timeout for workstream mode
         */
        resetWorkstreamModeTimeout() {
            if (workstreamModeTimeout) {
                clearTimeout(workstreamModeTimeout);
            }
            workstreamModeTimeout = setTimeout(() => {
                if (workstreamModeActive) {
                    this.exitWorkstreamMode();
                }
            }, WORKSTREAM_MODE_TIMEOUT_MS);
        }
        /**
         * Update all buttons with current window state
         */
        async updateAllButtons(windows) {
            // Don't stomp workstream mode display
            if (workstreamModeActive) {
                // Only update window buttons (those not in workstream assignments)
                for (const [actionId, actionInstance] of activeActions) {
                    if (!workstreamAssignments.has(actionId)) {
                        const buttonIndex = buttonAssignments.get(actionId);
                        if (buttonIndex !== undefined) {
                            await this.updateButton(actionInstance, buttonIndex, windows);
                        }
                    }
                }
                return;
            }
            for (const [actionId, actionInstance] of activeActions) {
                const buttonIndex = buttonAssignments.get(actionId);
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
                // No window for this button - show dice icon to launch random
                await actionInstance.setTitle('');
                await actionInstance.setImage(STATE_IMAGES.launchRandom);
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
         * Splits at natural break points (hyphens or spaces) or midpoint
         * Truncates lines that are too long
         */
        formatTitle(title) {
            const maxLineLength = 9;
            // If short enough, return as-is
            if (title.length <= maxLineLength) {
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
            let line1;
            let line2;
            if (splitIndex > 0 && splitIndex < title.length - 1) {
                const char = title[splitIndex];
                if (char === '-') {
                    // Keep hyphen on first line
                    line1 = title.substring(0, splitIndex + 1);
                    line2 = title.substring(splitIndex + 1);
                }
                else {
                    // Space - don't include it
                    line1 = title.substring(0, splitIndex);
                    line2 = title.substring(splitIndex + 1);
                }
            }
            else {
                // No good split point - split at midpoint
                line1 = title.substring(0, midpoint);
                line2 = title.substring(midpoint);
            }
            // Truncate lines if too long
            if (line1.length > maxLineLength) {
                line1 = line1.substring(0, maxLineLength - 1) + '…';
            }
            if (line2.length > maxLineLength) {
                line2 = line2.substring(0, maxLineLength - 1) + '…';
            }
            return line1 + '\n' + line2;
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