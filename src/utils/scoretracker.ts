import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ScoreTracker,
  ScoreTrackersFile,
  ScoreData,
  RoundEntry,
  ScoreStats,
  MedalCounts,
  RoundPlacing,
  LeaderboardEntry
} from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const configPath = join(projectRoot, 'scoretrackers.json');
const dataDir = join(projectRoot, 'data');
const dataPath = join(dataDir, 'scores-data.json');

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

export function loadScoreData(): ScoreData {
  if (!existsSync(dataPath)) {
    return {};
  }
  return JSON.parse(readFileSync(dataPath, 'utf8')) as ScoreData;
}

export function saveScoreData(data: ScoreData): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

export interface ParsedScore {
  round: string;
  score: number;
  max: number;
}

/**
 * Run a tracker's regex against message content and pull out the round
 * number, score, and max via the configured capture-group indices.
 * Returns null if the message doesn't match.
 */
export function parseScore(content: string, tracker: ScoreTracker): ParsedScore | null {
  const regex = new RegExp(tracker.pattern, 'i');
  const match = content.match(regex);
  if (!match) return null;

  const round = match[tracker.roundGroup];
  const score = Number(match[tracker.scoreGroup]);
  const max = Number(match[tracker.maxGroup]);

  if (round === undefined || Number.isNaN(score) || Number.isNaN(max)) {
    return null;
  }
  return { round, score, max };
}

export type RecordResult = 'recorded' | 'duplicate';

/**
 * Persist a user's round result. First submission of a given round number
 * wins — later posts of the same round are ignored ('duplicate').
 */
export function recordScore(
  trackerId: string,
  userId: string,
  username: string,
  parsed: ParsedScore
): RecordResult {
  const data = loadScoreData();

  if (!data[trackerId]) {
    data[trackerId] = {};
  }
  if (!data[trackerId][userId]) {
    data[trackerId][userId] = { username, rounds: {} };
  }
  data[trackerId][userId].username = username;

  const rounds = data[trackerId][userId].rounds;
  if (rounds[parsed.round]) {
    return 'duplicate';
  }

  rounds[parsed.round] = {
    score: parsed.score,
    max: parsed.max,
    recordedAt: new Date().toISOString()
  };
  saveScoreData(data);
  return 'recorded';
}

interface Participant {
  userId: string;
  username: string;
  score: number;
  max: number;
}

/**
 * Rank participants and assign 1-indexed places. Ties share a place
 * (competition ranking: 6/10, 6/10, 5/10 → places 1, 1, 3).
 */
function assignPlaces(participants: Participant[], direction: 'higher' | 'lower'): RoundPlacing[] {
  const sorted = [...participants].sort((a, b) =>
    direction === 'higher' ? b.score - a.score : a.score - b.score
  );

  let place = 0;
  let prevScore: number | null = null;

  return sorted.map((p, i) => {
    if (prevScore === null || p.score !== prevScore) {
      place = i + 1;
      prevScore = p.score;
    }
    return { userId: p.userId, username: p.username, score: p.score, max: p.max, place };
  });
}

/** The highest round number recorded for a tracker — i.e. "today". */
export function getLatestRound(trackerId: string): string | null {
  const users = loadScoreData()[trackerId];
  if (!users) return null;

  let latest: number | null = null;
  for (const userData of Object.values(users)) {
    for (const roundKey of Object.keys(userData.rounds)) {
      const n = Number(roundKey);
      if (latest === null || n > latest) latest = n;
    }
  }
  return latest === null ? null : String(latest);
}

/** All participants of a single round, ranked with places. */
export function computeRoundPlacings(trackerId: string, round: string): RoundPlacing[] {
  const tracker = getTracker(trackerId);
  const users = loadScoreData()[trackerId];
  if (!tracker || !users) return [];

  const participants: Participant[] = [];
  for (const [userId, userData] of Object.entries(users)) {
    const entry = userData.rounds[round];
    if (entry) {
      participants.push({ userId, username: userData.username, score: entry.score, max: entry.max });
    }
  }
  if (participants.length === 0) return [];

  return assignPlaces(participants, tracker.direction);
}

const emptyMedals = (): MedalCounts => ({ gold: 0, silver: 0, bronze: 0 });

/**
 * Tally gold/silver/bronze finishes for every user in one pass over all
 * rounds. Only rounds with at least `minPlayersForMedal` players count.
 */
export function computeAllMedals(trackerId: string): Record<string, MedalCounts> {
  const tracker = getTracker(trackerId);
  const users = loadScoreData()[trackerId];
  const result: Record<string, MedalCounts> = {};
  if (!tracker || !users) return result;

  // Group every recorded result by round number.
  const rounds: Record<string, Participant[]> = {};
  for (const [userId, userData] of Object.entries(users)) {
    for (const [roundKey, entry] of Object.entries(userData.rounds)) {
      if (!rounds[roundKey]) rounds[roundKey] = [];
      rounds[roundKey].push({ userId, username: userData.username, score: entry.score, max: entry.max });
    }
  }

  for (const participants of Object.values(rounds)) {
    if (participants.length < tracker.minPlayersForMedal) continue;

    for (const placing of assignPlaces(participants, tracker.direction)) {
      if (!result[placing.userId]) result[placing.userId] = emptyMedals();
      if (placing.place === 1) result[placing.userId].gold++;
      else if (placing.place === 2) result[placing.userId].silver++;
      else if (placing.place === 3) result[placing.userId].bronze++;
    }
  }

  return result;
}

function computeHandicap(rounds: RoundEntry[], direction: 'higher' | 'lower'): number {
  if (rounds.length === 0) return 0;
  if (direction === 'higher') {
    // Average putts missed per round.
    const misses = rounds.reduce((sum, e) => sum + (e.max - e.score), 0);
    return misses / rounds.length;
  }
  // Lower-is-better games: the raw average already reads as a handicap.
  return rounds.reduce((sum, e) => sum + e.score, 0) / rounds.length;
}

/** Full personal stats for a user, or null if they've logged nothing. */
export function computeStats(trackerId: string, userId: string): ScoreStats | null {
  const tracker = getTracker(trackerId);
  const userData = loadScoreData()[trackerId]?.[userId];
  if (!tracker || !userData) return null;

  const entries = Object.entries(userData.rounds);
  if (entries.length === 0) return null;

  const rounds = entries.map(([, e]) => e);
  const average = rounds.reduce((sum, e) => sum + e.score, 0) / rounds.length;
  const handicap = computeHandicap(rounds, tracker.direction);

  const byScore = [...rounds].sort((a, b) =>
    tracker.direction === 'higher' ? b.score - a.score : a.score - b.score
  );
  const best = byScore[0] ?? null;
  const worst = byScore[byScore.length - 1] ?? null;

  const byRound = [...entries].sort((a, b) => Number(b[0]) - Number(a[0]));
  const last = byRound[0] ? { round: byRound[0][0], entry: byRound[0][1] } : null;

  const medals = computeAllMedals(trackerId)[userId] ?? emptyMedals();
  const max = last ? last.entry.max : rounds[0].max;

  return { rounds: rounds.length, average, handicap, max, best, worst, last, medals };
}

/** All players ranked by handicap (lowest first), with medal tallies. */
export function getLeaderboard(trackerId: string): LeaderboardEntry[] {
  const tracker = getTracker(trackerId);
  const users = loadScoreData()[trackerId];
  if (!tracker || !users) return [];

  const medals = computeAllMedals(trackerId);
  const entries: LeaderboardEntry[] = [];

  for (const [userId, userData] of Object.entries(users)) {
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
    (a, b) =>
      a.handicap - b.handicap ||
      b.rounds - a.rounds ||
      b.medals.gold - a.medals.gold
  );

  return entries;
}
