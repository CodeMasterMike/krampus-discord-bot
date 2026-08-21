import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTracker, getSeason, formatToPar } from '../utils/scoretracker.js';
import { monthLabel } from '../utils/scoredates.js';

const TRACKER_ID = 'puttday';
const MAX_MONTHS = 12;

export const data = new SlashCommandBuilder()
  .setName('putt-season')
  .setDescription('Every putt.day tournament month and its champion');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply('The putting green is closed — no tracker is configured.');
    return;
  }

  const season = getSeason(TRACKER_ID);
  if (season.length === 0) {
    await interaction.reply('No tournaments have been played yet. Krampus waits.');
    return;
  }

  const lines: string[] = [`🏆 **${tracker.name} — season history**`, ''];

  for (const m of season.slice(0, MAX_MONTHS)) {
    const label = `**${monthLabel(m.month)}**${m.inProgress ? ' _(in progress)_' : ''}`;
    const detail = `${m.scoringDays} day(s) · ${m.players} putter(s)`;

    if (!m.champion) {
      lines.push(`${label} — _no qualified champion_ · ${detail}`);
      continue;
    }

    const c = m.champion;
    const crown = m.inProgress ? '🔸 leading:' : '👑 champion:';
    lines.push(
      `${label} — ${crown} <@${c.userId}> **${c.totalStrokes}/${c.totalPar}** (${formatToPar(c.toPar)})`
    );
    lines.push(`　　_${detail} · winner played ${c.roundsPlayed}, missed ${c.missedDays}_`);
  }

  if (season.length > MAX_MONTHS) {
    lines.push(`_...and ${season.length - MAX_MONTHS} older month(s) in the ledger._`);
  }

  await interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}
