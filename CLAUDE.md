# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Krampus-themed Discord bot with two halves: passive message handling (pattern reactions, word tracking, daily-score logging, random encounters) and slash commands (facts, 8-ball, role-timeout "smack", stats readouts). Uses Discord Gateway (WebSocket) via discord.js v14. TypeScript project compiled to `dist/` (`"type": "module"` in package.json).

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

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`: SSH to the VM (`VM_HOST`/`VM_USER`/`VM_SSH_KEY` secrets), `git pull`, `npm install`, `npm run build`, then restart under pm2 as `krampus-bot`. Because config JSON is read at startup, a deploy is also what picks up config edits. VM provisioning notes live in `docs/azure-vm-setup.md`.

## Architecture

Modular discord.js TypeScript project driven by JSON config files at the repo root. Source in `src/`, compiles to `dist/`. Runtime state persists to `data/` (gitignored).

**Project structure:**
```
src/
  bot.ts                     # Entry point: client setup, event registration, login
  types/
    index.ts                 # Shared type definitions (PatternConfig, BotEvent, BotCommand, etc.)
  events/
    ready.ts                 # ClientReady: command registration via REST + rotating presence
    messageCreate.ts         # Passive message pipelines (patterns, words, scores, encounters)
    interactionCreate.ts     # Slash command router (Collection-based lookup)
  commands/
    test.ts                  # /test: definition (SlashCommandBuilder) + execute()
    version.ts               # /version: bot version from package.json
    krampus.ts               # /krampus: random Krampus folklore fact
    eightball.ts             # /8ball: magic 8-ball with optional question
    smack.ts                 # /smack: assign a timed punishment role to a user
    wordcount.ts             # /wordcount: user word count stats (ephemeral)
    putt-today.ts            # /putt-today: today's ranked scores (public)
    putt-leaderboard.ts      # /putt-leaderboard: handicap ranking + medals (public)
    putt-card.ts             # /putt-card: personal scorecard (ephemeral)
  utils/
    patterns.ts              # patternToRegex() + loadPatterns() from patterns.json
    wordcounter.ts           # Word tracking, milestone checking, persistence
    scoretracker.ts          # Score parsing/persistence, handicap + medal computation
    encounters.ts            # Random encounter roll + message formatting
    smack.ts                 # Smack config load + in-memory cooldown map
    version.ts               # Reads version out of package.json

Root config (loaded at startup, restart to pick up edits):
  patterns.json              # Message pattern → react/reply rules
  wordcounts.json            # Tracked words, milestones, callout templates
  encounters.json            # Random encounter chance, messages, emojis
  smack.json                 # Punishment role ID, duration, cooldown, messages
  scoretrackers.json         # Daily-score game definitions (putt.day)

data/                        # Persisted state, gitignored
  wordcounts-data.json
  scores-data.json
```

**Import convention:** All `.ts` imports use `.js` extensions (e.g., `import { foo } from './bar.js'`). Required by `module: "Node16"` — TypeScript resolves `.js` to `.ts` at compile time.

**Event handler convention:** Each event file exports `name` (Discord event), `once` (boolean), and `execute()`. `bot.ts` registers them dynamically using the `BotEvent` interface.

**Adding a new slash command:** Create a file in `src/commands/` exporting `data` (SlashCommandBuilder) and `execute(interaction: ChatInputCommandInteraction)`. Then import it in both `src/events/ready.ts` (for registration) and `src/events/interactionCreate.ts` (for routing).

**Message pipelines:** `messageCreate.ts` ignores bot authors, then runs four independent pipelines in order on every message — patterns, word counting, score tracking, encounters. They do **not** short-circuit each other: one message can react to a pattern, cross a word milestone, and log a score. Throughout, `[DEBUG]` console logs narrate each step.

**Key behaviors:**
- **Pattern matching** (`messageCreate.ts`) — Iterates `patterns.json` in order, first match wins (`break`). Type `"react"` adds emoji reaction; type `"reply"` sends a reply message.
- **`patternToRegex()`** — Converts pattern strings to RegExp: escapes special chars, replaces `*` with `.*`, case-insensitive.
- **Slash command registration** (`ready.ts`) — On `ClientReady`, registers commands globally via Discord REST API PUT to `/applications/{APP_ID}/commands`. Adding a command means touching both `ready.ts` and `interactionCreate.ts`.
- **Rotating presence** (`ready.ts`) — Picks a random status from an in-file `krampusStatuses` array on ready, then re-rolls hourly via `setInterval`.
- **Word tracking** (`wordcounter.ts`) — Counts tracked word occurrences per user, persists to `data/wordcounts-data.json`, announces milestones. Only the highest milestone crossed per message is announced. Matching is `\b` + word with **no trailing boundary**, so entries match as stems: `no` counts inside "nothing", `kramp` inside "krampus". Adjust the word list with that in mind.
- **Random encounters** (`encounters.ts`) — Rolls `chance` (default 2%) per message; on a hit, coin-flips between reacting with a random emoji and sending a random atmospheric message (`{user}` → mention).
- **Smack** (`smack.ts` command + util) — Assigns the configured role, replies with a random announcement, and removes the role after `durationSeconds` via `setTimeout`. Guards: no self-smacks, no bots, guild-only, role must exist, per-user cooldown. Both the cooldown map and the removal timer are **in-memory** — a restart clears cooldowns and strands the role on anyone mid-punishment.
- **Score tracking** (`scoretracker.ts`) — Config-driven score parser (`scoretrackers.json`) for daily-puzzle games like putt.day. On each message, runs every tracker's regex; the first submission of a given round number per user is logged to `data/scores-data.json` (later re-posts of the same round are ignored) and confirmed with a quiet reaction. Golf scoring: the captured pair is **strokes/par** (e.g. `9/10` is a birdie against par 10), and **lowest wins**. Handicap = average strokes relative to par (negative = under par); because par is captured per round, this stays fair when par varies. Place finishes (🥇🥈🥉) are derived live by ranking each round's participants by to-par (ties share a place; rounds need `minPlayersForMedal` players to count). Rounds logged before par was understood were stored as `max` and are migrated to `par` on load. "Today" = the highest round number recorded. Surfaced via `/putt-today`, `/putt-leaderboard`, `/putt-card`.

**Pattern Config Format (`patterns.json`):**
```json
{
  "patterns": [
    { "pattern": "hello", "type": "react", "emoji": "🇿" },
    { "pattern": "somebody*help", "type": "reply", "message": "I'm here to help!" }
  ]
}
```

Patterns are loaded once at startup — changes to `patterns.json` require a bot restart (or use `npm run dev` for auto-reload). Every root config file behaves this way, and most are cached in a module-level variable on first read.

**Word Count Config Format (`wordcounts.json`):**
```json
{
  "trackedWords": ["christmas", "santa"],
  "milestones": [10, 25, 50, 100],
  "milestoneMessages": ["Krampus has noticed that {user} has said **{word}** {count} times..."]
}
```

Placeholders: `{user}` (mention), `{word}`, `{count}`. Milestones should stay sorted ascending.

**Encounters Config Format (`encounters.json`):**
```json
{
  "chance": 0.02,
  "messages": ["Krampus sees you, {user}. He always sees you."],
  "emojis": ["👹", "⛓️"]
}
```

`chance` is the per-message probability (0–1). Only `{user}` is substituted.

**Smack Config Format (`smack.json`):**
```json
{
  "roleId": "YOUR_ROLE_ID_HERE",
  "durationSeconds": 60,
  "cooldownSeconds": 300,
  "messages": ["Krampus swings his birch rod at {target}! Requested by {user}."]
}
```

`roleId` ships as the literal placeholder, so `/smack` refuses with "The smack role has not been configured yet." until a real role ID is filled in. The bot's own role must sit **above** the punishment role in the server hierarchy or the role assignment fails. Placeholders: `{user}` (attacker), `{target}` (victim).

**Score Tracker Config Format (`scoretrackers.json`):**
```json
{
  "trackers": [
    {
      "id": "puttday",
      "name": "putt.day",
      "pattern": "putt\\.day #(\\d+).*?(\\d+)/(\\d+)",
      "roundGroup": 1, "scoreGroup": 2, "parGroup": 3,
      "direction": "lower",
      "confirmReaction": "⛳",
      "minPlayersForMedal": 2
    }
  ]
}
```

`pattern` is a regex whose capture groups yield the round number, strokes, and par (indices given by `roundGroup`/`scoreGroup`/`parGroup`). `direction: "lower"` means a smaller score is better (golf convention — fewest strokes wins); `"higher"` inverts the ranking for make-count style games. Add another game by appending a tracker entry — no code changes needed, though the golf-named commands stay bound to the `puttday` tracker.
