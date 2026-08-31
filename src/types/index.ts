import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

// Pattern config types (discriminated union on "type")
export interface ReactPattern {
  pattern: string;
  type: 'react';
  emoji: string;
}

export interface ReplyPattern {
  pattern: string;
  type: 'reply';
  message: string;
}

export type PatternConfig = ReactPattern | ReplyPattern;

export interface PatternsFile {
  patterns: PatternConfig[];
}

// Word counting types
export interface WordCountConfig {
  trackedWords: string[];
  milestones: number[];
  milestoneMessages: string[];
}

export interface UserWordData {
  username: string;
  words: Record<string, number>;
}

export type CountData = Record<string, UserWordData>;

export interface UpdateResult {
  word: string;
  previousCount: number;
  newCount: number;
}

export type WordOccurrences = Record<string, number>;

// Smack config types
export interface SmackConfig {
  /**
   * Punishment role. Ships as a placeholder; prefer setting the real ID in
   * the SMACK_ROLE_ID environment variable, since this file is committed.
   */
  roleId: string;
  durationSeconds: number;
  cooldownSeconds: number;
  messages: string[];
}

// Encounters config types
/** One thing a Krampus encounter does. A single hit can yield several. */
export interface EncounterAction {
  type: 'react' | 'reply';
  /** Emoji for react, message template for reply. */
  value: string;
}

export interface EncountersConfig {
  chance: number;
  messages: string[];
  emojis: string[];
}

// Score tracker config types
export interface ScoreTracker {
  id: string;
  name: string;
  /** Regex (as a string) with capture groups for round, score, and par. */
  pattern: string;
  roundGroup: number;
  scoreGroup: number;
  parGroup: number;
  /** 'lower' = a smaller score is better (golf: fewest strokes wins). */
  direction: 'higher' | 'lower';
  /** Emoji to react with when a score is logged. */
  confirmReaction?: string;
  /** Rounds need at least this many players before medals are awarded. */
  minPlayersForMedal: number;

  // --- Calendar anchor: maps round numbers to real dates ---------------
  /** A round number whose calendar date is known. */
  anchorRound?: number;
  /** The date (YYYY-MM-DD) that anchorRound was played on. */
  anchorDate?: string;
  /** IANA timezone defining day and month boundaries. */
  timezone?: string;

  // --- Monthly tournament rules ---------------------------------------
  /**
   * Missed-day penalty, in strokes added to the worst to-par posted that
   * day. Default 5: if the worst score that day was +3, a no-show takes +8.
   */
  missedDayPenaltyStrokes?: number;
  /**
   * Penalty (relative to par) used when a day somehow has no scores to
   * derive a worst from. Only reachable via manual data edits.
   */
  missedDayFallbackToPar?: number;
  /**
   * A day only levies penalties if at least this many players logged it.
   * Default 1 — every day anyone played counts against everyone else.
   */
  minPlayersForPenaltyDay?: number;
  /**
   * Rounds a player must log in a month before they are ranked in that
   * month's tournament. Default 1 (nobody is excluded).
   */
  minRoundsForMonthlyRank?: number;

  /** Daily no-show callout. Disabled until a channel is configured. */
  callout?: CalloutConfig;
}

/** Scheduled daily message naming yesterday's no-shows. */
export interface CalloutConfig {
  enabled: boolean;
  /**
   * Channel to post in. Ships as a placeholder; the callout stays off until a
   * real ID is supplied — normally via `channelIdEnv` rather than here, since
   * this file is committed.
   */
  channelId: string;
  /**
   * Environment variable holding the real channel ID, checked before
   * `channelId`. Named per tracker so two trackers can post to two channels.
   */
  channelIdEnv?: string;
  /** Local hour (0-23) in the tracker's timezone to post at. */
  hour: number;
  /** Local minute (0-59). */
  minute: number;
  /** Templates. Placeholders: {users} {count} {round} {date} {penalty}. */
  messages: string[];
  /** Sent instead when everyone showed up. Omit to stay silent on clean days. */
  perfectDayMessages?: string[];
}

export interface ScoreTrackersFile {
  trackers: ScoreTracker[];
}

// A single logged round for a user.
export interface RoundEntry {
  /** Strokes taken. */
  score: number;
  /** Par for that round — captured per round, since it can vary. */
  par: number;
  recordedAt: string;
}

export interface UserScoreData {
  username: string;
  /** Keyed by round number (as a string) — first entry per round wins. */
  rounds: Record<string, RoundEntry>;
}

/**
 * Per-day facts about a round, independent of who played it. Kept as its own
 * index so a day's date and par survive even if user entries are removed, and
 * so "which days happened" can be answered without scanning every user.
 */
export interface RoundInfo {
  /** Calendar date (YYYY-MM-DD) derived from the tracker's anchor. */
  date: string;
  /** Par for that day. */
  par: number;
  /** When this round was first seen by the bot. */
  firstSeenAt: string;
}

export interface TrackerData {
  /** Keyed by round number. */
  rounds: Record<string, RoundInfo>;
  /** Keyed by Discord user ID. */
  users: Record<string, UserScoreData>;
  /** Last local date the no-show callout posted, so restarts don't repost. */
  lastCalloutDate?: string;
}

/** Current on-disk shape of data/scores-data.json. */
export interface ScoreDataFile {
  version: number;
  trackers: Record<string, TrackerData>;
}

/** Legacy v1 shape: { [trackerId]: { [userId]: UserScoreData } }. */
export type LegacyScoreData = Record<string, Record<string, UserScoreData>>;

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface ScoreStats {
  rounds: number;
  /** Average raw strokes per round. */
  average: number;
  /** Golf handicap: average strokes relative to par. Negative is under par. */
  handicap: number;
  /** Par of the most recent round. */
  par: number;
  best: RoundEntry | null;
  worst: RoundEntry | null;
  last: { round: string; entry: RoundEntry } | null;
  medals: MedalCounts;
}

// One participant's result within a single round, with assigned place.
export interface RoundPlacing {
  userId: string;
  username: string;
  score: number;
  par: number;
  /** Strokes relative to par for this round. */
  toPar: number;
  /** 1-indexed place; ties share a place (competition ranking). */
  place: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rounds: number;
  /** Average raw strokes per round. */
  average: number;
  /** Golf handicap: average strokes relative to par. */
  handicap: number;
  medals: MedalCounts;
}

// --- Monthly tournament types -----------------------------------------

/** One day of a month for one player: either a real round or a penalty. */
export interface MonthlyDay {
  round: string;
  date: string;
  par: number;
  /** Strokes counted — the real score, or the derived penalty score. */
  score: number;
  /** Strokes relative to par. */
  toPar: number;
  /** False when this day was a no-show and `score` is a penalty. */
  played: boolean;
}

/** A player's standing in one month's tournament. */
export interface MonthlyStanding {
  userId: string;
  username: string;
  /** Days actually played. */
  roundsPlayed: number;
  /** Scoring days the player missed and was penalised for. */
  missedDays: number;
  /** Total strokes including penalties — the "110" in 110/115. */
  totalStrokes: number;
  /** Total par over every scoring day — the "115" in 110/115. */
  totalPar: number;
  /** totalStrokes vs totalPar — the "-5". */
  toPar: number;
  /**
   * To-par contributed by missed days alone. Can be **negative**: the charge
   * is the day's worst to-par plus the penalty, and on a day the whole field
   * beat par that sum can still be under par. Format it with formatToPar().
   */
  penaltyStrokes: number;
  /** Medals won within this month only. */
  medals: MedalCounts;
  /** Consecutive days played ending on the month's latest scoring day. */
  currentStreak: number;
  longestStreak: number;
  /** False when the player is below minRoundsForMonthlyRank. */
  qualified: boolean;
  /** 1-indexed place among qualified players; ties share a place. */
  place: number;
  /** Per-day detail, ordered by round. */
  days: MonthlyDay[];
}

/** A whole month's tournament, ranked. */
export interface MonthlyTournament {
  month: string;
  /** Rounds that counted as scoring days, ascending. */
  scoringRounds: string[];
  /** Total par across every scoring day. */
  totalPar: number;
  /** Ranked, qualified players (best first). */
  standings: MonthlyStanding[];
  /** Players who logged rounds but fell short of the qualifying minimum. */
  unranked: MonthlyStanding[];
}

/** One line of season history. */
export interface MonthSummary {
  month: string;
  scoringDays: number;
  players: number;
  champion: MonthlyStanding | null;
  /** True when this month is still being played. */
  inProgress: boolean;
}

/** Who missed a given round — the input to the daily callout. */
export interface NoShowReport {
  round: string;
  date: string;
  par: number;
  /** Players expected to have played (everyone active that month). */
  expected: { userId: string; username: string }[];
  /** Of those, the ones who did not log a score. */
  noShows: { userId: string; username: string }[];
  /** Strokes each no-show is charged for the day. */
  penaltyToPar: number;
}

// Bot event/command types
export interface BotEvent {
  name: string;
  once: boolean;
  execute(...args: unknown[]): void | Promise<void>;
}

export interface BotCommand {
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
