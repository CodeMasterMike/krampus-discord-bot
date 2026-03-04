import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SmackConfig } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedConfig: SmackConfig | null = null;

export function loadSmackConfig(): SmackConfig {
  if (!cachedConfig) {
    const configPath = join(__dirname, '../../smack.json');
    cachedConfig = JSON.parse(readFileSync(configPath, 'utf8')) as SmackConfig;
  }
  return cachedConfig;
}

// In-memory cooldown map: userId -> last use timestamp (ms)
const cooldowns = new Map<string, number>();

export function isOnCooldown(userId: string): boolean {
  const config = loadSmackConfig();
  const lastUse = cooldowns.get(userId);
  if (!lastUse) return false;
  return Date.now() - lastUse < config.cooldownSeconds * 1000;
}

export function setCooldown(userId: string): void {
  cooldowns.set(userId, Date.now());
}

export function getRemainingCooldown(userId: string): number {
  const config = loadSmackConfig();
  const lastUse = cooldowns.get(userId);
  if (!lastUse) return 0;
  const remaining = (config.cooldownSeconds * 1000) - (Date.now() - lastUse);
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function formatSmackMessage(template: string, userId: string, targetId: string): string {
  return template
    .replace(/\{user\}/g, `<@${userId}>`)
    .replace(/\{target\}/g, `<@${targetId}>`);
}
