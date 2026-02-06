# Ghostty Theme Stream Deck Plugin

Stream Deck plugin for displaying Claude state indicators for Ghostty terminal windows and enabling window switching directly from Stream Deck buttons.

## Requirements

- macOS 11.0 or later
- [GhosttyThemePicker](https://github.com/chfields/GhosttyThemePicker) app running
- [Elgato Stream Deck](https://www.elgato.com/stream-deck) with Stream Deck software v6.0+
- [Ghostty](https://ghostty.org/) terminal

## How It Works

This plugin communicates with the GhosttyThemePicker app via a local HTTP API (port 49876). The GhosttyThemePicker app tracks all Ghostty windows and their Claude Code states.

### Button Display

Buttons are dynamically assigned to Ghostty windows, sorted by priority:

1. **Waiting** (yellow) - Claude needs input (highest priority)
2. **Idle** (gray) - No Claude process, available for new work
3. **Working** (blue) - Claude is processing
4. **Running** (green) - Claude detected but state unknown

Each button shows:
- A colored state indicator icon
- The project/workstream name

### Button Actions

- **Press** - Focus the corresponding Ghostty window

## Installation

### Prerequisites

1. Install and run GhosttyThemePicker app
2. Ensure it has Screen Recording permission (System Settings > Privacy & Security > Screen Recording)

### Install the Plugin

```bash
# Clone the repository
git clone https://github.com/chfields/GhostyThemeStreamDeck.git
cd GhostyThemeStreamDeck

# Install dependencies and build
npm install
npm run build

# Install to Stream Deck
make install
```

Then restart the Stream Deck application.

### Development

```bash
# Link plugin for development (auto-reload)
make dev

# Watch for changes
npm run watch
```

## Configuration

Add "Ghostty Window" buttons to your Stream Deck profile. The plugin will automatically assign windows to buttons based on their Claude state priority.

Typical setup: Add 4-8 buttons in a row to see all your Claude windows at a glance.

## Troubleshooting

### Buttons show "Not Running" for all windows

- Ensure GhosttyThemePicker app is running
- Check that the port file exists: `cat ~/.ghostty-api-port`
- Test the API: `curl http://localhost:49876/api/windows`

### Window focus doesn't work

- Grant Accessibility permission to GhosttyThemePicker (System Settings > Privacy & Security > Accessibility)

### States not updating

- Grant Screen Recording permission to GhosttyThemePicker
- Window titles are needed to detect Claude's waiting/working states

## API Reference

The plugin communicates with GhosttyThemePicker's API:

- `GET /api/health` - Check if app is running
- `GET /api/windows` - List all Ghostty windows with Claude state
- `POST /api/windows/:id/focus` - Focus a specific window

## License

MIT
