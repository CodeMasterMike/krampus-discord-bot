import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SmackConfig } from '../types/index.js';
import { resolveId } from './env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * smack.json is committed, so the real role ID belongs in .env instead —
 * see utils/env.ts for why editing the tracked config on the VM breaks the
 * deploy. Only one smack config exists, so a fixed variable name is safe.
 */
const ROLE_ID_ENV = 'SMACK_ROLE_ID';

let cachedConfig: SmackConfig | null = null;

export function loadSmackConfig(): SmackConfig {
  if (!cachedConfig) {
    const configPath = join(__dirname, '../../smack.json');
    cachedConfig = JSON.parse(readFileSync(configPath, 'utf8')) as SmackConfig;
  }
  return cachedConfig;
}

/**
 * The punishment role ID, or null if it hasn't been set up. Returning null
 * for the shipped placeholder matters: the placeholder string is truthy, so
 * a bare `!config.roleId` check silently passed it through to a role lookup
 * that failed with a misleading "role not found in this server".
 */
export function getSmackRoleId(): string | null {
  return resolveId(ROLE_ID_ENV, loadSmackConfig().roleId);
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
