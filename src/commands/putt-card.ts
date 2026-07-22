import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTracker, computeStats } from '../utils/scoretracker.js';
import type { MedalCounts } from '../types/index.js';

const TRACKER_ID = 'puttday';

export const data = new SlashCommandBuilder()
  .setName('putt-card')
  .setDescription("Check a putter's scorecard — handicap, average, and medals...")
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The putter to check (defaults to yourself)')
      .setRequired(false)
  );

function medalLine(m: MedalCounts): string {
  return `🥇 ${m.gold}  🥈 ${m.silver}  🥉 ${m.bronze}`;
}

function flavor(handicap: number): string {
  if (handicap <= 2) return 'Krampus grudgingly spares you... for now.';
  if (handicap <= 4) return 'Mediocre. Krampus is unimpressed.';
  return 'Straight to the naughty list. The birch rod awaits your putter.';
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply({ content: 'The putting green is closed — no tracker is configured.', flags: 64 });
    return;
  }

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const stats = computeStats(TRACKER_ID, targetUser.id);

  if (!stats) {
    const emptyMessages = [
      `${targetUser} has never set foot on the green. Krampus notices such cowardice.`,
      `No scorecard for ${targetUser}. Suspiciously untested...`,
      `${targetUser} has putted nothing. Krampus waits with the birch rod.`
    ];
    const msg = emptyMessages[Math.floor(Math.random() * emptyMessages.length)];
    await interaction.reply({ content: msg, flags: 64 });
    return;
  }

  const lines: string[] = [];
  lines.push(`⛳ **Scorecard for <@${targetUser.id}>** — ${tracker.name}`);
  lines.push(`Rounds played: **${stats.rounds}**`);
  lines.push(`Handicap: **${stats.handicap.toFixed(1)}** _(avg missed putts)_`);
  lines.push(`Average: **${stats.average.toFixed(1)}/${stats.max}**`);
  if (stats.best) {
    lines.push(`Best round: **${stats.best.score}/${stats.best.max}**`);
  }
  if (stats.last) {
    lines.push(`Last round: **${stats.last.entry.score}/${stats.last.entry.max}** (#${stats.last.round})`);
  }
  lines.push(`Medals: ${medalLine(stats.medals)}`);
  lines.push(`_${flavor(stats.handicap)}_`);

  await interaction.reply({ content: lines.join('\n'), flags: 64 });
}
