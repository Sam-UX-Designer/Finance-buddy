/**
 * Date helpers. All user-facing calendar logic (months, days, salary cycles) uses
 * Indian Standard Time (UTC+05:30, no daylight saving). Timestamps are ISO-8601 UTC strings.
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ISTParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function istParts(iso: string | Date): ISTParts {
  const t = (typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) + IST_OFFSET_MS;
  const d = new Date(t);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** ISO UTC timestamp for a wall-clock time in IST. Month is 1-12; overflow is normalised. */
export function istToISO(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS).toISOString();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2026-10-01" in IST. */
export function istDateKey(iso: string | Date): string {
  const p = istParts(iso);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "2026-10" in IST. */
export function istMonthKey(iso: string | Date): string {
  const p = istParts(iso);
  return `${p.year}-${pad2(p.month)}`;
}

export function monthKeyParts(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y!, month: m! };
}

export function addMonthsToKey(key: string, delta: number): string {
  const { year, month } = monthKeyParts(key);
  const idx = year * 12 + (month - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

/** Start of an IST calendar month as ISO UTC. */
export function monthStartISO(key: string): string {
  const { year, month } = monthKeyParts(key);
  return istToISO(year, month, 1);
}

/** Exclusive end of an IST calendar month as ISO UTC. */
export function monthEndISO(key: string): string {
  return monthStartISO(addMonthsToKey(key, 1));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** Same IST day-of-month `delta` months later, clamped to month length (31 Jan + 1 → 28/29 Feb). */
export function addMonthsISO(iso: string, delta: number): string {
  const p = istParts(iso);
  const idx = p.year * 12 + (p.month - 1) + delta;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  const day = Math.min(p.day, daysInMonth(year, month));
  return istToISO(year, month, day, p.hour, p.minute);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return (Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS;
}

export function isBefore(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b);
}

export function minISO(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

export function maxISO(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(month: number, style: 'short' | 'long' = 'short'): string {
  return (style === 'short' ? MONTHS_SHORT : MONTHS_LONG)[month - 1]!;
}

/** "12 Oct 2026" */
export function formatDate(iso: string): string {
  const p = istParts(iso);
  return `${p.day} ${monthName(p.month)} ${p.year}`;
}

/** "9:14 PM" */
export function formatTime(iso: string): string {
  const p = istParts(iso);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad2(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** "October 2026" or "Oct 2026" */
export function formatMonthKey(key: string, style: 'short' | 'long' = 'long'): string {
  const { year, month } = monthKeyParts(key);
  return `${monthName(month, style)} ${year}`;
}

/** Morning / afternoon / evening greeting for an IST time. */
export function greetingFor(iso: string): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const h = istParts(iso).hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
