.PHONY: build install clean dev link unlink

PLUGIN_NAME = com.chfields.ghostty-claude.sdPlugin
PLUGIN_DIR = ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/$(PLUGIN_NAME)

# Build TypeScript
build:
	npm run build

# Install dependencies
deps:
	npm install

# Link plugin to Stream Deck (for development)
link:
	@echo "Linking plugin to Stream Deck..."
	streamdeck link $(PLUGIN_NAME)

# Unlink plugin from Stream Deck
unlink:
	@echo "Unlinking plugin from Stream Deck..."
	streamdeck unlink $(PLUGIN_NAME)

# Install plugin to Stream Deck plugins folder
install: build
	@echo "Installing plugin to Stream Deck..."
	@mkdir -p $(PLUGIN_DIR)
	@cp -R $(PLUGIN_NAME)/* $(PLUGIN_DIR)/
	@echo "Plugin installed. Restart Stream Deck to load."

# Clean build artifacts
clean:
	rm -rf $(PLUGIN_NAME)/bin/*.js $(PLUGIN_NAME)/bin/*.js.map
	rm -rf node_modules

# Development mode: build and link
dev: build link

# Full setup: install deps, build, and install
setup: deps build install
