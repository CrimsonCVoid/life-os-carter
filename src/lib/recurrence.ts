import {
  differenceInCalendarDays,
  endOfMonth,
  getDate,
  getDay,
  parseISO,
  startOfDay,
} from "date-fns";
import type {
  DateStr,
  RecurrencePattern,
  RecurringGoal,
  RecurringGoalGeneration,
} from "./types";
import { fromDateStr } from "./date";

/**
 * Pure predicate: should this RecurringGoal generate a Goal for `date`?
 *
 * Date strings are "YYYY-MM-DD"; we normalize via startOfDay to avoid
 * DST / timezone drift.
 */
export function shouldGenerateForDate(
  rg: RecurringGoal,
  date: DateStr
): boolean {
  if (!rg.active) return false;

  const target = startOfDay(fromDateStr(date));
  const start = startOfDay(fromDateStr(rg.startDate));
  if (target < start) return false;

  const dow = getDay(target); // 0=Sun..6=Sat

  switch (rg.pattern) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekends":
      return dow === 0 || dow === 6;
    case "weekly":
      return (rg.daysOfWeek ?? []).includes(dow);
    case "biweekly": {
      if (!(rg.daysOfWeek ?? []).includes(dow)) return false;
      const days = differenceInCalendarDays(target, start);
      return Math.floor(days / 7) % 2 === 0;
    }
    case "monthly": {
      if (rg.monthlyLastDay) {
        return getDate(target) === getDate(endOfMonth(target));
      }
      const wanted = rg.dayOfMonth ?? 1;
      const lastDay = getDate(endOfMonth(target));
      const effective = Math.min(wanted, lastDay);
      return getDate(target) === effective;
    }
    case "custom": {
      const n = rg.intervalDays ?? 1;
      if (n <= 0) return false;
      const days = differenceInCalendarDays(target, start);
      return days % n === 0;
    }
  }
}

/** Human-readable summary for a RecurringGoal. */
export function patternSummary(rg: RecurringGoal): string {
  switch (rg.pattern) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "weekly": {
      const names = (rg.daysOfWeek ?? [])
        .slice()
        .sort()
        .map((d) => DOW_SHORT[d]);
      return names.length ? `Every ${names.join("/")}` : "Weekly";
    }
    case "biweekly": {
      const names = (rg.daysOfWeek ?? [])
        .slice()
        .sort()
        .map((d) => DOW_SHORT[d]);
      return names.length
        ? `Biweekly · ${names.join("/")}`
        : "Biweekly";
    }
    case "monthly": {
      if (rg.monthlyLastDay) return "Last day of each month";
      const d = rg.dayOfMonth ?? 1;
      return `${ordinal(d)} of each month`;
    }
    case "custom": {
      const n = rg.intervalDays ?? 1;
      return n === 1 ? "Every day" : `Every ${n} days`;
    }
  }
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Given a generation log and the date list a recurring goal *should* have
 * applied to, compute completion stats.
 *
 * Completed = generation exists AND linked Goal.completed is true
 * Missed    = generation exists with status "skipped" or linked Goal not completed
 * Unscheduled = date isn't a scheduled day for the rg (excluded)
 */
export function computeRecurringStats(
  rg: RecurringGoal,
  dates: DateStr[],
  generations: RecurringGoalGeneration[],
  goalsCompletedById: Map<string, boolean>
): {
  scheduled: number;
  completed: number;
  perDay: Array<{ date: DateStr; scheduled: boolean; completed: boolean }>;
} {
  const gensByDate = new Map<DateStr, RecurringGoalGeneration>();
  for (const g of generations) {
    if (g.recurringGoalId === rg.id) gensByDate.set(g.date, g);
  }
  let scheduled = 0;
  let completed = 0;
  const perDay = dates.map((d) => {
    const isScheduled = shouldGenerateForDate(rg, d);
    if (!isScheduled) return { date: d, scheduled: false, completed: false };
    scheduled += 1;
    const gen = gensByDate.get(d);
    const done = !!gen && goalsCompletedById.get(gen.generatedGoalId) === true;
    if (done) completed += 1;
    return { date: d, scheduled: true, completed: done };
  });
  return { scheduled, completed, perDay };
}

/** "S M T W T F S" toggle order — matches day-of-week 0..6. */
export const WEEK_TOGGLE_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Quick lookup of label for pattern type. */
export function patternLabel(p: RecurrencePattern): string {
  switch (p) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "monthly":
      return "Monthly";
    case "custom":
      return "Custom";
  }
}

/** True when the given DateStr is the last day of its month. */
export function isLastDayOfMonth(date: DateStr): boolean {
  const d = startOfDay(parseISO(date));
  return getDate(d) === getDate(endOfMonth(d));
}
