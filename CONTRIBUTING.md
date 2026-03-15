# Contributing to Revenge of Krampus Bot

Thanks for your interest in contributing! Here's how to get set up and start making changes.

## Local Development Setup

1. **Clone the repo and install dependencies:**
   ```bash
   git clone https://github.com/CodeMasterMike/krampus-bot-dev.git
   cd krampus-bot-dev
   npm install
   ```

2. **Create a Discord application** at the [Discord Developer Portal](https://discord.com/developers/applications):
   - Create a new application
   - Go to **Bot** and click **Reset Token** to get your bot token
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**
   - Copy your **App ID**, **Bot Token**, and **Public Key**

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Fill in the values from step 2.

4. **Invite the bot to a test server:**
   - Go to **OAuth2 > URL Generator** in the Developer Portal
   - Select scopes: `bot`
   - Select permissions: `Send Messages`, `Add Reactions`, `Manage Roles`
   - Open the generated URL to add the bot to your server

5. **Run in development mode:**
   ```bash
   npm run dev
   ```
   This uses nodemon + tsx for auto-reload on file changes.

## Project Conventions

- **TypeScript** — All source code lives in `src/` and compiles to `dist/`.
- **Import extensions** — Always use `.js` extensions in imports, even for `.ts` files. This is required by the `Node16` module resolution.
  ```ts
  // Correct
  import { foo } from './bar.js';
  // Wrong
  import { foo } from './bar';
  ```
- **No test or lint tooling** — Just make sure `npm run typecheck` passes before submitting.

## Adding a New Slash Command

1. **Create the command file** in `src/commands/` (e.g. `src/commands/ping.ts`):
   ```ts
   import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

   export const data = new SlashCommandBuilder()
     .setName('ping')
     .setDescription('Replies with pong');

   export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
     await interaction.reply('Pong!');
   }
   ```

2. **Register it** in `src/events/ready.ts` — import and add to the `commands` array:
   ```ts
   import * as pingCommand from '../commands/ping.js';

   const commands: BotCommand[] = [/* ...existing */, pingCommand];
   ```

3. **Add routing** in `src/events/interactionCreate.ts` — import and add to the Collection:
   ```ts
   import * as pingCommand from '../commands/ping.js';

   commands.set(pingCommand.data.name, pingCommand);
   ```

4. Run `npm run typecheck` to verify everything compiles.

## Adding a New Pattern

Edit `patterns.json` to add message patterns. The bot checks patterns in order and stops at the first match.

```json
{
  "pattern": "hello*world",
  "type": "react",
  "emoji": "👋"
}
```

- `*` is a wildcard (matches any characters)
- `type: "react"` adds an emoji reaction; `type: "reply"` sends a text reply
- Pattern changes require a bot restart (or use `npm run dev` for auto-reload)

## Configuring the Smack Command

The `/smack` command requires a Discord role to assign to "punished" users. See the [README](README.md#smack--birch-rod-timeout) for full setup instructions.

**Quick way to get a role ID:** Enable Developer Mode in Discord (Settings > Advanced > Developer Mode), then right-click the role in Server Settings > Roles and click **Copy Role ID**. Paste it into `smack.json` as the `roleId`.

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run `npm run typecheck` to verify
4. Test with `npm run dev` against a test Discord server
5. Open a pull request against `main`
