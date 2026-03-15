import { ActivityType, Client, Events, REST, Routes } from 'discord.js';
import * as testCommand from '../commands/test.js';
import * as wordcountCommand from '../commands/wordcount.js';
import * as krampusCommand from '../commands/krampus.js';
import * as eightballCommand from '../commands/eightball.js';
import * as smackCommand from '../commands/smack.js';
import * as versionCommand from '../commands/version.js';
import type { BotCommand } from '../types/index.js';
import { version } from '../utils/version.js';

const commands: BotCommand[] = [testCommand, wordcountCommand, krampusCommand, eightballCommand, smackCommand, versionCommand];

const krampusStatuses = [
  'Watching the naughty list...',
  'Rattling chains in the dark...',
  'Sharpening the birch bundle...',
  'Lurking behind the Christmas tree...',
  'Counting your sins...',
  'The bells are getting closer...',
  'Checking who has been bad...',
  'Dragging the basket through the snow...',
  'Whispering your name...',
  'Waiting for Krampusnacht...',
  'Listening at your door...',
  'Polishing the chains...',
  'Stuffing stockings with coal...',
  'Something stirs in the shadows...',
  'You should have been good...',
];

const STATUS_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

function setRandomStatus(client: Client<true>): void {
  const status = krampusStatuses[Math.floor(Math.random() * krampusStatuses.length)];
  client.user.setActivity(status, { type: ActivityType.Custom });
  console.log(`[STATUS] ${status}`);
}

export const name = Events.ClientReady;
export const once = true;

export async function execute(c: Client<true>): Promise<void> {
  console.log(`Krampus Bot v${version} — logged in as ${c.user.tag}`);

  // Start cycling creepy statuses
  setRandomStatus(c);
  setInterval(() => setRandomStatus(c), STATUS_INTERVAL_MS);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.APP_ID!),
      { body: commands.map(cmd => cmd.data.toJSON()) }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}
