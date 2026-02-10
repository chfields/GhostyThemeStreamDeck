# Plan: Fix Button Order on Stream Deck Restart

## Problem
When the Stream Deck app restarts, buttons get assigned to different window indices because `onWillAppear` events fire in unpredictable order.

## Root Cause

Current code in `GhosttyWindowAction.js` (lines 85-91):
```javascript
// Find lowest available index
let buttonIndex = 0;
while (usedIndices.has(buttonIndex)) {
    buttonIndex++;
}
usedIndices.add(buttonIndex);
buttonAssignments.set(actionId, buttonIndex);
```

This assigns indices based on the order buttons appear, not their physical position. On restart, the order is random.

## Solution

Use the button's physical position (row/column coordinates) from the Stream Deck event to compute a consistent index.

### Stream Deck Event Payload

The `onWillAppear` event includes coordinates:
```javascript
ev.action.coordinates  // { row: 0, column: 2 }
```

### New Index Calculation

```javascript
// Use physical position for consistent ordering
const coords = ev.action.coordinates;
if (coords) {
    // Calculate index from position: row * columns + column
    // Assuming standard Stream Deck layout (columns varies by device)
    const columns = ev.device?.size?.columns || 5;  // Default to 5 for standard SD
    buttonIndex = coords.row * columns + coords.column;
} else {
    // Fallback to old behavior if no coordinates
    while (usedIndices.has(buttonIndex)) {
        buttonIndex++;
    }
}
```

### Alternative: Use Settings Storage

Store the assigned index in the button's settings so it persists:
```javascript
async onWillAppear(ev) {
    const settings = ev.payload.settings;
    let buttonIndex = settings.windowIndex;

    if (buttonIndex === undefined) {
        // First time - assign next available
        buttonIndex = findNextAvailableIndex();
        await ev.action.setSettings({ windowIndex: buttonIndex });
    }
    // ...
}
```

## Recommended Approach

**Use physical coordinates** - simpler, no settings needed, naturally maps to button layout.

## Changes

**File:** `src/actions/GhosttyWindowAction.ts` (source)
**Compiled:** `bin/actions/GhosttyWindowAction.js`

```typescript
async onWillAppear(ev: WillAppearEvent) {
    const actionInstance = ev.action;
    const actionId = actionInstance.id;

    // Track this action
    activeActions.set(actionId, actionInstance);

    // Initialize state manager on first button
    if (!stateManager) {
        stateManager = new WindowStateManager();
        stateManager.addListener((change) => {
            this.updateAllButtons(change.windows);
        });
        stateManager.start(1000);
    }

    // Use physical position for consistent ordering across restarts
    let buttonIndex: number;
    const coords = ev.payload.coordinates;
    if (coords) {
        // Standard Stream Deck has 5 columns, XL has 8
        const columns = 5;  // Could detect from device info
        buttonIndex = coords.row * columns + coords.column;
    } else {
        // Fallback: find lowest available
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
```

## Testing

1. Add 3+ Ghostty Window buttons to Stream Deck
2. Note which windows appear on which buttons
3. Restart Stream Deck app
4. Verify buttons show same windows as before

## Files to Modify

- `GhostyThemeStreamDeck/src/actions/GhosttyWindowAction.ts`
- Run `npm run build` to compile
