import streamDeck, { LogLevel } from '@elgato/streamdeck';

import { GhosttyWindowAction } from './actions/GhosttyWindowAction';

// Enable logging for debugging
streamDeck.logger.setLevel(LogLevel.DEBUG);

// Register the action
streamDeck.actions.registerAction(new GhosttyWindowAction());

// Connect to the Stream Deck
streamDeck.connect();
