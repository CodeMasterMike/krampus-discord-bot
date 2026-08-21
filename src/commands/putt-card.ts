import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getTracker,
  computeStats,
  formatToPar,
  scoreToPar,
  getCurrentMonth,
  getMonthlyStanding
} from '../utils/scoretracker.js';
import { monthLabel } from '../utils/scoredates.js';
import type { MedalCounts } from '../types/index.js';

const TRACKER_ID = 'puttday';

export const data = new SlashCommandBuilder()
  .setName('putt-card')
  .setDescription("Check a putter's scorecard — handicap, month standing, streak, and medals...")
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

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
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

  // --- This month's tournament ---
  const month = getCurrentMonth(TRACKER_ID);
  const standing = getMonthlyStanding(TRACKER_ID, month, targetUser.id);

  lines.push('');
  lines.push(`**${monthLabel(month)} tournament**`);
  if (standing) {
    const rank = standing.qualified ? ordinal(standing.place) : 'unqualified';
    lines.push(
      `Total: **${standing.totalStrokes}/${standing.totalPar}** (${formatToPar(standing.toPar)}) — ${rank}`
    );
    lines.push(`Played **${standing.roundsPlayed}** · missed **${standing.missedDays}**` +
      (standing.penaltyStrokes > 0 ? ` _(+${standing.penaltyStrokes} in penalties)_` : ''));
    lines.push(`Streak: **${standing.currentStreak}** 🔥 _(best this month: ${standing.longestStreak})_`);
    lines.push(`Month medals: ${medalLine(standing.medals)}`);
  } else {
    lines.push('_No rounds this month. Krampus is already sharpening the birch rod._');
  }

  // --- All-time ---
  lines.push('');
  lines.push('**All time**');
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
