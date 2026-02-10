# Plan: Fix Stream Deck Window Ordering

## Problem

Stream Deck buttons are not showing windows in the correct priority order. "working" windows appear before "waiting" windows.

## Expected Order

1. **asking** (5) - Claude asked a question
2. **waiting** (4) - Claude at prompt, ready for input
3. **notRunning** (3) - No Claude process
4. **working** (2) - Claude processing
5. **running** (1) - Claude detected but state unknown

## Current Behavior

API returns windows unsorted. Stream Deck plugin is supposed to sort them, but order appears wrong on buttons.

## Investigation Steps

1. Check if compiled JS matches source TS
2. Check if `sortWindowsByPriority` is being called correctly
3. Check if button assignment uses sorted order
4. Add debug logging to trace the issue

## Potential Causes

### Cause 1: Compiled JS Out of Date
The TypeScript might not have been recompiled after changes.

**Fix:** Run `npm run build` and reinstall plugin

### Cause 2: Button Assignment Not Using Sorted Windows
`GhosttyWindowAction.ts` assigns buttons by `buttonIndex` which is based on appearance order, not window priority.

**Current flow:**
1. Button appears → gets next available index (0, 1, 2...)
2. Windows are sorted by priority
3. Window at index N goes to button with index N

This is correct - but if buttons don't appear in order or indices get out of sync, ordering breaks.

### Cause 3: Stale Button Assignments
If buttons were added in a different order, `buttonAssignments` map might have indices that don't match the expected order.

## Solution

### Step 1: Rebuild and Reinstall Plugin

```bash
cd /Users/chfields/Projects/GhostyThemeStreamDeck
npm run build
# Reinstall plugin to Stream Deck
```

### Step 2: Verify Sorting Works

Add temporary debug logging to `WindowStateManager.poll()`:

```typescript
console.log('Sorted windows:', sortedWindows.map(w => ({
  name: w.displayName,
  state: w.claudeState
})));
```

### Step 3: If Still Broken - Fix Button Assignment

The button assignment should be deterministic. Currently buttons get assigned indices as they appear, which might not match sorted order.

**Better approach:** Don't assign fixed indices to buttons. Instead, on each update:
1. Get sorted windows
2. Get all active button actions
3. Assign window[0] to first button, window[1] to second, etc.

This requires tracking button order by their coordinates or assignment time.

## Files to Modify

- `src/services/WindowStateManager.ts` - Add debug logging
- `src/actions/GhosttyWindowAction.ts` - Fix button assignment if needed
- `package.json` - Ensure build script works

## Testing

1. Rebuild plugin
2. Remove and re-add buttons to Stream Deck
3. Verify "waiting" windows appear before "working" windows
4. Check console logs for sorted order
