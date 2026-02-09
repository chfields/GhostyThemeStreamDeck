import streamDeck, {
  action,
  KeyDownEvent,
  KeyUpEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  Action,
} from '@elgato/streamdeck';
import { WindowStateManager } from '../services/WindowStateManager';
import { GhosttyWindow, WorkstreamInfo } from '../services/ThemePickerClient';

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
  workstream: 'images/workstream',
  search: 'images/search',
};

// --- Workstream mode state ---
let workstreamModeActive = false;
let cachedWorkstreams: WorkstreamInfo[] = [];
let workstreamModeTimeout: ReturnType<typeof setTimeout> | null = null;
// Maps action ID -> assigned workstream or 'search' sentinel
const workstreamAssignments = new Map<string, WorkstreamInfo | 'search'>();
// Maps action ID -> keyDown timestamp for long-press detection
const keyDownTimestamps = new Map<string, number>();

const LONG_PRESS_MS = 500;
const WORKSTREAM_MODE_TIMEOUT_MS = 10000;

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
  override async onKeyDown(ev: KeyDownEvent<object>): Promise<void> {
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
      } catch (err) {
        console.error('Failed to focus window:', err);
        await actionInstance.showAlert();
      }
    } else {
      // Dice button: record timestamp, defer action to onKeyUp for long-press detection
      keyDownTimestamps.set(actionId, Date.now());
    }
  }

  /**
   * Called when a button is released
   */
  override async onKeyUp(ev: KeyUpEvent<object>): Promise<void> {
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
        } catch (err) {
          console.error('Failed to open Quick Launch:', err);
        }
        this.exitWorkstreamMode();
      } else if (assignment) {
        // Workstream button: launch the workstream
        try {
          await actionInstance.setTitle('...');
          await stateManager.launchWorkstream(assignment.id);
        } catch (err) {
          console.error('Failed to launch workstream:', err);
          await actionInstance.showAlert();
        }
        this.exitWorkstreamMode();
      } else {
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
    } else {
      // Short press on dice button: launch random
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
   * Enter workstream mode: fetch workstreams and assign to dice buttons
   */
  private async enterWorkstreamMode(): Promise<void> {
    if (!stateManager) return;

    try {
      const allWorkstreams = await stateManager.getWorkstreams();
      // Exclude workstreams that are already open
      const openWorkstreamNames = new Set(
        stateManager.getWindows()
          .map(w => w.workstreamName)
          .filter((name): name is string => name != null)
      );
      cachedWorkstreams = allWorkstreams.filter(ws => !openWorkstreamNames.has(ws.name));
    } catch (err) {
      console.error('Failed to fetch workstreams:', err);
      return;
    }

    // 0 available workstreams: open Quick Launch directly instead
    if (cachedWorkstreams.length === 0) {
      try {
        await stateManager.openQuickLaunch();
      } catch (err) {
        console.error('Failed to open Quick Launch:', err);
      }
      return;
    }

    workstreamModeActive = true;
    workstreamAssignments.clear();

    // Find dice buttons (those beyond window count)
    const windows = stateManager.getWindows();
    const diceActionIds: string[] = [];

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
      } else if (needsSearchButton && i === workstreamSlots) {
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
  private exitWorkstreamMode(): void {
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
  private async renderWorkstreamMode(): Promise<void> {
    for (const [actionId, actionInstance] of activeActions) {
      const assignment = workstreamAssignments.get(actionId);

      if (assignment === 'search') {
        await actionInstance.setTitle('Search');
        await actionInstance.setImage(STATE_IMAGES.search);
      } else if (assignment) {
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
  private resetWorkstreamModeTimeout(): void {
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
  private async updateAllButtons(windows: GhosttyWindow[]): Promise<void> {
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
