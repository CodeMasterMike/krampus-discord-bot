import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { EncountersConfig, EncounterAction } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedConfig: EncountersConfig | null = null;

export function loadEncountersConfig(): EncountersConfig {
  if (!cachedConfig) {
    const configPath = join(__dirname, '../../encounters.json');
    cachedConfig = JSON.parse(readFileSync(configPath, 'utf8')) as EncountersConfig;
  }
  return cachedConfig;
}

const pick = (items: string[]): string => items[Math.floor(Math.random() * items.length)];

/**
 * Roll for a Krampus encounter, returning every action it should take.
 *
 * `chance` still gates how often Krampus shows up at all, so this is no
 * noisier than before. What changed is what a single appearance can do: the
 * emoji and the message are now rolled independently, so Krampus can react
 * *and* speak in the same breath instead of only ever one or the other. If
 * both coins come up empty we force the emoji, so a hit is never silent.
 *
 * Returns an empty array when nothing happens.
 */
export function rollEncounter(config: EncountersConfig): EncounterAction[] {
  if (Math.random() >= config.chance) return [];

  const wantsEmoji = config.emojis.length > 0 && Math.random() < 0.5;
  const wantsMessage = config.messages.length > 0 && Math.random() < 0.5;

  const actions: EncounterAction[] = [];
  if (wantsEmoji) actions.push({ type: 'react', value: pick(config.emojis) });
  if (wantsMessage) actions.push({ type: 'reply', value: pick(config.messages) });

  // Both coins came up empty. Pick one at random rather than always defaulting
  // to the emoji, which would quietly bias appearances away from messages —
  // the split between the two forms stays even, as it was before.
  if (actions.length === 0) {
    const canReact = config.emojis.length > 0;
    const canSpeak = config.messages.length > 0;
    const useEmoji = canReact && (!canSpeak || Math.random() < 0.5);

    if (useEmoji) actions.push({ type: 'react', value: pick(config.emojis) });
    else if (canSpeak) actions.push({ type: 'reply', value: pick(config.messages) });
  }

  return actions;
}

export function formatEncounterMessage(message: string, userId: string): string {
  return message.replace(/\{user\}/g, `<@${userId}>`);
}
