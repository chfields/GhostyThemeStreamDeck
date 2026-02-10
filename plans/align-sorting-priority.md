# Plan: Align Stream Deck Sorting Priority with GhosttyThemePicker

## Problem

Stream Deck plugin has different priority order than GhosttyThemePicker, causing inconsistent window ordering.

## Current State

### GhosttyThemePicker (CORRECT)
```swift
enum ClaudeState: Int, Comparable {
    case notRunning = 0   // No Claude - lowest priority
    case working = 1      // Claude processing
    case running = 2      // Claude detected but state unknown
    case waiting = 3      // At prompt, ready for input
    case asking = 4       // Asked a question - highest priority
}
```

**Order:** asking > waiting > running > working > notRunning

### Stream Deck (INCORRECT)
```typescript
const STATE_PRIORITY = {
  asking: 5,
  waiting: 4,
  notRunning: 3,  // WRONG - should be lowest
  working: 2,
  running: 1,     // WRONG - should be higher than working
};
```

**Order:** asking > waiting > notRunning > working > running

## Fix

Update `src/services/WindowStateManager.ts` to match GhosttyThemePicker:

```typescript
const STATE_PRIORITY: Record<ClaudeState, number> = {
  asking: 5,      // Asked a question - highest priority
  waiting: 4,     // At prompt, ready for input
  running: 3,     // Claude detected but state unknown
  working: 2,     // Claude processing
  notRunning: 1,  // No Claude - lowest priority
};
```

**New Order:** asking > waiting > running > working > notRunning

## Files to Modify

- `src/services/WindowStateManager.ts` - Fix STATE_PRIORITY values

## Steps

1. Edit `WindowStateManager.ts` to fix priority values
2. Run `npm run build`
3. Restart Stream Deck app
4. Verify order matches GhosttyThemePicker

## Testing

1. Have windows in different states (waiting, working, running)
2. Verify Stream Deck shows: asking first, then waiting, then running, then working, then notRunning
3. Compare with Window Switcher (⌃⌥P) - order should match
