import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getTracker,
  computeMonth,
  getCurrentMonth,
  getMonths,
  formatToPar
} from '../utils/scoretracker.js';
import { monthLabel, parseMonthInput } from '../utils/scoredates.js';
import type { MonthlyStanding } from '../types/index.js';

const TRACKER_ID = 'puttday';
const MAX_ROWS = 15;

export const data = new SlashCommandBuilder()
  .setName('putt-month')
  .setDescription("This month's putt.day tournament — totals, penalties, and medals")
  .addStringOption(option =>
    option
      .setName('month')
      .setDescription('Which month (e.g. "2026-08", "August 2026"). Defaults to the current one.')
      .setRequired(false)
  );

function medalFor(place: number): string {
  if (place === 1) return '🥇';
  if (place === 2) return '🥈';
  if (place === 3) return '🥉';
  return `**${place}.**`;
}

/** "110/115 (-5)" — the headline tournament figure. */
function totalLine(s: MonthlyStanding): string {
  return `**${s.totalStrokes}/${s.totalPar}** (${formatToPar(s.toPar)})`;
}

function detailLine(s: MonthlyStanding): string {
  const parts = [`${s.roundsPlayed} played`];
  if (s.missedDays > 0) {
    // formatToPar, not a hardcoded '+': on a day where the whole field beat
    // par, worst-plus-five can still be under par, so this figure goes negative.
    parts.push(`${s.missedDays} missed (${formatToPar(s.penaltyStrokes)} to par)`);
  }
  if (s.currentStreak > 1) {
    parts.push(`🔥${s.currentStreak}`);
  }
  const m = s.medals;
  if (m.gold || m.silver || m.bronze) {
    parts.push(`🥇${m.gold} 🥈${m.silver} 🥉${m.bronze}`);
  }
  return parts.join(' · ');
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply('The putting green is closed — no tracker is configured.');
    return;
  }

  const requested = interaction.options.getString('month');
  const month = requested ? parseMonthInput(requested, tracker) : getCurrentMonth(TRACKER_ID);

  if (!month) {
    await interaction.reply({
      content: `Krampus cannot read "${requested}" as a month. Try \`2026-08\` or \`August 2026\`.`,
      flags: 64
    });
    return;
  }

  const tournament = computeMonth(TRACKER_ID, month);
  if (!tournament) {
    const played = getMonths(TRACKER_ID);
    const known = played.length
      ? `Months on record: ${played.map(monthLabel).join(', ')}.`
      : 'No rounds have ever been logged.';
    await interaction.reply(`No putts were logged in **${monthLabel(month)}**. ${known}`);
    return;
  }

  const isCurrent = month === getCurrentMonth(TRACKER_ID);
  const lines: string[] = [
    `🏆 **${tracker.name} — ${monthLabel(month)}**${isCurrent ? ' _(in progress)_' : ''}`,
    `_${tournament.scoringRounds.length} scoring day(s) · total par ${tournament.totalPar}_`,
    ''
  ];

  for (const s of tournament.standings.slice(0, MAX_ROWS)) {
    lines.push(`${medalFor(s.place)} <@${s.userId}> — ${totalLine(s)}`);
    lines.push(`　　_${detailLine(s)}_`);
  }

  if (tournament.standings.length > MAX_ROWS) {
    lines.push(`_...and ${tournament.standings.length - MAX_ROWS} more on the naughty list._`);
  }

  if (tournament.unranked.length > 0) {
    lines.push('');
    lines.push('**Not yet qualified**');
    for (const s of tournament.unranked.slice(0, MAX_ROWS)) {
      lines.push(`· <@${s.userId}> — ${totalLine(s)} _(${s.roundsPlayed} played)_`);
    }
  }

  await interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}
