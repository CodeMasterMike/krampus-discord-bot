# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Krampus-themed Discord bot with three parts: passive message handling (pattern reactions, word tracking, daily-score logging, random encounters), slash commands (facts, 8-ball, role-timeout "smack", putt.day stats and tournaments), and one scheduled job (the daily no-show roll call). Uses Discord Gateway (WebSocket) via discord.js v14. TypeScript project compiled to `dist/` (`"type": "module"` in package.json).

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

Optional, and **the only correct home for server-specific IDs** (see `src/utils/env.ts`):
- `SMACK_ROLE_ID` - punishment role for `/smack`
- `PUTT_CALLOUT_CHANNEL_ID` - channel the daily no-show roll call posts to

`smack.json` and `scoretrackers.json` are tracked in git and the deploy runs `git pull`, which refuses to overwrite local edits to tracked files — so editing config on the VM breaks every future deploy until it is reverted (`deploy.yml` fails fast and names the files). Keeping IDs in the environment avoids the situation entirely. Each resolves via `resolveId()`: env first, committed config as fallback, and the shipped placeholder counts as unset.

**In production nothing is hand-edited.** The VM's `.env` is regenerated from repository secrets on every deploy, so `.env` there is an artifact, not a source. Add or change a value under Settings > Secrets and variables > Actions. Locally, `.env` is yours to edit.

**Important:** Enable MESSAGE_CONTENT privileged intent in Discord Developer Portal (Bot > Privileged Gateway Intents).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`: SSH to the VM (`VM_HOST`/`VM_USER`/`VM_SSH_KEY` secrets), `git pull --ff-only`, `npm ci`, `npm run build`, then restart under pm2 as `krampus-bot`. Because config JSON is read at startup, a deploy is also what picks up config edits. VM provisioning notes live in `docs/azure-vm-setup.md`.

**The deploy writes `.env` from repository secrets.** `APP_ID`/`DISCORD_TOKEN`/`PUBLIC_KEY` are required and the job fails before writing anything if one is missing, leaving the running bot untouched; `SMACK_ROLE_ID` and `PUTT_CALLOUT_CHANNEL_ID` are optional and written empty when unset, which `resolveId()` reads as "not configured". The file is written to a temp path and renamed so it can never be left half-written, and only key names are ever echoed. Values pass through `printf %s`, so a token containing `$`, backticks, or quotes is written literally — verified round-trip against dotenv.

**The deploy is fail-loud by design.**

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
    putt-month.ts            # /putt-month: monthly tournament standings (public)
    putt-season.ts           # /putt-season: month-by-month champions (public)
    putt-leaderboard.ts      # /putt-leaderboard: all-time handicap ranking (public)
    putt-card.ts             # /putt-card: scorecard + month standing (ephemeral)
    putt-help.ts             # /putt-help: rules built from live config (ephemeral by default)
  utils/
    patterns.ts              # patternToRegex() + loadPatterns() from patterns.json
    wordcounter.ts           # Word tracking, milestone checking, persistence
    scoretracker.ts          # Score parse/persist, handicap, medals, monthly tournaments
    scoredates.ts            # Round<->date anchoring, month keys, timezone-aware "today"
    callout.ts               # Daily no-show roll call scheduler (once-a-minute tick)
    encounters.ts            # Random encounter roll + message formatting
    smack.ts                 # Smack config load, role-ID resolution, in-memory cooldown map
    env.ts                   # resolveId(): env-first ID lookup, placeholder-aware
    version.ts               # Reads version out of package.json

Root config (loaded at startup, restart to pick up edits):
  patterns.json              # Message pattern → react/reply rules
  wordcounts.json            # Tracked words, milestones, callout templates
  encounters.json            # Random encounter chance, messages, emojis
  smack.json                 # Punishment role ID, duration, cooldown, messages
  scoretrackers.json         # Daily-score game definitions (putt.day)

data/                        # Persisted state, gitignored
  wordcounts-data.json
  scores-data.json           # v2: { version, trackers: { <id>: { rounds, users } } }
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
- **Smack** (`smack.ts` command + util) — Assigns the configured role, replies with a random announcement, and removes the role after `durationSeconds` via `setTimeout`. The role ID comes from `getSmackRoleId()`, which reads `SMACK_ROLE_ID` before `smack.json`; the shipped placeholder resolves to null, so `/smack` correctly reports "not configured yet" rather than failing later with a misleading "role not found in this server". Guards: no self-smacks, no bots, guild-only, role must exist, per-user cooldown. Both the cooldown map and the removal timer are **in-memory** — a restart clears cooldowns and strands the role on anyone mid-punishment.
- **Score tracking** (`scoretracker.ts`) — Config-driven score parser (`scoretrackers.json`) for daily-puzzle games like putt.day. On each message, runs every tracker's regex; the first submission of a given round number per user is logged to `data/scores-data.json` (later re-posts of the same round are ignored) and confirmed with a quiet reaction. Golf scoring: the captured pair is **strokes/par** (e.g. `9/10` is a birdie against par 10), and **lowest wins**. Handicap = average strokes relative to par (negative = under par); because par is captured per round, this stays fair when par varies. Place finishes (🥇🥈🥉) are derived live by ranking each round's participants by to-par (ties share a place; rounds need `minPlayersForMedal` players to count). "Today" = the highest round number recorded. Surfaced via `/putt-today`, `/putt-leaderboard`, `/putt-card`.
- **Round dates** (`scoredates.ts`) — Round numbers, not message timestamps, decide which calendar day (and month) a score belongs to. A tracker declares one known `anchorRound`/`anchorDate` pair and every other round's date is counted from it, so a 12:30am post or a late backfill still lands on its real day. Arithmetic runs on bare `YYYY-MM-DD` strings through UTC, so DST never shifts a date; the tracker's `timezone` is only consulted for "what is today". Dates are **recomputed on every load**, so fixing a wrong anchor is a config edit plus a restart — no data migration.
- **Monthly tournaments** (`scoretracker.ts` → `computeMonth()`) — Each calendar month is its own tournament, resetting on the 1st in the tracker's timezone; all-time stats are untouched by the reset. Scoring days are every round in the month that anyone logged. Missing one costs the **worst to-par posted that day plus `missedDayPenaltyStrokes`** (default 5), so skipping is always worse than posting the day's worst card. A day only charges absentees once `minPlayersForPenaltyDay` players logged it (default 1 — any day someone played counts against everyone); below that threshold the day is excluded from absentees' par as well as their score, so totals stay self-consistent. Month score is **total strokes / total par** (`110/115` = -5), ranked lowest-first, ties broken by rounds played then golds. Medals are tallied separately per month. Players below `minRoundsForMonthlyRank` (default 1) land in `unranked`. Surfaced via `/putt-month`, `/putt-season`, `/putt-card`, `/putt-help`.
- **No-show callout** (`callout.ts`) — The only feature not driven by an incoming message, so it runs on a timer. Ticks once a minute and compares the tracker's **local** wall clock to the configured `hour`/`minute` — cheaper than a timezone-aware delay and immune to DST, since each tick re-reads local time. Calls out *yesterday's* round (today's is still in play). The last callout date is persisted to `lastCalloutDate`, so a restart never reposts and an outage past the hour still posts once the bot returns; the stamp is written **before** sending so a failed send can't retry-storm for the rest of the day. Stays idle until a real channel resolves — normally from `PUTT_CALLOUT_CHANNEL_ID`, since `callout.channelIdEnv` names the variable per tracker so two trackers can post to two channels.

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

`roleId` is the committed fallback and ships as a placeholder; the real ID belongs in `SMACK_ROLE_ID`, since this file is tracked (see **Environment Setup**). With neither set, `/smack` refuses with "The smack role has not been configured yet." The bot's own role must sit **above** the punishment role in the server hierarchy or the role assignment fails. Placeholders: `{user}` (attacker), `{target}` (victim).

**Score Tracker Config Format (`scoretrackers.json`):**
```json
{
  "trackers": [
    {
      "id": "puttday",
      "name": "putt.day",
      "pattern": "putt\.day #(\d+).*?(\d+)/(\d+)",
      "roundGroup": 1, "scoreGroup": 2, "parGroup": 3,
      "direction": "lower",
      "confirmReaction": "⛳",
      "minPlayersForMedal": 2,

      "anchorRound": 70,
      "anchorDate": "2026-07-21",
      "timezone": "America/New_York",

      "missedDayPenaltyStrokes": 5,
      "missedDayFallbackToPar": 5,
      "minPlayersForPenaltyDay": 1,
      "minRoundsForMonthlyRank": 1,

      "callout": {
        "enabled": true,
        "channelId": "YOUR_CHANNEL_ID_HERE",
        "channelIdEnv": "PUTT_CALLOUT_CHANNEL_ID",
        "hour": 12, "minute": 0,
        "messages": ["{users} missed {round} on {date}. **{penalty}** each."],
        "perfectDayMessages": ["Every putter answered the bell for {round}."]
      }
    }
  ]
}
```

`pattern` is a regex whose capture groups yield the round number, strokes, and par (indices given by `roundGroup`/`scoreGroup`/`parGroup`). `direction: "lower"` means a smaller score is better (golf convention — fewest strokes wins); `"higher"` inverts the ranking for make-count style games. Add another game by appending a tracker entry — no code changes needed, though the golf-named commands stay bound to the `puttday` tracker.

Everything below `minPlayersForMedal` is optional and defaults as shown, so a pre-tournament tracker config keeps working:

- `anchorRound`/`anchorDate` — the known round-number/date pair all other dates are derived from. **Without an anchor there is no calendar**, so `roundToDate()` returns null and rounds fall back to the date the message landed — monthly play degrades but does not crash.
- `timezone` — IANA zone for day/month boundaries (default `America/New_York`).
- `missedDayPenaltyStrokes` (5) — strokes added to the day's worst to-par to price a no-show.
- `missedDayFallbackToPar` (5) — penalty when a day has no scores to derive a worst from (only reachable via hand-edited data).
- `minPlayersForPenaltyDay` (1) — players a day needs before absentees are charged for it.
- `minRoundsForMonthlyRank` (1) — rounds needed in a month to be ranked rather than `unranked`.
- `callout` — daily roll call. `channelIdEnv` names the env var holding the real channel ID and is checked first; `channelId` is the committed fallback, shipping as the literal `YOUR_CHANNEL_ID_HERE`. The scheduler stays idle until one of them resolves. Placeholders: `{users}` `{count}` `{round}` `{date}` `{penalty}`.

**Score Data Format (`data/scores-data.json`, v2):**
```json
{
  "version": 2,
  "trackers": {
    "puttday": {
      "rounds": { "70": { "date": "2026-07-21", "par": 10, "firstSeenAt": "..." } },
      "users": { "<userId>": { "username": "...", "rounds": { "70": { "score": 6, "par": 10, "recordedAt": "..." } } } },
      "lastCalloutDate": "2026-08-19"
    }
  }
}
```

The `rounds` index holds each day's date and par independent of who played, so long-term per-day stats never require scanning every user. Two migrations run on load, both idempotent: the pre-v2 shape `{ [trackerId]: { [userId]: ... } }` is nested under `trackers`, and rounds logged before par was understood (stored as `max`) become `par`. `migrateScoreDataFile()` is called once from `ready.ts` so the file is rewritten at boot even if nobody posts a score.