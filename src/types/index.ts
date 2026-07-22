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
  roleId: string;
  durationSeconds: number;
  cooldownSeconds: number;
  messages: string[];
}

// Encounters config types
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

// scores-data.json shape: { [trackerId]: { [userId]: UserScoreData } }
export type ScoreData = Record<string, Record<string, UserScoreData>>;

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
