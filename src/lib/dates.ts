/*
 * Everything scheduled is a LOCAL wall-clock stamp: 'YYYY-MM-DDTHH:MM:SS',
 * no timezone suffix. 11:30 means 11:30 where you are, and stays 11:30 if the
 * machine moves. The IANA zone is stored beside it for when real publishing
 * arrives. Never hand these strings to `new Date()` expectations of UTC.
 */

const p2 = (n: number) => String(n).padStart(2, "0");

export function toStamp(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(
    d.getHours(),
  )}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function parseStamp(s: string): Date {
  const [date, time = "00:00:00"] = s.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

/** 'YYYY-MM-DD' — the grouping key for day headers and calendar cells. */
export const dayKey = (s: string) => s.slice(0, 10);

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** '11:30' */
export const formatTime = (s: string) => s.slice(11, 16);

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const SHORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export const monthName = (m: number) => MONTHS[m];

/** 'Today' / 'Tomorrow' / 'Yesterday' / weekday name. */
export function dayLabel(d: Date, today = new Date()): string {
  const diff = Math.round(
    (startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return WEEKDAYS[d.getDay()];
}

/** 'SAT 25 JUL' for this year, '25 JUL 2025' otherwise. */
export function dayStamp(d: Date, today = new Date()): string {
  const base = `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

/** '25 Jul' — the library caption and inspector date. */
export function shortDate(s: string): string {
  const d = parseStamp(s.length > 10 ? s : `${s.slice(0, 10)}T00:00:00`);
  const m = SHORT_MONTHS[d.getMonth()];
  return `${d.getDate()} ${m[0]}${m.slice(1).toLowerCase()}`;
}

/** '25 Jul · 18:00' */
export const longStamp = (s: string) => `${shortDate(s)} · ${formatTime(s)}`;

/** 'in 2h 14m' / 'in 3d' / 'now'. */
export function untilLabel(s: string, from = new Date()): string {
  const ms = parseStamp(s).getTime() - from.getTime();
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days}d`;
}

/** '14 minutes ago' / '12 hours ago' / '3 days ago'.
 *
 *  The mirror of untilLabel, and it exists because untilLabel collapses
 *  everything already past into the single word "now" — which is exactly the
 *  case where the distance is the thing worth saying. A time twelve hours
 *  behind you and a time one minute behind you want very different reactions.
 */
export function agoLabel(s: string, from = new Date()): string {
  const ms = from.getTime() - parseStamp(s).getTime();
  if (ms <= 0) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "moments ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Six rows of seven days, Monday-start, covering `month` and the days either
 * side that fill the grid.
 */
export function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** ISO-8601 timestamp (created_at etc.) → local Date. */
export const parseIso = (s: string) => new Date(s);
