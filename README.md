# Revenge of Krampus Bot

A Discord bot that monitors messages and reacts or replies based on configurable patterns. Built with discord.js v14 using the Gateway WebSocket API.

## Project Structure

```
bot.js                     # Entry point: client setup, event registration, login
src/
  events/
    ready.js               # ClientReady handler + slash command registration
    messageCreate.js        # Message pattern matching handler
    interactionCreate.js    # Slash command router
  commands/
    test.js                 # /test command definition + handler
  utils/
    patterns.js             # patternToRegex() + pattern config loading
patterns.json              # Pattern matching configuration
```

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

Create a `.env` file in the project root:

```
APP_ID=your_app_id
DISCORD_TOKEN=your_bot_token
PUBLIC_KEY=your_public_key
```

### Run the Bot

```bash
npm start            # Run the bot
npm run dev          # Run with auto-reload (nodemon)
```

Slash commands are registered automatically on startup.

## Add Bot to Your Server

[Click here to invite the bot to your Discord server](https://discord.com/oauth2/authorize?client_id=1457497048331845657&permissions=274877974592&integration_type=0&scope=bot)

## Slash Commands

| Command | Description |
|---------|-------------|
| `/test` | Basic test command to verify the bot is running |
| `/krampus` | Summon Krampus for a themed interaction |
| `/8ball` | Ask Krampus's magic 8-ball a question |
| `/smack @user` | Smack a user with Krampus's birch rod (assigns a temporary "punished" role) |

### `/smack` — Birch Rod Timeout

Summon Krampus to smack another user with his birch rod. This assigns a configurable "punished" role that is automatically removed after a set duration.

**Setup:**
1. Create a cosmetic role in your Discord server (e.g. "Punished by Krampus")
2. Copy the role's ID and paste it into `smack.json` under `roleId`
3. Ensure the bot's role is **above** the punishment role in the server role hierarchy

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

**Guards:** Can't smack yourself, can't smack bots, respects per-user cooldown.

## Pattern Configuration

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

Changes to `patterns.json` require a bot restart (or use `npm run dev` for auto-reload).

## Adding a New Slash Command

1. Create a file in `src/commands/` (e.g. `ping.js`):
   ```js
   import { SlashCommandBuilder } from 'discord.js';

   export const data = new SlashCommandBuilder()
     .setName('ping')
     .setDescription('Replies with pong');

   export async function execute(interaction) {
     await interaction.reply('Pong!');
   }
   ```
2. Import it in `src/events/ready.js` and add it to the `commands` array
3. Import it in `src/events/interactionCreate.js` and add it to the `commands` Collection
