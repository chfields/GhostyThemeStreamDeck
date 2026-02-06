import { ThemePickerClient, GhosttyWindow } from './ThemePickerClient';

export type ClaudeState = 'asking' | 'waiting' | 'working' | 'running' | 'notRunning';

// Priority order for sorting windows (higher = more important = shown first)
const STATE_PRIORITY: Record<ClaudeState, number> = {
  asking: 5,     // Claude asked a question - highest priority
  waiting: 4,    // At prompt, ready for input
  notRunning: 3, // Available for new work
  working: 2,    // Claude processing - busy
  running: 1,    // Claude detected but state unknown
};

export interface WindowStateChange {
  windows: GhosttyWindow[];
  hasChanges: boolean;
}

export type StateChangeListener = (change: WindowStateChange) => void;

export class WindowStateManager {
  private client: ThemePickerClient;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastWindowsJson: string = '';
  private listeners: Set<StateChangeListener> = new Set();
  private currentWindows: GhosttyWindow[] = [];
  private isPolling = false;

  // Track when windows transition from "working" to another state
  // Key: window ID, Value: timestamp (ms) when it left "working" state
  private finishedWorkingAt: Map<string, number> = new Map();
  // Track previous state for each window to detect transitions
  private previousStates: Map<string, ClaudeState> = new Map();

  constructor() {
    this.client = new ThemePickerClient();
  }

  /**
   * Start polling for window state changes
   */
  start(intervalMs: number = 1000): void {
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
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
  }

  /**
   * Add a listener for state changes
   */
  addListener(listener: StateChangeListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: StateChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Get current windows sorted by priority
   */
  getWindows(): GhosttyWindow[] {
    return this.sortWindowsByPriority([...this.currentWindows]);
  }

  /**
   * Get a specific window by ID
   */
  getWindow(windowId: string): GhosttyWindow | undefined {
    return this.currentWindows.find(w => w.id === windowId);
  }

  /**
   * Focus a window
   */
  async focusWindow(windowId: string): Promise<void> {
    await this.client.focusWindow(windowId);
  }

  /**
   * Check if API is available
   */
  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable();
  }

  /**
   * Sort windows by Claude state priority
   * Priority: asking > waiting > notRunning > working > running
   * Secondary: within same state, most recently finished working first
   */
  private sortWindowsByPriority(windows: GhosttyWindow[]): GhosttyWindow[] {
    return windows.sort((a, b) => {
      const priorityA = STATE_PRIORITY[a.claudeState];
      const priorityB = STATE_PRIORITY[b.claudeState];

      // Primary sort by state priority
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      // Secondary sort: most recently finished working comes first
      const finishedA = this.finishedWorkingAt.get(a.id) ?? 0;
      const finishedB = this.finishedWorkingAt.get(b.id) ?? 0;
      return finishedB - finishedA; // More recent first
    });
  }

  /**
   * Track state transitions to detect when windows finish working
   */
  private trackStateTransitions(windows: GhosttyWindow[]): void {
    const now = Date.now();

    for (const window of windows) {
      const prevState = this.previousStates.get(window.id);
      const currentState = window.claudeState;

      // If transitioned FROM working to something else, record the timestamp
      if (prevState === 'working' && currentState !== 'working') {
        this.finishedWorkingAt.set(window.id, now);
      }

      // Update previous state
      this.previousStates.set(window.id, currentState);
    }

    // Clean up stale entries for windows that no longer exist
    const currentIds = new Set(windows.map(w => w.id));
    for (const id of this.previousStates.keys()) {
      if (!currentIds.has(id)) {
        this.previousStates.delete(id);
        this.finishedWorkingAt.delete(id);
      }
    }
  }

  /**
   * Poll the API for window updates
   */
  private async poll(): Promise<void> {
    try {
      const windows = await this.client.getWindows();

      // Track state transitions before sorting
      this.trackStateTransitions(windows);

      const sortedWindows = this.sortWindowsByPriority(windows);
      const windowsJson = JSON.stringify(sortedWindows);

      // Check if windows have changed
      const hasChanges = windowsJson !== this.lastWindowsJson;

      if (hasChanges) {
        this.lastWindowsJson = windowsJson;
        this.currentWindows = sortedWindows;

        // Notify listeners
        const change: WindowStateChange = {
          windows: sortedWindows,
          hasChanges: true,
        };

        for (const listener of this.listeners) {
          try {
            listener(change);
          } catch (err) {
            console.error('Error in state change listener:', err);
          }
        }
      }
    } catch (err) {
      // API not available - clear windows and notify
      if (this.currentWindows.length > 0) {
        this.currentWindows = [];
        this.lastWindowsJson = '';

        const change: WindowStateChange = {
          windows: [],
          hasChanges: true,
        };

        for (const listener of this.listeners) {
          try {
            listener(change);
          } catch (listenerErr) {
            console.error('Error in state change listener:', listenerErr);
          }
        }
      }
    }
  }
}
