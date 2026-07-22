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
  /** Regex (as a string) with capture groups for round, score, and max. */
  pattern: string;
  roundGroup: number;
  scoreGroup: number;
  maxGroup: number;
  /** 'higher' = a bigger score is better (e.g. putt.day made putts). */
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
  score: number;
  max: number;
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
  /** Average score achieved (e.g. 6.4 out of 10). */
  average: number;
  /** Average putts missed per round (max - score). Lower is better. */
  handicap: number;
  max: number;
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
  max: number;
  /** 1-indexed place; ties share a place (competition ranking). */
  place: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rounds: number;
  average: number;
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
