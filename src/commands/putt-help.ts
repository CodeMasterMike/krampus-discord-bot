import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getTracker,
  penaltyStrokes,
  minPlayersForPenaltyDay,
  minRoundsForMonthlyRank
} from '../utils/scoretracker.js';
import { getTimezone } from '../utils/scoredates.js';

const TRACKER_ID = 'puttday';

export const data = new SlashCommandBuilder()
  .setName('putt-help')
  .setDescription('Every rule of the putt.day tournament, straight from the ledger')
  .addBooleanOption(option =>
    option
      .setName('public')
      .setDescription('Post the rules for the whole channel (default: only you)')
      .setRequired(false)
  );

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const tracker = getTracker(TRACKER_ID);
  if (!tracker) {
    await interaction.reply({
      content: 'The putting green is closed — no tracker is configured.',
      flags: 64
    });
    return;
  }

  // Read the live config so the posted rules can never drift from the code.
  const penalty = penaltyStrokes(tracker);
  const penaltyDayMin = minPlayersForPenaltyDay(tracker);
  const qualifyMin = minRoundsForMonthlyRank(tracker);
  const medalMin = tracker.minPlayersForMedal;
  const zone = getTimezone(tracker);

  const dayRule =
    penaltyDayMin <= 1
      ? 'Every day **anyone** posts a score becomes a scoring day for **everybody**.'
      : `A day becomes a scoring day once **${penaltyDayMin} or more** putters post it.`;

  const qualifyRule =
    qualifyMin <= 1
      ? 'One logged round in the month puts you on the board.'
      : `You must log **${qualifyMin} ${plural(qualifyMin, 'round', 'rounds')}** in a month to be ranked; below that you appear under *Not yet qualified*.`;

  const lines = [
    `⛳ **${tracker.name} — the rules**`,
    '',
    '**Logging a score**',
    `· Paste your ${tracker.name} result in chat. Krampus reacts ${tracker.confirmReaction ?? '✅'} once it is recorded.`,
    '· Your **first** post of a given round counts. Re-posting the same round changes nothing.',
    '· The result is read as **strokes/par** — in `9/10`, you took 9 strokes against a par of 10.',
    '',
    '**Scoring**',
    '· Golf rules: **lowest wins**. Your figure is strokes relative to par — `9/10` is **-1**, `12/10` is **+2**, `E` is even.',
    '· Par is recorded per day, so a brutal day never quietly punishes you.',
    '',
    '**Daily medals**',
    `· Each day is ranked by to-par. 🥇🥈🥉 go to the top three, and ties share a place.`,
    `· A day needs **${medalMin} ${plural(medalMin, 'putter', 'putters')}** before any medal is awarded.`,
    '',
    '**The monthly tournament**',
    `· Every calendar month is its own tournament, and it **resets on the 1st** (${zone}).`,
    `· ${dayRule}`,
    '· Your month score is **total strokes / total par** — e.g. `110/115` means **-5** for the month.',
    '· Lowest total to-par wins the month. Ties break on rounds played, then gold medals.',
    `· ${qualifyRule}`,
    '· Medals are tallied **separately per month**, on top of the all-time count.',
    '',
    '**Missing a day**',
    `· Skip a scoring day and you are charged the **worst score posted that day, plus ${penalty}**.`,
    `· So if the day's worst card was **+3**, every no-show takes **+${3 + penalty}**.`,
    '· Skipping is therefore always worse than posting a terrible round. Post the terrible round.',
    '· Penalty strokes are folded into your monthly total, so `110/115` already includes them.',
    '· Krampus posts a daily roll call naming the absent.',
    '',
    '**Commands**',
    '· `/putt-today` — today\'s scorecard and podium',
    '· `/putt-month` — this month\'s tournament (add `month:` for a past one)',
    '· `/putt-season` — every month and its champion',
    '· `/putt-card` — your personal card, streak, and monthly standing',
    '· `/putt-leaderboard` — all-time handicap ranking',
    '· `/putt-help` — this ledger'
  ];

  const isPublic = interaction.options.getBoolean('public') ?? false;
  await interaction.reply({
    content: lines.join('\n'),
    allowedMentions: { parse: [] },
    ...(isPublic ? {} : { flags: 64 as const })
  });
}
