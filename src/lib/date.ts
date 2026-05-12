import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isAfter,
  isSameDay,
  isToday as isTodayFn,
  isYesterday as isYesterdayFn,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import type { DateStr } from "./types";

export function toDateStr(d: Date | string): DateStr {
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

export function fromDateStr(s: DateStr): Date {
  return parseISO(s);
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

export function yesterdayStr(): DateStr {
  return toDateStr(subDays(new Date(), 1));
}

export function lastNDates(n: number, end: Date = new Date()): DateStr[] {
  const out: DateStr[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(toDateStr(subDays(end, i)));
  }
  return out;
}

export function rangeDates(startStr: DateStr, endStr: DateStr): DateStr[] {
  const arr = eachDayOfInterval({
    start: fromDateStr(startStr),
    end: fromDateStr(endStr),
  });
  return arr.map(toDateStr);
}

export function formatRelative(d: Date | DateStr) {
  const dt = typeof d === "string" ? fromDateStr(d) : d;
  if (isTodayFn(dt)) return "Today";
  if (isYesterdayFn(dt)) return "Yesterday";
  const diff = differenceInCalendarDays(new Date(), dt);
  if (diff > 0 && diff < 7) return format(dt, "EEEE");
  return format(dt, "MMM d");
}

export function formatHeader(d: Date = new Date()) {
  return {
    weekday: format(d, "EEEE"),
    rest: format(d, "MMMM d"),
  };
}

/** Days between two date strings, positive when b is after a. */
export function diffDays(a: DateStr, b: DateStr): number {
  return differenceInCalendarDays(fromDateStr(b), fromDateStr(a));
}

/** Shift a date string by `days` calendar days. */
export function shiftDate(d: DateStr, days: number): DateStr {
  return toDateStr(addDays(fromDateStr(d), days));
}

/** Clamp a date to [todayStr - back, todayStr + forward] window. */
export function clampDateWithin(
  d: DateStr,
  back: number,
  forward: number
): DateStr {
  const min = shiftDate(todayStr(), -back);
  const max = shiftDate(todayStr(), forward);
  if (d < min) return min;
  if (d > max) return max;
  return d;
}

/** Human-readable offset from today. "Today" / "Yesterday" / "Tomorrow" / "in 3 days" / "2 days ago". */
export function describeOffset(d: DateStr, today: DateStr = todayStr()): string {
  const n = diffDays(today, d);
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n === 1) return "Tomorrow";
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
}

export function isPast8pm(d: Date = new Date()) {
  return d.getHours() >= 20;
}

export function isPast5am(d: Date = new Date()) {
  return d.getHours() >= 5;
}

export {
  addDays,
  subDays,
  isSameDay,
  isAfter,
  startOfDay,
  endOfDay,
  format,
  isTodayFn as isToday,
  isYesterdayFn as isYesterday,
  differenceInCalendarDays,
};
