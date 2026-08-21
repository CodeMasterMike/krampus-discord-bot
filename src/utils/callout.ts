import { Client } from 'discord.js';
import type { CalloutConfig, ScoreTracker } from '../types/index.js';
import {
  getTrackers,
  getRoundByDate,
  computeNoShows,
  getLastCalloutDate,
  setLastCalloutDate,
  formatToPar
} from './scoretracker.js';
import { nowInZone, addDays, getTimezone } from './scoredates.js';

/**
 * Daily no-show roll call.
 *
 * Unlike every other Krampus pipeline, this one fires with no message to
 * react to, so it runs on a timer. The timer ticks once a minute and compares
 * the tracker's *local* wall clock against the configured hour — cheaper than
 * computing a timezone-aware delay, and immune to DST shifts, since a tick
 * simply re-reads the local time. The date of the last callout is persisted,
 * so a restart mid-day never reposts and an outage past the hour still posts
 * once the bot returns.
 *
 * It calls out *yesterday's* round: today's is still in play.
 */

const TICK_MS = 60 * 1000;
const CHANNEL_PLACEHOLDER = 'YOUR_CHANNEL_ID_HERE';

function isConfigured(callout: CalloutConfig | undefined): callout is CalloutConfig {
  return Boolean(
    callout?.enabled &&
      callout.channelId &&
      callout.channelId !== CHANNEL_PLACEHOLDER &&
      callout.messages?.length
  );
}

function pick(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

function fill(
  template: string,
  values: { users: string; count: number; round: string; date: string; penalty: string }
): string {
  return template
    .replace(/\{users\}/g, values.users)
    .replace(/\{count\}/g, String(values.count))
    .replace(/\{round\}/g, `#${values.round}`)
    .replace(/\{date\}/g, values.date)
    .replace(/\{penalty\}/g, values.penalty);
}

async function send(client: Client, channelId: string, content: string): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !('send' in channel)) {
    console.error(`[CALLOUT] Channel ${channelId} is not a sendable text channel.`);
    return;
  }
  await channel.send({ content, allowedMentions: { parse: ['users'] } });
}

/**
 * Build the roll-call message for a tracker's previous day, or null when
 * there is nothing to say. Exported for the tick loop and for testing.
 */
export function buildCalloutMessage(tracker: ScoreTracker, localDate: string): string | null {
  const callout = tracker.callout;
  if (!isConfigured(callout)) return null;

  const yesterday = addDays(localDate, -1);
  if (!yesterday) return null;

  const round = getRoundByDate(tracker.id, yesterday);
  if (!round) {
    console.log(`[CALLOUT] No ${tracker.name} round recorded for ${yesterday} — nothing to call out.`);
    return null;
  }

  const report = computeNoShows(tracker.id, round);
  if (!report) return null;

  if (report.noShows.length === 0) {
    return callout.perfectDayMessages?.length
      ? fill(pick(callout.perfectDayMessages), {
          users: '',
          count: 0,
          round: report.round,
          date: report.date,
          penalty: formatToPar(report.penaltyToPar)
        })
      : null;
  }

  return fill(pick(callout.messages), {
    users: report.noShows.map(n => `<@${n.userId}>`).join(', '),
    count: report.noShows.length,
    round: report.round,
    date: report.date,
    penalty: formatToPar(report.penaltyToPar)
  });
}

async function tick(client: Client): Promise<void> {
  for (const tracker of getTrackers()) {
    const callout = tracker.callout;
    if (!isConfigured(callout)) continue;

    const zone = getTimezone(tracker);
    const now = nowInZone(zone);

    // Once past the configured minute, and not already done for this local
    // day. The >= comparison means an outage over the hour still posts late
    // rather than skipping the day entirely.
    const due = now.hour * 60 + now.minute >= callout.hour * 60 + callout.minute;
    if (!due) continue;
    if (getLastCalloutDate(tracker.id) === now.date) continue;

    // Stamp before sending: a send failure should not queue up a retry storm
    // on every subsequent tick for the rest of the day.
    setLastCalloutDate(tracker.id, now.date);

    try {
      const message = buildCalloutMessage(tracker, now.date);
      if (!message) continue;

      console.log(`[CALLOUT] Posting ${tracker.name} roll call for ${now.date}.`);
      await send(client, callout.channelId, message);
    } catch (error) {
      console.error(`[CALLOUT] Failed for ${tracker.name}:`, (error as Error).message);
    }
  }
}

/** Start the once-a-minute callout loop. Called once from ClientReady. */
export function startCalloutScheduler(client: Client): void {
  const active = getTrackers().filter(t => isConfigured(t.callout));

  if (active.length === 0) {
    console.log('[CALLOUT] No tracker has a configured callout channel — scheduler idle.');
    return;
  }

  for (const t of active) {
    const c = t.callout!;
    const hh = String(c.hour).padStart(2, '0');
    const mm = String(c.minute).padStart(2, '0');
    console.log(`[CALLOUT] ${t.name} roll call armed for ${hh}:${mm} ${getTimezone(t)}.`);
  }

  const run = () => {
    void tick(client).catch(error =>
      console.error('[CALLOUT] Tick failed:', (error as Error).message)
    );
  };

  run();
  setInterval(run, TICK_MS);
}
