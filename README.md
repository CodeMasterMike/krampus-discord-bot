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
  utils/                   # Config loading, persistence, scoring math
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
| `/putt-leaderboard` | All putters ranked by handicap, with medal tallies |
| `/putt-card [user]` | A putter's scorecard — handicap, best round, medals (private reply) |

### `/smack` — Birch Rod Timeout

Summon Krampus to smack another user with his birch rod. This assigns a configurable "punished" role that is automatically removed after a set duration.

**Setup:**
1. Create a cosmetic role in your Discord server (e.g. "Punished by Krampus")
2. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
3. Go to Server Settings > Roles, right-click the role you created, and click **Copy Role ID**
4. Paste the role ID into `smack.json` under `roleId`
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

**Note:** `smack.json` ships with `roleId` set to the literal placeholder `YOUR_ROLE_ID_HERE`. Until you replace it, `/smack` replies "The smack role has not been configured yet." Cooldowns and the pending role removal are held in memory, so restarting the bot clears cooldowns and leaves the role on anyone currently punished.

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

Read it back with `/putt-today`, `/putt-leaderboard`, and `/putt-card`.

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
      "minPlayersForMedal": 2
    }
  ]
}
```

- **`pattern`** — Regex whose capture groups yield the round number, score, and par; `roundGroup`/`scoreGroup`/`parGroup` say which is which.
- **`direction`** — `"lower"` means fewer is better (golf). `"higher"` inverts the ranking for make-count style games.
- **`minPlayersForMedal`** — Rounds with fewer participants than this award no medals.

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
