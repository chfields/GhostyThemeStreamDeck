import { ThemePickerClient, GhosttyWindow } from './ThemePickerClient';

export type ClaudeState = 'waiting' | 'working' | 'running' | 'notRunning';

// Priority order for sorting windows (higher = more important = shown first)
const STATE_PRIORITY: Record<ClaudeState, number> = {
  waiting: 4,    // Needs input - highest priority
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
   * Priority: waiting > notRunning > working > running
   */
  private sortWindowsByPriority(windows: GhosttyWindow[]): GhosttyWindow[] {
    return windows.sort((a, b) => {
      const priorityA = STATE_PRIORITY[a.claudeState];
      const priorityB = STATE_PRIORITY[b.claudeState];
      return priorityB - priorityA; // Higher priority first
    });
  }

  /**
   * Poll the API for window updates
   */
  private async poll(): Promise<void> {
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
