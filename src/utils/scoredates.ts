import type { ScoreTracker } from '../types/index.js';

/**
 * Calendar-date helpers for daily-puzzle trackers.
 *
 * Round numbers are the source of truth for *which day* a score belongs to.
 * A tracker declares one known (round, date) pair — the anchor — and every
 * other round's date is derived by counting days from it. That keeps month
 * boundaries correct no matter when the message was actually posted: a round
 * posted at 12:30am, or backfilled a week late, still lands on its real day.
 *
 * All arithmetic runs on bare YYYY-MM-DD calendar dates through UTC, so DST
 * never shifts a date. The tracker's timezone is only consulted for "what is
 * today?" — see todayInZone().
 */

export const DEFAULT_TIMEZONE = 'America/New_York';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse YYYY-MM-DD into a UTC-midnight epoch, or null if malformed. */
function parseDate(date: string): number | null {
  const match = date.match(DATE_PATTERN);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  // Round-trip guard: rejects impossible dates like 2026-02-31.
  return formatDate(ms) === date ? ms : null;
}

/** Format a UTC epoch as YYYY-MM-DD. */
function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string | null {
  const ms = parseDate(date);
  return ms === null ? null : formatDate(ms + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

export function isValidDate(date: string): boolean {
  return parseDate(date) !== null;
}

export function getTimezone(tracker: ScoreTracker): string {
  return tracker.timezone ?? DEFAULT_TIMEZONE;
}

/**
 * Today's calendar date in an IANA timezone. 'en-CA' formats as YYYY-MM-DD,
 * which is exactly the shape used throughout. Falls back to UTC if the
 * runtime rejects the zone (e.g. a Node build without full ICU).
 */
export function todayInZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Current wall-clock hour and minute in an IANA timezone. */
export function nowInZone(timeZone: string): { date: string; hour: number; minute: number } {
  const date = todayInZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const pick = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
    return { date, hour: pick('hour') % 24, minute: pick('minute') };
  } catch {
    const now = new Date();
    return { date, hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

/**
 * The calendar date a round was played on, derived from the tracker's anchor.
 * Returns null when the tracker has no (or an invalid) anchor — callers treat
 * that as "this tracker has no calendar, so no monthly play".
 */
export function roundToDate(round: string | number, tracker: ScoreTracker): string | null {
  const { anchorRound, anchorDate } = tracker;
  if (anchorRound === undefined || anchorDate === undefined) return null;
  if (!isValidDate(anchorDate)) return null;

  const n = Number(round);
  if (!Number.isInteger(n)) return null;

  return addDays(anchorDate, n - anchorRound);
}

/** Inverse of roundToDate: which round number fell on a given date. */
export function dateToRound(date: string, tracker: ScoreTracker): number | null {
  const { anchorRound, anchorDate } = tracker;
  if (anchorRound === undefined || anchorDate === undefined) return null;

  const offset = daysBetween(anchorDate, date);
  return offset === null ? null : anchorRound + offset;
}

/** The YYYY-MM tournament key a date belongs to. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month a round belongs to, or null without a usable anchor. */
export function roundToMonth(round: string | number, tracker: ScoreTracker): string | null {
  const date = roundToDate(round, tracker);
  return date === null ? null : monthOf(date);
}

/** The current tournament month for a tracker, e.g. "2026-08". */
export function currentMonth(tracker: ScoreTracker): string {
  return monthOf(todayInZone(getTimezone(tracker)));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** "2026-08" → "August 2026". Passes through anything unparseable. */
export function monthLabel(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month;
  const name = MONTH_NAMES[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : month;
}

/**
 * Normalise user month input into a YYYY-MM key. Accepts "2026-08",
 * "august 2026", "aug 2026", and bare "august" (resolved against the
 * tracker's current year). Returns null if it can't be read.
 */
export function parseMonthInput(input: string, tracker: ScoreTracker): string | null {
  const trimmed = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const monthNum = Number(trimmed.slice(5));
    return monthNum >= 1 && monthNum <= 12 ? trimmed : null;
  }

  const words = trimmed.match(/^([a-z]+)\s*(\d{4})?$/);
  if (!words) return null;

  const index = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(words[1]));
  if (index === -1) return null;

  const year = words[2] ?? currentMonth(tracker).slice(0, 4);
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}
