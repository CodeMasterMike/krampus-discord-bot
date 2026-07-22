# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Discord bot that monitors messages and reacts/replies based on configurable patterns. Uses Discord Gateway (WebSocket) via discord.js v14. TypeScript project compiled to `dist/` (`"type": "module"` in package.json).

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start            # Run the bot (node dist/bot.js)
npm run dev          # Run with tsx + nodemon for auto-reload
npm run typecheck    # Type-check without emitting
```

No test or lint tooling is configured.

## Environment Setup

Requires a `.env` file with:
- `APP_ID` - Discord application ID
- `DISCORD_TOKEN` - Bot token
- `PUBLIC_KEY` - Discord application public key

**Important:** Enable MESSAGE_CONTENT privileged intent in Discord Developer Portal (Bot > Privileged Gateway Intents).

## Architecture

Modular discord.js TypeScript project with JSON-based pattern config (`patterns.json`). Source in `src/`, compiles to `dist/`.

**Project structure:**
```
src/
  bot.ts                     # Entry point: client setup, event registration, login
  types/
    index.ts                 # Shared type definitions (PatternConfig, BotEvent, BotCommand, etc.)
  events/
    ready.ts                 # ClientReady handler + slash command registration via REST API
    messageCreate.ts         # Message pattern matching handler
    interactionCreate.ts     # Slash command router (Collection-based lookup)
  commands/
    test.ts                  # /test command: definition (SlashCommandBuilder) + execute()
    wordcount.ts             # /wordcount command: user word count stats
    putt-today.ts            # /putt-today: today's ranked scores (public)
    putt-leaderboard.ts      # /putt-leaderboard: handicap ranking + medals (public)
    putt-card.ts             # /putt-card: personal scorecard (ephemeral)
  utils/
    patterns.ts              # patternToRegex() + loadPatterns() from patterns.json
    wordcounter.ts           # Word tracking, milestone checking, persistence
    scoretracker.ts          # Score parsing/persistence, handicap + medal computation
```

**Import convention:** All `.ts` imports use `.js` extensions (e.g., `import { foo } from './bar.js'`). Required by `module: "Node16"` — TypeScript resolves `.js` to `.ts` at compile time.

**Event handler convention:** Each event file exports `name` (Discord event), `once` (boolean), and `execute()`. `bot.ts` registers them dynamically using the `BotEvent` interface.

**Adding a new slash command:** Create a file in `src/commands/` exporting `data` (SlashCommandBuilder) and `execute(interaction: ChatInputCommandInteraction)`. Then import it in both `src/events/ready.ts` (for registration) and `src/events/interactionCreate.ts` (for routing).

**Key behaviors:**
- **Pattern matching** (`messageCreate.ts`) — Ignores bot authors, iterates patterns in order, first match wins. Type `"react"` adds emoji reaction; type `"reply"` sends a reply message. Includes `[DEBUG]` console logs.
- **`patternToRegex()`** — Converts pattern strings to RegExp: escapes special chars, replaces `*` with `.*`, case-insensitive.
- **Slash command registration** (`ready.ts`) — On `ClientReady`, registers commands globally via Discord REST API PUT to `/applications/{APP_ID}/commands`.
- **Word tracking** (`wordcounter.ts`) — Counts tracked word occurrences per user, persists to `data/wordcounts-data.json`, announces milestones.
- **Score tracking** (`scoretracker.ts`) — Config-driven score parser (`scoretrackers.json`) for daily-puzzle games like putt.day. On each message, runs every tracker's regex; the first submission of a given round number per user is logged to `data/scores-data.json` (later re-posts of the same round are ignored) and confirmed with a quiet reaction. Golf scoring: **lowest score wins**. Handicap = scoring average (avg strokes per round); place finishes (🥇🥈🥉) are derived live by ranking each round's participants ascending (ties share a place; rounds need `minPlayersForMedal` players to count). "Today" = the highest round number recorded. Surfaced via `/putt-today`, `/putt-leaderboard`, `/putt-card`.

**Pattern Config Format (`patterns.json`):**
```json
{
  "patterns": [
    { "pattern": "hello", "type": "react", "emoji": "🇿" },
    { "pattern": "somebody*help", "type": "reply", "message": "I'm here to help!" }
  ]
}
```

Patterns are loaded once at startup — changes to `patterns.json` require a bot restart (or use `npm run dev` for auto-reload).

**Score Tracker Config Format (`scoretrackers.json`):**
```json
{
  "trackers": [
    {
      "id": "puttday",
      "name": "putt.day",
      "pattern": "putt\\.day #(\\d+).*?(\\d+)/(\\d+)",
      "roundGroup": 1, "scoreGroup": 2, "maxGroup": 3,
      "direction": "lower",
      "confirmReaction": "⛳",
      "minPlayersForMedal": 2
    }
  ]
}
```

`pattern` is a regex whose capture groups yield the round number, score, and max (indices given by `roundGroup`/`scoreGroup`/`maxGroup`). `direction: "lower"` means a smaller score is better (golf convention — fewest strokes wins); `"higher"` inverts the ranking for make-count style games. Add another game by appending a tracker entry — no code changes needed, though the golf-named commands stay bound to the `puttday` tracker.
