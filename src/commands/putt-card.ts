import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTracker, computeStats, formatToPar, scoreToPar } from '../utils/scoretracker.js';
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

// Handicap is strokes vs par — under par is good, over par earns the basket.
function flavor(handicap: number): string {
  if (handicap <= -1) return 'Under par. Krampus grudgingly spares you... for now.';
  if (handicap <= 1) return 'Hovering around par. Krampus is unimpressed.';
  return 'Over par. Straight to the naughty list — the birch rod awaits your putter.';
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
  lines.push(`Handicap: **${formatToPar(stats.handicap, 1)}** _(avg strokes vs par)_`);
  if (stats.best) {
    const toPar = scoreToPar(stats.best, tracker.direction);
    lines.push(`Best round: **${formatToPar(toPar)}** _(${stats.best.score} strokes, par ${stats.best.par})_`);
  }
  if (stats.last) {
    const toPar = scoreToPar(stats.last.entry, tracker.direction);
    lines.push(`Last round (#${stats.last.round}): **${formatToPar(toPar)}** _(${stats.last.entry.score} strokes, par ${stats.last.entry.par})_`);
  }
  lines.push(`Medals: ${medalLine(stats.medals)}`);
  lines.push(`_${flavor(stats.handicap)}_`);

  await interaction.reply({ content: lines.join('\n'), flags: 64 });
}
