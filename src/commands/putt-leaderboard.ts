import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTracker, getLeaderboard, formatToPar } from '../utils/scoretracker.js';

const TRACKER_ID = 'puttday';
const MAX_ROWS = 15;

export const data = new SlashCommandBuilder()
  .setName('putt-leaderboard')
  .setDescription('Rank the putters by handicap, with medal tallies');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply('The putting green is closed — no tracker is configured.');
    return;
  }

  const board = getLeaderboard(TRACKER_ID);
  if (board.length === 0) {
    await interaction.reply('No putts logged yet. Krampus has no one to punish... yet.');
    return;
  }

  const lines: string[] = [`⛳ **${tracker.name} leaderboard** — lowest handicap wins`];

  board.slice(0, MAX_ROWS).forEach((e, i) => {
    const medals = `🥇${e.medals.gold} 🥈${e.medals.silver} 🥉${e.medals.bronze}`;
    lines.push(
      `**${i + 1}.** <@${e.userId}> — hcp **${formatToPar(e.handicap, 1)}** · ${e.rounds} rounds · ${medals}`
    );
  });

  if (board.length > MAX_ROWS) {
    lines.push(`_...and ${board.length - MAX_ROWS} more sinners on the naughty list._`);
  }

  await interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}
