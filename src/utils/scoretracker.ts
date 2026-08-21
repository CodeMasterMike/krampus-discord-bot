import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ScoreTracker,
  ScoreTrackersFile,
  ScoreDataFile,
  LegacyScoreData,
  TrackerData,
  RoundEntry,
  RoundInfo,
  ScoreStats,
  MedalCounts,
  RoundPlacing,
  LeaderboardEntry,
  MonthlyDay,
  MonthlyStanding,
  MonthlyTournament,
  MonthSummary,
  NoShowReport
} from '../types/index.js';
import { roundToDate, monthOf, currentMonth, todayInZone, getTimezone } from './scoredates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const configPath = join(projectRoot, 'scoretrackers.json');
const dataDir = join(projectRoot, 'data');
const dataPath = join(dataDir, 'scores-data.json');

/** Current on-disk schema version for data/scores-data.json. */
export const DATA_VERSION = 2;

// Defaults for the optional monthly-tournament knobs, so a tracker config
// that predates this feature keeps working untouched.
const DEFAULT_PENALTY_STROKES = 5;
const DEFAULT_FALLBACK_TO_PAR = 5;
const DEFAULT_MIN_PLAYERS_FOR_PENALTY = 1;
const DEFAULT_MIN_ROUNDS_FOR_RANK = 1;

export const penaltyStrokes = (t: ScoreTracker): number =>
  t.missedDayPenaltyStrokes ?? DEFAULT_PENALTY_STROKES;
export const fallbackToPar = (t: ScoreTracker): number =>
  t.missedDayFallbackToPar ?? DEFAULT_FALLBACK_TO_PAR;
export const minPlayersForPenaltyDay = (t: ScoreTracker): number =>
  t.minPlayersForPenaltyDay ?? DEFAULT_MIN_PLAYERS_FOR_PENALTY;
export const minRoundsForMonthlyRank = (t: ScoreTracker): number =>
  t.minRoundsForMonthlyRank ?? DEFAULT_MIN_ROUNDS_FOR_RANK;

// Cached config loaded once at startup
let cachedConfig: ScoreTrackersFile | null = null;

export function loadScoreTrackerConfig(): ScoreTrackersFile {
  if (!cachedConfig) {
    cachedConfig = JSON.parse(readFileSync(configPath, 'utf8')) as ScoreTrackersFile;
  }
  return cachedConfig;
}

export function getTrackers(): ScoreTracker[] {
  return loadScoreTrackerConfig().trackers;
}

export function getTracker(id: string): ScoreTracker | null {
  return getTrackers().find(t => t.id === id) ?? null;
}

// --- Persistence -------------------------------------------------------

// Rounds logged before the second captured number was understood to be par
// stored it as `max`. Normalised on load so old rounds keep counting.
type LegacyRoundEntry = Omit<RoundEntry, 'par'> & { par?: number; max?: number };

function emptyTrackerData(): TrackerData {
  return { rounds: {}, users: {} };
}

/**
 * Fill in the per-day rounds index from user entries. Used when migrating v1
 * data, which stored par only per-user, and to heal rounds that predate the
 * index. The earliest submission of a round defines its par.
 */
function backfillRoundsIndex(trackerId: string, data: TrackerData): void {
  const tracker = getTracker(trackerId);

  for (const userData of Object.values(data.users)) {
    for (const [round, entry] of Object.entries(userData.rounds)) {
      const existing = data.rounds[round];
      if (existing && existing.firstSeenAt <= entry.recordedAt) continue;

      const date = tracker ? roundToDate(round, tracker) : null;
      data.rounds[round] = {
        // Without an anchor there is no calendar, so fall back to the day the
        // message landed. Adding an anchor later corrects it on next load.
        date: date ?? entry.recordedAt.slice(0, 10),
        par: entry.par,
        firstSeenAt: entry.recordedAt
      };
    }
  }
}

/** True when the parsed JSON is the pre-v2 `{ [trackerId]: { [userId]: ... } }`. */
function isLegacy(raw: unknown): raw is LegacyScoreData {
  return typeof raw === 'object' && raw !== null && !('version' in raw);
}

function migrateShape(raw: unknown): ScoreDataFile {
  if (!isLegacy(raw)) {
    const file = raw as ScoreDataFile;
    file.trackers ??= {};
    return file;
  }

  const file: ScoreDataFile = { version: DATA_VERSION, trackers: {} };
  for (const [trackerId, users] of Object.entries(raw)) {
    const td = emptyTrackerData();
    td.users = users;
    file.trackers[trackerId] = td;
  }
  return file;
}

export function loadScoreData(): ScoreDataFile {
  if (!existsSync(dataPath)) {
    return { version: DATA_VERSION, trackers: {} };
  }

  const data = migrateShape(JSON.parse(readFileSync(dataPath, 'utf8')) as unknown);
  data.version = DATA_VERSION;

  for (const [trackerId, td] of Object.entries(data.trackers)) {
    td.rounds ??= {};
    td.users ??= {};

    for (const userData of Object.values(td.users)) {
      for (const entry of Object.values(userData.rounds)) {
        const legacy = entry as LegacyRoundEntry;
        if (legacy.par === undefined && legacy.max !== undefined) {
          legacy.par = legacy.max;
        }
        delete legacy.max;
      }
    }

    backfillRoundsIndex(trackerId, td);
  }

  return data;
}

export function saveScoreData(data: ScoreDataFile): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  data.version = DATA_VERSION;
  writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Read, migrate, and write back once at startup so the on-disk file matches
 * the current schema even if nobody posts a score. Returns whether anything
 * changed. Safe to call repeatedly.
 */
export function migrateScoreDataFile(): boolean {
  if (!existsSync(dataPath)) return false;
  const before = readFileSync(dataPath, 'utf8').trim();
  const data = loadScoreData();
  if (before === JSON.stringify(data, null, 2).trim()) return false;
  saveScoreData(data);
  return true;
}

function trackerData(trackerId: string): TrackerData | null {
  return loadScoreData().trackers[trackerId] ?? null;
}

/** Local date the no-show callout last ran for a tracker. */
export function getLastCalloutDate(trackerId: string): string | null {
  return trackerData(trackerId)?.lastCalloutDate ?? null;
}

/**
 * Stamp the callout as done for a local date. Persisted so a restart doesn't
 * repost the same roll call.
 */
export function setLastCalloutDate(trackerId: string, date: string): void {
  const data = loadScoreData();
  data.trackers[trackerId] ??= emptyTrackerData();
  data.trackers[trackerId].lastCalloutDate = date;
  saveScoreData(data);
}

// --- Parsing and recording ---------------------------------------------

export interface ParsedScore {
  round: string;
  score: number;
  par: number;
}

/**
 * Run a tracker's regex against message content and pull out the round
 * number, strokes, and par via the configured capture-group indices.
 * Returns null if the message doesn't match.
 */
export function parseScore(content: string, tracker: ScoreTracker): ParsedScore | null {
  const regex = new RegExp(tracker.pattern, 'i');
  const match = content.match(regex);
  if (!match) return null;

  const round = match[tracker.roundGroup];
  const score = Number(match[tracker.scoreGroup]);
  const par = Number(match[tracker.parGroup]);

  if (round === undefined || Number.isNaN(score) || Number.isNaN(par)) {
    return null;
  }
  return { round, score, par };
}

export type RecordResult = 'recorded' | 'duplicate';

/**
 * Persist a user's round result. First submission of a given round number
 * wins — later posts of the same round are ignored ('duplicate'). Also
 * records the day itself (date + par) in the tracker's rounds index.
 */
export function recordScore(
  trackerId: string,
  userId: string,
  username: string,
  parsed: ParsedScore
): RecordResult {
  const data = loadScoreData();
  const tracker = getTracker(trackerId);

  data.trackers[trackerId] ??= emptyTrackerData();
  const td = data.trackers[trackerId];

  td.users[userId] ??= { username, rounds: {} };
  td.users[userId].username = username;

  const rounds = td.users[userId].rounds;
  if (rounds[parsed.round]) {
    return 'duplicate';
  }

  const recordedAt = new Date().toISOString();
  rounds[parsed.round] = { score: parsed.score, par: parsed.par, recordedAt };

  // First sighting of a round defines that day's date and par.
  if (!td.rounds[parsed.round]) {
    const date = tracker ? roundToDate(parsed.round, tracker) : null;
    td.rounds[parsed.round] = {
      date: date ?? recordedAt.slice(0, 10),
      par: parsed.par,
      firstSeenAt: recordedAt
    };
  }

  saveScoreData(data);
  return 'recorded';
}

// --- Scoring primitives ------------------------------------------------

/**
 * A single lower-is-better figure used for ranking, handicap, and best/worst.
 * Golf ('lower'): strokes relative to par, so -2 beats +1. Because par is
 * captured per round, this stays fair when par varies between rounds.
 * Make-count games ('higher'): putts missed out of the max.
 */
export function scoreToPar(
  entry: { score: number; par: number },
  direction: 'higher' | 'lower'
): number {
  return direction === 'higher' ? entry.par - entry.score : entry.score - entry.par;
}

/** Inverse of scoreToPar: the raw stroke count a to-par figure represents. */
export function toParToScore(toPar: number, par: number, direction: 'higher' | 'lower'): number {
  return direction === 'higher' ? par - toPar : par + toPar;
}

/** Format a to-par figure the way golf does: E, -2, +3. */
export function formatToPar(value: number, decimals = 0): string {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return 'E';
  const text = rounded.toFixed(decimals);
  return rounded > 0 ? `+${text}` : text;
}

interface Participant {
  userId: string;
  username: string;
  score: number;
  par: number;
  toPar: number;
}

/**
 * Assign 1-indexed places to a list already sorted best-first. Ties share a
 * place (competition ranking: -2, -2, +1 → places 1, 1, 3).
 */
function placesFor<T>(sorted: T[], keyOf: (item: T) => number): number[] {
  let place = 0;
  let prev: number | null = null;

  return sorted.map((item, i) => {
    const key = keyOf(item);
    if (prev === null || key !== prev) {
      place = i + 1;
      prev = key;
    }
    return place;
  });
}

/** Rank participants best-first and assign places. */
function assignPlaces(participants: Participant[]): RoundPlacing[] {
  const sorted = [...participants].sort((a, b) => a.toPar - b.toPar);
  const places = placesFor(sorted, p => p.toPar);
  return sorted.map((p, i) => ({ ...p, place: places[i] }));
}

/** Every recorded result for one round, as participants. */
function participantsForRound(td: TrackerData, tracker: ScoreTracker, round: string): Participant[] {
  const out: Participant[] = [];
  for (const [userId, userData] of Object.entries(td.users)) {
    const entry = userData.rounds[round];
    if (!entry) continue;
    out.push({
      userId,
      username: userData.username,
      score: entry.score,
      par: entry.par,
      toPar: scoreToPar(entry, tracker.direction)
    });
  }
  return out;
}

/** Group every recorded result by round number, in one pass. */
function groupByRound(td: TrackerData, tracker: ScoreTracker): Record<string, Participant[]> {
  const rounds: Record<string, Participant[]> = {};
  for (const [userId, userData] of Object.entries(td.users)) {
    for (const [round, entry] of Object.entries(userData.rounds)) {
      (rounds[round] ??= []).push({
        userId,
        username: userData.username,
        score: entry.score,
        par: entry.par,
        toPar: scoreToPar(entry, tracker.direction)
      });
    }
  }
  return rounds;
}

const emptyMedals = (): MedalCounts => ({ gold: 0, silver: 0, bronze: 0 });

function tallyMedals(target: Record<string, MedalCounts>, placings: RoundPlacing[]): void {
  for (const p of placings) {
    target[p.userId] ??= emptyMedals();
    if (p.place === 1) target[p.userId].gold++;
    else if (p.place === 2) target[p.userId].silver++;
    else if (p.place === 3) target[p.userId].bronze++;
  }
}

// --- Round queries -----------------------------------------------------

/** The highest round number recorded for a tracker — i.e. "today". */
export function getLatestRound(trackerId: string): string | null {
  const td = trackerData(trackerId);
  if (!td) return null;

  let latest: number | null = null;
  for (const round of Object.keys(td.rounds)) {
    const n = Number(round);
    if (Number.isFinite(n) && (latest === null || n > latest)) latest = n;
  }
  return latest === null ? null : String(latest);
}

/** Date and par for a round, if it has been seen. */
export function getRoundInfo(trackerId: string, round: string): RoundInfo | null {
  return trackerData(trackerId)?.rounds[round] ?? null;
}

/** The round played on a given date, if it was recorded. */
export function getRoundByDate(trackerId: string, date: string): string | null {
  const td = trackerData(trackerId);
  if (!td) return null;
  const hit = Object.entries(td.rounds).find(([, info]) => info.date === date);
  return hit ? hit[0] : null;
}

/** Today's date in the tracker's timezone. */
export function trackerToday(trackerId: string): string {
  const tracker = getTracker(trackerId);
  return todayInZone(tracker ? getTimezone(tracker) : 'UTC');
}

/** All participants of a single round, ranked with places. */
export function computeRoundPlacings(trackerId: string, round: string): RoundPlacing[] {
  const tracker = getTracker(trackerId);
  const td = trackerData(trackerId);
  if (!tracker || !td) return [];

  const participants = participantsForRound(td, tracker, round);
  return participants.length === 0 ? [] : assignPlaces(participants);
}

/**
 * Tally gold/silver/bronze finishes for every user across all time. Only
 * rounds with at least `minPlayersForMedal` players count.
 */
export function computeAllMedals(trackerId: string): Record<string, MedalCounts> {
  const tracker = getTracker(trackerId);
  const td = trackerData(trackerId);
  const result: Record<string, MedalCounts> = {};
  if (!tracker || !td) return result;

  for (const participants of Object.values(groupByRound(td, tracker))) {
    if (participants.length < tracker.minPlayersForMedal) continue;
    tallyMedals(result, assignPlaces(participants));
  }
  return result;
}

// --- Monthly tournament ------------------------------------------------

/** Rounds belonging to a month, ascending. */
function roundsInMonth(td: TrackerData, month: string): string[] {
  return Object.entries(td.rounds)
    .filter(([, info]) => monthOf(info.date) === month)
    .map(([round]) => round)
    .sort((a, b) => Number(a) - Number(b));
}

/** Every month that has at least one recorded round, ascending. */
export function getMonths(trackerId: string): string[] {
  const td = trackerData(trackerId);
  if (!td) return [];

  const months = new Set<string>();
  for (const info of Object.values(td.rounds)) {
    months.add(monthOf(info.date));
  }
  return [...months].sort();
}

/** A day of the month, with everyone who logged it and what a miss costs. */
interface ScoringDay {
  round: string;
  date: string;
  par: number;
  byUser: Map<string, Participant>;
  /** Whether absentees are charged for this day at all. */
  penalises: boolean;
  /** Worst to-par posted that day, plus the configured penalty strokes. */
  penaltyToPar: number;
}

function buildScoringDays(
  td: TrackerData,
  tracker: ScoreTracker,
  rounds: string[]
): ScoringDay[] {
  const threshold = minPlayersForPenaltyDay(tracker);

  return rounds.map(round => {
    const info = td.rounds[round];
    const participants = participantsForRound(td, tracker, round);
    const worstToPar = participants.length
      ? Math.max(...participants.map(p => p.toPar))
      : fallbackToPar(tracker);

    return {
      round,
      date: info.date,
      par: info.par,
      byUser: new Map(participants.map(p => [p.userId, p])),
      penalises: participants.length >= threshold,
      penaltyToPar: worstToPar + penaltyStrokes(tracker)
    };
  });
}

/**
 * Build one month's tournament.
 *
 * Scoring days are every round of the month that anyone logged. A day charges
 * absentees once at least `minPlayersForPenaltyDay` players logged it
 * (default 1 — so any day someone played counts against everyone else). A
 * no-show is charged the worst to-par posted that day plus
 * `missedDayPenaltyStrokes`, which is what keeps the monthly total honest:
 * skipping is always worse than posting the day's worst card.
 *
 * Returns null when the tracker or month has no data.
 */
export function computeMonth(trackerId: string, month: string): MonthlyTournament | null {
  const tracker = getTracker(trackerId);
  const td = trackerData(trackerId);
  if (!tracker || !td) return null;

  const scoringRounds = roundsInMonth(td, month);
  if (scoringRounds.length === 0) return null;

  const days = buildScoringDays(td, tracker, scoringRounds);

  // Everyone who logged at least one round this month is in the tournament.
  const roster = new Map<string, string>();
  for (const day of days) {
    for (const p of day.byUser.values()) roster.set(p.userId, p.username);
  }
  if (roster.size === 0) return null;

  // Monthly medals: same rules as all-time, scoped to this month's days.
  const medals: Record<string, MedalCounts> = {};
  for (const day of days) {
    const participants = [...day.byUser.values()];
    if (participants.length < tracker.minPlayersForMedal) continue;
    tallyMedals(medals, assignPlaces(participants));
  }

  const minRounds = minRoundsForMonthlyRank(tracker);
  const built: MonthlyStanding[] = [];

  for (const [userId, username] of roster) {
    const dayResults: MonthlyDay[] = [];
    let roundsPlayed = 0;
    let missedDays = 0;
    let penaltyTotal = 0;
    let longestStreak = 0;
    let run = 0;

    for (const day of days) {
      const played = day.byUser.get(userId);

      if (played) {
        roundsPlayed++;
        run++;
        longestStreak = Math.max(longestStreak, run);
        dayResults.push({
          round: day.round,
          date: day.date,
          par: day.par,
          score: played.score,
          toPar: played.toPar,
          played: true
        });
        continue;
      }

      // A day below the penalty threshold doesn't apply to absentees at all:
      // it is neither counted in their par nor charged against them.
      if (!day.penalises) continue;

      run = 0;
      missedDays++;
      penaltyTotal += day.penaltyToPar;
      dayResults.push({
        round: day.round,
        date: day.date,
        par: day.par,
        score: toParToScore(day.penaltyToPar, day.par, tracker.direction),
        toPar: day.penaltyToPar,
        played: false
      });
    }

    built.push({
      userId,
      username,
      roundsPlayed,
      missedDays,
      totalStrokes: dayResults.reduce((sum, d) => sum + d.score, 0),
      totalPar: dayResults.reduce((sum, d) => sum + d.par, 0),
      toPar: dayResults.reduce((sum, d) => sum + d.toPar, 0),
      penaltyStrokes: penaltyTotal,
      medals: medals[userId] ?? emptyMedals(),
      currentStreak: run,
      longestStreak,
      qualified: roundsPlayed >= minRounds,
      place: 0,
      days: dayResults
    });
  }

  // Lowest total to-par wins; break ties by more rounds played, then golds.
  const byScore = (a: MonthlyStanding, b: MonthlyStanding) =>
    a.toPar - b.toPar || b.roundsPlayed - a.roundsPlayed || b.medals.gold - a.medals.gold;

  const standings = built.filter(s => s.qualified).sort(byScore);
  const places = placesFor(standings, s => s.toPar);
  standings.forEach((s, i) => {
    s.place = places[i];
  });

  return {
    month,
    scoringRounds,
    totalPar: days.reduce((sum, d) => sum + d.par, 0),
    standings,
    unranked: built.filter(s => !s.qualified).sort(byScore)
  };
}

/** The month currently being played, per the tracker's timezone. */
export function getCurrentMonth(trackerId: string): string {
  const tracker = getTracker(trackerId);
  return tracker ? currentMonth(tracker) : new Date().toISOString().slice(0, 7);
}

/** One summary line per month played, newest first. */
export function getSeason(trackerId: string): MonthSummary[] {
  const active = getCurrentMonth(trackerId);

  return getMonths(trackerId)
    .map((month): MonthSummary | null => {
      const t = computeMonth(trackerId, month);
      if (!t) return null;
      return {
        month,
        scoringDays: t.scoringRounds.length,
        players: t.standings.length + t.unranked.length,
        champion: t.standings[0] ?? null,
        inProgress: month === active
      };
    })
    .filter((m): m is MonthSummary => m !== null)
    .reverse();
}

/** A single player's standing in a month, or null if they didn't play it. */
export function getMonthlyStanding(
  trackerId: string,
  month: string,
  userId: string
): MonthlyStanding | null {
  const t = computeMonth(trackerId, month);
  if (!t) return null;
  return [...t.standings, ...t.unranked].find(s => s.userId === userId) ?? null;
}

/**
 * Who failed to log a given round. "Expected" is everyone active in that
 * round's month — the same roster the tournament penalises. Returns null if
 * the round is unknown or too quiet to levy penalties.
 */
export function computeNoShows(trackerId: string, round: string): NoShowReport | null {
  const tracker = getTracker(trackerId);
  const td = trackerData(trackerId);
  if (!tracker || !td) return null;

  const info = td.rounds[round];
  if (!info) return null;

  const participants = participantsForRound(td, tracker, round);
  if (participants.length < minPlayersForPenaltyDay(tracker)) return null;

  const t = computeMonth(trackerId, monthOf(info.date));
  if (!t) return null;

  const played = new Set(participants.map(p => p.userId));
  const roster = [...t.standings, ...t.unranked].map(s => ({
    userId: s.userId,
    username: s.username
  }));

  return {
    round,
    date: info.date,
    par: info.par,
    expected: roster,
    noShows: roster.filter(r => !played.has(r.userId)),
    penaltyToPar: Math.max(...participants.map(p => p.toPar)) + penaltyStrokes(tracker)
  };
}

// --- All-time stats ----------------------------------------------------

/**
 * Golf handicap: average strokes relative to par. Negative means you
 * average under par. Averaging the per-round to-par figure (rather than
 * raw strokes) keeps it fair when par differs between rounds.
 */
function computeHandicap(rounds: RoundEntry[], direction: 'higher' | 'lower'): number {
  if (rounds.length === 0) return 0;
  return rounds.reduce((sum, e) => sum + scoreToPar(e, direction), 0) / rounds.length;
}

/** Full personal stats for a user, or null if they've logged nothing. */
export function computeStats(trackerId: string, userId: string): ScoreStats | null {
  const tracker = getTracker(trackerId);
  const userData = trackerData(trackerId)?.users[userId];
  if (!tracker || !userData) return null;

  const entries = Object.entries(userData.rounds);
  if (entries.length === 0) return null;

  const rounds = entries.map(([, e]) => e);
  const average = rounds.reduce((sum, e) => sum + e.score, 0) / rounds.length;
  const handicap = computeHandicap(rounds, tracker.direction);

  const byToPar = [...rounds].sort(
    (a, b) => scoreToPar(a, tracker.direction) - scoreToPar(b, tracker.direction)
  );
  const best = byToPar[0] ?? null;
  const worst = byToPar[byToPar.length - 1] ?? null;

  const byRound = [...entries].sort((a, b) => Number(b[0]) - Number(a[0]));
  const last = byRound[0] ? { round: byRound[0][0], entry: byRound[0][1] } : null;

  const medals = computeAllMedals(trackerId)[userId] ?? emptyMedals();
  const par = last ? last.entry.par : rounds[0].par;

  return { rounds: rounds.length, average, handicap, par, best, worst, last, medals };
}

/** All players ranked by handicap (lowest first), with medal tallies. */
export function getLeaderboard(trackerId: string): LeaderboardEntry[] {
  const tracker = getTracker(trackerId);
  const td = trackerData(trackerId);
  if (!tracker || !td) return [];

  const medals = computeAllMedals(trackerId);
  const entries: LeaderboardEntry[] = [];

  for (const [userId, userData] of Object.entries(td.users)) {
    const rounds = Object.values(userData.rounds);
    if (rounds.length === 0) continue;

    entries.push({
      userId,
      username: userData.username,
      rounds: rounds.length,
      average: rounds.reduce((sum, e) => sum + e.score, 0) / rounds.length,
      handicap: computeHandicap(rounds, tracker.direction),
      medals: medals[userId] ?? emptyMedals()
    });
  }

  // Lowest handicap wins; break ties by more rounds played, then gold medals.
  entries.sort(
    (a, b) => a.handicap - b.handicap || b.rounds - a.rounds || b.medals.gold - a.medals.gold
  );

  return entries;
}
