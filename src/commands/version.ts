import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { version } from '../utils/version.js';

export const data = new SlashCommandBuilder()
  .setName('version')
  .setDescription('Show the current bot version');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(`Krampus Bot v${version}`);
}
