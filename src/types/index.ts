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
