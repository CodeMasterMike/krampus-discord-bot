# Revenge of Krampus Bot

A Krampus-themed Discord bot. It lurks in your server watching messages — reacting to patterns, counting words you say too often, logging daily putt.day scores, and occasionally making its presence known — and answers a handful of slash commands. Written in TypeScript with discord.js v14 using the Gateway WebSocket API.

## Project Structure

```
src/
  bot.ts                   # Entry point: client setup, event registration, login
  events/
    ready.ts               # ClientReady: command registration + rotating presence
    messageCreate.ts       # Passive message handling (patterns, words, scores, encounters)
    interactionCreate.ts   # Slash command router
  commands/                # One file per slash command
  utils/                   # Config loading, persistence, scoring math, scheduling
  types/index.ts           # Shared type definitions
patterns.json              # Message pattern → react/reply rules
wordcounts.json            # Tracked words, milestones, callout messages
encounters.json            # Random encounter chance, messages, emojis
smack.json                 # Punishment role, duration, cooldown, messages
scoretrackers.json         # Daily score game definitions (putt.day)
data/                      # Persisted counts and scores (gitignored)
```

TypeScript compiles to `dist/`. Config files are read at startup, so edits need a restart.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- A [Discord application](https://discord.com/developers/applications) with a bot

### Discord Developer Portal

1. Go to your app's settings in the [Discord Developer Portal](https://discord.com/developers/applications)
2. Under **Bot > Privileged Gateway Intents**, enable **Message Content Intent**
3. Copy your **App ID**, **Bot Token**, and **Public Key**

### Install and Configure

```bash
npm install
```

Create a `.env` file from the template and fill in your credentials:

```bash
cp .env.example .env
```

### Server-specific IDs

Channel and role IDs are **not** committed. `smack.json` and `scoretrackers.json` are tracked in git, and the deploy runs a plain `git pull` — which refuses to overwrite local edits to a tracked file. Worse, the workflow neither sets `set -e` nor chains its steps, so the build and pm2 restart still run against the *old* code: the deploy goes green having deployed nothing.

So the real IDs go in `.env`, which is gitignored and already how credentials reach the VM:

```bash
PUTT_CALLOUT_CHANNEL_ID=000000000000000000   # daily no-show roll call posts here
SMACK_ROLE_ID=000000000000000001             # role assigned by /smack
```

To find an ID: enable **Developer Mode** (Discord Settings → Advanced → Developer Mode), then right-click the channel or role and choose **Copy Channel ID** / **Copy Role ID**. On mobile, long-press instead. Alternatively the channel URL is `discord.com/channels/<serverId>/<channelId>` — the last number is the channel.

Both are optional. Leave one unset and its feature simply stays off: the roll call logs `scheduler idle` at boot, and `/smack` replies "The smack role has not been configured yet." The committed JSON keeps a placeholder plus the message templates, and the environment wins whenever it holds a real value.

Make sure the bot has **View Channel** and **Send Messages** in the callout channel, and that its own role sits **above** the punishment role in the server hierarchy.

### Run the Bot

```bash
npm run build        # Compile TypeScript to dist/
npm start            # Run the compiled bot
```

For development, skip the build and use auto-reload:

```bash
npm run dev          # tsx + nodemon, reloads on .ts/.json changes
```

Slash commands are registered automatically on startup.

## Add Bot to Your Server

[Click here to invite the bot to your Discord server](https://discord.com/oauth2/authorize?client_id=1457497048331845657&permissions=275146410048&integration_type=0&scope=bot)

## Slash Commands

| Command | Description |
|---------|-------------|
| `/test` | Basic test command to verify the bot is running |
| `/version` | Show the running bot version |
| `/krampus` | Get a random Krampus folklore fact |
| `/8ball [question]` | Ask Krampus's magic 8-ball a question |
| `/smack @user` | Smack a user with Krampus's birch rod (assigns a temporary "punished" role) |
| `/wordcount [user]` | See how often Krampus has caught someone saying tracked words (private reply) |
| `/putt-today` | Today's putt.day scorecard and podium |
| `/putt-month [month]` | This month's tournament standings — totals, penalties, monthly medals |
| `/putt-season` | Every tournament month and its champion |
| `/putt-leaderboard` | All putters ranked by all-time handicap, with medal tallies |
| `/putt-card [user]` | A putter's scorecard — month standing, streak, handicap, medals (private reply) |
| `/putt-help [public]` | Every putt.day rule, generated from the live config (private reply by default) |

### `/smack` — Birch Rod Timeout

Summon Krampus to smack another user with his birch rod. This assigns a configurable "punished" role that is automatically removed after a set duration.

**Setup:**
1. Create a cosmetic role in your Discord server (e.g. "Punished by Krampus")
2. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
3. Go to Server Settings > Roles, right-click the role you created, and click **Copy Role ID**
4. Put the role ID in your `.env` as `SMACK_ROLE_ID=...` (**not** in `smack.json` — see [Server-specific IDs](#server-specific-ids))
5. Ensure the bot's role is **above** the punishment role in the server role hierarchy

**Configuration (`smack.json`):**
```json
{
  "roleId": "YOUR_ROLE_ID_HERE",
  "durationSeconds": 60,
  "cooldownSeconds": 300,
  "messages": [
    "Krampus swings his birch rod at {target}! They have been punished!",
    "{user} calls upon Krampus to smack {target} with the birch rod!"
  ]
}
```

- `roleId` — The Discord role ID to assign to the target
- `durationSeconds` — How long the role lasts before auto-removal
- `cooldownSeconds` — Per-user cooldown between smacks
- `messages` — Random announcement messages (`{user}` = attacker, `{target}` = victim)

**Guards:** Can't smack yourself, can't smack bots, server-only, respects per-user cooldown.

**Note:** `smack.json` ships with `roleId` set to the literal placeholder `YOUR_ROLE_ID_HERE`, and `SMACK_ROLE_ID` is what actually gets read. Until one of them holds a real ID, `/smack` replies "The smack role has not been configured yet." Cooldowns and the pending role removal are held in memory, so restarting the bot clears cooldowns and leaves the role on anyone currently punished.

## Passive Features

The bot watches every message (ignoring other bots) and runs four independent checks. They don't cancel each other out — one message can trigger several.

### Pattern Matching

Patterns are defined in `patterns.json`. The bot checks each incoming message against patterns in order and stops at the first match.

```json
{
  "patterns": [
    { "pattern": "hello", "type": "react", "emoji": "🇿" },
    { "pattern": "somebody*help", "type": "reply", "message": "I'm here to help!" }
  ]
}
```

- **`pattern`** — Text to match. Use `*` as a wildcard (matches any characters). Case-insensitive.
- **`type: "react"`** — Reacts to the message with the specified `emoji`.
- **`type: "reply"`** — Replies to the message with the specified `message`.

### Word Tracking

Krampus keeps a tally of how often each person says the words in `wordcounts.json`, and calls them out publicly when they cross a milestone. Counts persist in `data/wordcounts-data.json` and are queryable with `/wordcount`.

```json
{
  "trackedWords": ["christmas", "santa"],
  "milestones": [10, 25, 50, 100],
  "milestoneMessages": [
    "Krampus has noticed that {user} has said **{word}** {count} times... The chains rattle closer."
  ]
}
```

- **`trackedWords`** — Matched as prefixes, so `kramp` also counts "krampus" and `no` also counts "nothing". Handy for stems, easy to over-match by accident.
- **`milestones`** — Ascending thresholds. Only the highest one crossed by a single message is announced.
- **`milestoneMessages`** — Picked at random. Placeholders: `{user}`, `{word}`, `{count}`.

### Random Encounters

Every message has a small chance of Krampus making himself known — either a reaction or an ominous message. Configured in `encounters.json`:

```json
{
  "chance": 0.02,
  "messages": ["Krampus sees you, {user}. He always sees you."],
  "emojis": ["👹", "⛓️"]
}
```

- **`chance`** — Probability per message (0–1). `0.02` is 2%.
- On a hit, the bot picks a reaction or a message with even odds. `{user}` becomes a mention.

### putt.day Score Tracking

Post your daily putt.day result in chat and Krampus logs it with a quiet ⛳ reaction. The first score you post for a round counts — re-posting the same round is ignored.

Scoring follows golf: the numbers are **strokes/par**, so `9/10` is one under, and **lowest wins**. Your handicap is your average strokes relative to par, which stays fair even when par changes between rounds. Medals (🥇🥈🥉) are awarded per round to the best finishers, as long as enough people played.

Read it back with `/putt-today`, `/putt-month`, `/putt-season`, `/putt-leaderboard`, `/putt-card`, and `/putt-help`.

#### Monthly tournaments

Every calendar month is its own tournament and **resets on the 1st**, in the timezone the tracker declares. All-time stats keep accumulating underneath — `/putt-leaderboard` is unaffected by the reset.

Your month score is **total strokes over total par**: `110/115` means you took 110 strokes on days worth 115, so you finished the month at **-5**. Lowest total to-par wins; ties break on rounds played, then gold medals. Medals are tallied **separately per month**, on top of the all-time count.

#### Missing a day

Skip a scoring day and you are charged the **worst score anyone posted that day, plus 5**. If the day's worst card was `+3`, every no-show takes `+8`. Skipping is therefore always worse than posting a terrible round — the penalty is folded straight into your monthly total, so `110/115` already includes it.

By default, **every day anyone posts a score** becomes a scoring day for everybody. Krampus posts a daily roll call naming the absent, once the callout channel is configured.

#### Round dates and the anchor

Round numbers, not message timestamps, decide which day (and month) a score belongs to. The tracker declares one known round-number/date pair — the **anchor** — and every other round's date is counted from it. That keeps month boundaries correct even when someone posts at 12:30am or backfills a round days late.

Each day's date and par are stored once in a `rounds` index in `data/scores-data.json`, separate from individual scores, so long-term stats can be queried per day without scanning every user.

#### Configuration

Games are defined in `scoretrackers.json`:

```json
{
  "trackers": [
    {
      "id": "puttday",
      "name": "putt.day",
      "pattern": "putt\\.day #(\\d+).*?(\\d+)/(\\d+)",
      "roundGroup": 1,
      "scoreGroup": 2,
      "parGroup": 3,
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
        "hour": 12,
        "minute": 0,
        "messages": ["{users} missed {round} on {date}. **{penalty}** each."],
        "perfectDayMessages": ["Every putter answered the bell for {round}."]
      }
    }
  ]
}
```

**Parsing**

- **`pattern`** — Regex whose capture groups yield the round number, score, and par; `roundGroup`/`scoreGroup`/`parGroup` say which is which.
- **`direction`** — `"lower"` means fewer is better (golf). `"higher"` inverts the ranking for make-count style games.
- **`minPlayersForMedal`** — Rounds with fewer participants than this award no medals.

**Calendar**

- **`anchorRound`** / **`anchorDate`** — One known round-number/date pair. Every other round's date is derived from it. Correcting a wrong anchor is a one-line edit plus a restart — no data migration, since dates are recomputed on load.
- **`timezone`** — IANA zone defining day and month boundaries. Defaults to `America/New_York`.

**Tournament**

- **`missedDayPenaltyStrokes`** — Strokes added to the day's worst to-par to price a no-show. Default `5`.
- **`missedDayFallbackToPar`** — Penalty used if a day somehow has no scores to derive a worst from. Default `5`.
- **`minPlayersForPenaltyDay`** — How many players a day needs before absentees are charged for it. Default `1`, meaning any day someone played counts against everyone. Raise it to soften quiet days.
- **`minRoundsForMonthlyRank`** — Rounds needed in a month to be ranked. Default `1`. Players below it appear under *Not yet qualified*.

**Callout**

- **`channelIdEnv`** — Names the environment variable holding the real channel ID, checked before `channelId`. Named per tracker so two trackers can post to two channels. This is the one you want — see [Server-specific IDs](#server-specific-ids).
- **`channelId`** — Committed fallback, shipping as the literal placeholder `YOUR_CHANNEL_ID_HERE`. The roll call stays idle until either this or the env var holds a real channel ID.
- **`hour`** / **`minute`** — Local time in the tracker's timezone. The scheduler calls out *yesterday's* round, since today's is still in play.
- **`messages`** / **`perfectDayMessages`** — Picked at random. Placeholders: `{users}`, `{count}`, `{round}`, `{date}`, `{penalty}`. Omit `perfectDayMessages` to stay silent when nobody missed.

Adding another daily game is config-only, though the `/putt-*` commands stay bound to the `puttday` tracker.

## Configuration Reload

All config files are read once at startup. Changes to `patterns.json`, `wordcounts.json`, `encounters.json`, `smack.json`, or `scoretrackers.json` require a bot restart (or use `npm run dev` for auto-reload).

## Presence

The bot sets a rotating "custom status" — ominous one-liners like *Counting your sins...* — picked at random on startup and re-rolled every hour. The list lives in `src/events/ready.ts`.

## Deployment

Pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which SSHes into the host VM, pulls, installs, builds, and restarts the bot under pm2. It expects `VM_HOST`, `VM_USER`, and `VM_SSH_KEY` repository secrets. See [docs/azure-vm-setup.md](docs/azure-vm-setup.md) for provisioning the VM.

Since config is read at startup, deploying is also how config changes take effect in production.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project conventions, and how to add new commands or patterns.
