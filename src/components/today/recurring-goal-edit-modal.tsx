"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  Priority,
  RecurrencePattern,
  RECURRENCE_PATTERNS,
  RECURRENCE_PATTERN_LABELS,
  RecurringGoal,
} from "@/lib/types";
import { WEEK_TOGGLE_LABELS } from "@/lib/recurrence";
import { todayStr } from "@/lib/date";

const EMOJI_SET = [
  "💪",
  "🧠",
  "📚",
  "🏃",
  "🧘",
  "💼",
  "✍️",
  "🍳",
  "🚿",
  "☕",
  "💧",
  "🌱",
  "✅",
  "⚡",
];

export type RecurringGoalDraft = Omit<RecurringGoal, "id" | "createdAt" | "active"> & {
  active?: boolean;
};

type Props = {
  open: boolean;
  initial?: Partial<RecurringGoalDraft>;
  /** When true, the modal renders an "Edit" title + Delete button. */
  editingId?: string | null;
  onClose: () => void;
  onSave: (draft: RecurringGoalDraft) => void;
  onDelete?: () => void;
};

const PRIO: Priority[] = ["P1", "P2", "P3"];

const PRIO_COLOR: Record<Priority, string> = {
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
};

export function RecurringGoalEditModal({
  open,
  initial,
  editingId,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [text, setText] = React.useState("");
  const [emoji, setEmoji] = React.useState<string | undefined>(undefined);
  const [priority, setPriority] = React.useState<Priority>("P2");
  const [category, setCategory] = React.useState("");
  const [timeMin, setTimeMin] = React.useState("");
  const [pattern, setPattern] = React.useState<RecurrencePattern>("daily");
  const [daysOfWeek, setDaysOfWeek] = React.useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = React.useState("1");
  const [monthlyLastDay, setMonthlyLastDay] = React.useState(false);
  const [intervalDays, setIntervalDays] = React.useState("3");
  const [startDate, setStartDate] = React.useState(todayStr());

  React.useEffect(() => {
    if (!open) return;
    setText(initial?.text ?? "");
    setEmoji(initial?.emoji);
    setPriority(initial?.priority ?? "P2");
    setCategory(initial?.category ?? "");
    setTimeMin(
      initial?.timeEstimateMin != null ? String(initial.timeEstimateMin) : ""
    );
    setPattern(initial?.pattern ?? "daily");
    setDaysOfWeek(initial?.daysOfWeek ?? [new Date().getDay()]);
    setDayOfMonth(
      initial?.dayOfMonth != null ? String(initial.dayOfMonth) : "1"
    );
    setMonthlyLastDay(!!initial?.monthlyLastDay);
    setIntervalDays(
      initial?.intervalDays != null ? String(initial.intervalDays) : "3"
    );
    setStartDate(initial?.startDate ?? todayStr());
  }, [open, initial]);

  if (!open) return null;

  const needsDays = pattern === "weekly" || pattern === "biweekly";
  const needsDayOfMonth = pattern === "monthly";
  const needsInterval = pattern === "custom";
  const dayOfMonthNum = parseInt(dayOfMonth, 10);
  const intervalNum = parseInt(intervalDays, 10);
  const validDays = needsDays ? daysOfWeek.length > 0 : true;
  const validMonth = needsDayOfMonth
    ? monthlyLastDay ||
      (Number.isFinite(dayOfMonthNum) &&
        dayOfMonthNum >= 1 &&
        dayOfMonthNum <= 31)
    : true;
  const validInterval = needsInterval
    ? Number.isFinite(intervalNum) && intervalNum >= 1
    : true;
  const canSave =
    text.trim().length > 0 && validDays && validMonth && validInterval;

  const toggleDay = (d: number) => {
    setDaysOfWeek((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    );
  };

  const save = () => {
    if (!canSave) return;
    const draft: RecurringGoalDraft = {
      text: text.trim(),
      emoji: emoji ?? undefined,
      priority,
      category: category.trim() || undefined,
      timeEstimateMin: timeMin ? parseInt(timeMin, 10) || undefined : undefined,
      pattern,
      daysOfWeek: needsDays ? daysOfWeek : undefined,
      dayOfMonth: needsDayOfMonth && !monthlyLastDay ? dayOfMonthNum : undefined,
      monthlyLastDay: needsDayOfMonth ? monthlyLastDay : undefined,
      intervalDays: needsInterval ? intervalNum : undefined,
      startDate,
    };
    onSave(draft);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editingId ? "Edit recurring goal" : "New recurring goal"}
      footer={
        <div className="flex items-center justify-between gap-2">
          {editingId && onDelete ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Text</div>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What recurs?"
            autoFocus
          />
        </div>

        <div>
          <div className="label mb-2">Priority</div>
          <div className="flex items-center gap-1.5">
            {PRIO.map((p) => {
              const active = p === priority;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-xs border transition",
                    active
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                      : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: PRIO_COLOR[p] }}
                  />
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="label mb-2">Emoji</div>
          <div className="grid grid-cols-7 gap-1.5">
            <button
              type="button"
              onClick={() => setEmoji(undefined)}
              className={cn(
                "h-10 rounded-lg border text-xs",
                emoji == null
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
              )}
            >
              None
            </button>
            {EMOJI_SET.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "h-10 rounded-lg border text-xl",
                  emoji === e
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-stroke)] hover:border-[var(--color-stroke-strong)]"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">Category</div>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Work, Health…"
            />
          </div>
          <div>
            <div className="label mb-2">Time (min)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={timeMin}
              onChange={(e) => setTimeMin(e.target.value)}
              placeholder="30"
            />
          </div>
        </div>

        <div>
          <div className="label mb-2">Recurrence</div>
          <div className="flex flex-wrap gap-1.5">
            {RECURRENCE_PATTERNS.map((p) => {
              const active = p === pattern;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPattern(p)}
                  className={cn(
                    "h-8 px-3 rounded-full text-xs border transition",
                    active
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                      : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                  )}
                >
                  {RECURRENCE_PATTERN_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        {needsDays && (
          <div>
            <div className="label mb-2">Days of the week</div>
            <div className="flex gap-1.5">
              {WEEK_TOGGLE_LABELS.map((label, i) => {
                const active = daysOfWeek.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-label={`Toggle ${label}`}
                    className={cn(
                      "h-9 w-9 rounded-full text-xs font-medium border transition",
                      active
                        ? "bg-[var(--color-accent-strong)] text-white border-transparent"
                        : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {!validDays && (
              <div className="text-[11px] text-[var(--color-danger)] mt-1">
                Pick at least one day.
              </div>
            )}
          </div>
        )}

        {needsDayOfMonth && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-2">Day of month</div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  disabled={monthlyLastDay}
                />
              </div>
              <div>
                <div className="label mb-2">Or</div>
                <div className="flex items-center gap-2 h-11">
                  <Toggle
                    checked={monthlyLastDay}
                    onChange={setMonthlyLastDay}
                  />
                  <span className="text-sm text-[var(--color-fg-2)]">
                    Last day of month
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-[var(--color-fg-3)]">
              Short months fall back to the last day (e.g. 31 → 30 in
              September).
            </div>
          </div>
        )}

        {needsInterval && (
          <div>
            <div className="label mb-2">Every N days</div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
            {!validInterval && (
              <div className="text-[11px] text-[var(--color-danger)] mt-1">
                Must be at least 1.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="label mb-2">Start date</div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <div className="text-[11px] text-[var(--color-fg-3)] mt-1">
            First occurrence on or after this date.
          </div>
        </div>
      </div>
    </Modal>
  );
}
