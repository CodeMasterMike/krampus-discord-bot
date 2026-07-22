import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTracker, getLatestRound, computeRoundPlacings, formatToPar } from '../utils/scoretracker.js';

const TRACKER_ID = 'puttday';

export const data = new SlashCommandBuilder()
  .setName('putt-today')
  .setDescription("Show today's putt.day scores and the podium");

function medalFor(place: number): string {
  if (place === 1) return '🥇';
  if (place === 2) return '🥈';
  if (place === 3) return '🥉';
  return `**${place}.**`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply('The putting green is closed — no tracker is configured.');
    return;
  }

  const round = getLatestRound(TRACKER_ID);
  if (!round) {
    await interaction.reply('No putts have been logged yet. The green is empty and Krampus grows restless...');
    return;
  }

  const placings = computeRoundPlacings(TRACKER_ID, round);
  const lines: string[] = [`⛳ **${tracker.name} #${round} — today's scorecard** _(lowest score wins)_`];

  for (const p of placings) {
    lines.push(`${medalFor(p.place)} <@${p.userId}> — **${formatToPar(p.toPar)}** _(${p.score} strokes, par ${p.par})_`);
  }

  if (placings.length < tracker.minPlayersForMedal) {
    const need = tracker.minPlayersForMedal;
    lines.push(`_Only ${placings.length} putter so far — no medals until ${need} play._`);
  }

  await interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}
