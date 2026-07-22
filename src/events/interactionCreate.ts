import { Collection, Events, Interaction } from 'discord.js';
import * as testCommand from '../commands/test.js';
import * as wordcountCommand from '../commands/wordcount.js';
import * as krampusCommand from '../commands/krampus.js';
import * as eightballCommand from '../commands/eightball.js';
import * as smackCommand from '../commands/smack.js';
import * as versionCommand from '../commands/version.js';
import * as puttTodayCommand from '../commands/putt-today.js';
import * as puttLeaderboardCommand from '../commands/putt-leaderboard.js';
import * as puttCardCommand from '../commands/putt-card.js';
import type { BotCommand } from '../types/index.js';

const commands = new Collection<string, BotCommand>();
commands.set(testCommand.data.name, testCommand);
commands.set(wordcountCommand.data.name, wordcountCommand);
commands.set(krampusCommand.data.name, krampusCommand);
commands.set(eightballCommand.data.name, eightballCommand);
commands.set(smackCommand.data.name, smackCommand);
commands.set(versionCommand.data.name, versionCommand);
commands.set(puttTodayCommand.data.name, puttTodayCommand);
commands.set(puttLeaderboardCommand.data.name, puttLeaderboardCommand);
commands.set(puttCardCommand.data.name, puttCardCommand);

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  console.log(`[DEBUG] Slash command received: /${interaction.commandName} by ${interaction.user.tag}`);

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error handling /${interaction.commandName}:`, (error as Error).message);
  }
}
