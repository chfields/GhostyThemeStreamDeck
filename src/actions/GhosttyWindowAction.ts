import streamDeck, {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  Action,
} from '@elgato/streamdeck';
import { WindowStateManager } from '../services/WindowStateManager';
import { GhosttyWindow } from '../services/ThemePickerClient';

// Map of action ID to assigned window index
const buttonAssignments = new Map<string, number>();

// Track all active actions
const activeActions = new Map<string, Action>();

// Track used indices to find lowest available
const usedIndices = new Set<number>();

// Shared state manager instance
let stateManager: WindowStateManager | null = null;

// Images for each state
const STATE_IMAGES: Record<string, string> = {
  asking: 'images/asking',
  waiting: 'images/waiting',
  working: 'images/working',
  running: 'images/running',
  notRunning: 'images/not-running',
  launchRandom: 'images/launch-random',
};

@action({ UUID: 'com.chfields.ghostty-claude.window' })
export class GhosttyWindowAction extends SingletonAction {
  /**
   * Called when a button appears on the Stream Deck
   */
  override async onWillAppear(ev: WillAppearEvent<object>): Promise<void> {
    const actionInstance = ev.action;
    const actionId = actionInstance.id;

    // Track this action
    activeActions.set(actionId, actionInstance);

    // Initialize state manager on first button
    if (!stateManager) {
      stateManager = new WindowStateManager();

      // Listen for state changes
      stateManager.addListener((change) => {
        this.updateAllButtons(change.windows);
      });

      // Start polling
      stateManager.start(1000);
    }

    // Use physical position for consistent ordering across restarts
    let buttonIndex: number;
    const payload = ev.payload as { coordinates?: { row: number; column: number } };
    const coords = payload.coordinates;
    if (coords) {
      // Calculate index from position: row * columns + column
      // Standard Stream Deck has 5 columns, XL has 8, Mini has 3
      const columns = 5;
      buttonIndex = coords.row * columns + coords.column;
    } else {
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
  override async onWillDisappear(ev: WillDisappearEvent<object>): Promise<void> {
    const actionId = ev.action.id;

    // Release the index
    const buttonIndex = buttonAssignments.get(actionId);
    if (buttonIndex !== undefined) {
      usedIndices.delete(buttonIndex);
    }

    // Remove from tracking
    activeActions.delete(actionId);
    buttonAssignments.delete(actionId);

    // Stop state manager if no buttons left
    if (activeActions.size === 0 && stateManager) {
      stateManager.stop();
      stateManager = null;
    }
  }

  /**
   * Called when a button is pressed
   */
  override async onKeyDown(ev: KeyDownEvent<object>): Promise<void> {
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
      } catch (err) {
        console.error('Failed to focus window:', err);
        await actionInstance.showAlert();
      }
    } else {
      // No window assigned - launch a random Ghostty window
      try {
        await actionInstance.setTitle('...');
        await stateManager.launchRandom();
        setTimeout(async () => {
          if (stateManager) {
            await this.updateButton(actionInstance, buttonIndex, stateManager.getWindows());
          }
        }, 500);
      } catch (err) {
        console.error('Failed to launch random:', err);
        await actionInstance.showAlert();
      }
    }
  }

  /**
   * Update all buttons with current window state
   */
  private async updateAllButtons(windows: GhosttyWindow[]): Promise<void> {
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
  private async updateButton(
    actionInstance: Action,
    buttonIndex: number,
    windows: GhosttyWindow[]
  ): Promise<void> {
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
  private formatTitle(title: string): string {
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

    let line1: string;
    let line2: string;

    if (splitIndex > 0 && splitIndex < title.length - 1) {
      const char = title[splitIndex];
      if (char === '-') {
        // Keep hyphen on first line
        line1 = title.substring(0, splitIndex + 1);
        line2 = title.substring(splitIndex + 1);
      } else {
        // Space - don't include it
        line1 = title.substring(0, splitIndex);
        line2 = title.substring(splitIndex + 1);
      }
    } else {
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
}
