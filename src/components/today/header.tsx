"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  describeOffset,
  format,
  fromDateStr,
  shiftDate,
  todayStr,
} from "@/lib/date";
import { ScoreRing } from "@/components/score-ring";
import { useStore } from "@/store";
import { useScoreFor } from "@/store/selectors";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useDay } from "./day-context";

export function TodayHeader() {
  const {
    date,
    step,
    goToday,
    isToday,
    isPast,
    canGoBack,
    canGoForward,
    setDate,
    daysBack,
    daysForward,
  } = useDay();
  const day = useStore((s) => s.days[date]);
  const presets = useStore((s) => s.settings.dayTypePresets);
  const setDayType = useStore((s) => s.setDayType);
  const addDayType = useStore((s) => s.addDayType);
  const score = useScoreFor(date);

  const d = fromDateStr(date);
  const weekday = format(d, "EEEE");
  const rest = format(d, "MMMM d");

  const [dayTypeOpen, setDayTypeOpen] = React.useState(false);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  const minDate = shiftDate(todayStr(), -daysBack);
  const maxDate = shiftDate(todayStr(), daysForward);

  const tint = isToday
    ? undefined
    : isPast
    ? "linear-gradient(180deg, color-mix(in srgb, var(--color-fg-3) 8%, transparent), transparent 70%)"
    : "linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%)";

  return (
    <section
      className="card p-5 relative overflow-hidden"
      style={isToday ? undefined : { background: tint }}
    >
      <div className="absolute inset-x-0 top-0 h-32 grad-soft pointer-events-none" />

      <div className="relative flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => {
            haptic("tap");
            step(-1);
          }}
          disabled={!canGoBack}
          className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-2)] disabled:opacity-25 hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            // showPicker is supported on modern browsers; fallback to focus()
            const el = dateInputRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") {
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            } else {
              el.focus();
            }
          }}
          className="flex-1 min-w-0 text-center group"
          aria-label="Pick a date"
        >
          <div className="label">{weekday}</div>
          <div className="text-[24px] font-bold tracking-tight leading-none group-hover:text-[var(--color-accent)] transition">
            {rest}
          </div>
        </button>

        <button
          type="button"
          aria-label="Next day"
          onClick={() => {
            haptic("tap");
            step(1);
          }}
          disabled={!canGoForward}
          className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-2)] disabled:opacity-25 hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
        >
          <ChevronRight size={18} />
        </button>

        {/* Hidden native date input — the date-title button triggers showPicker(). */}
        <input
          ref={dateInputRef}
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            if (!e.target.value) return;
            haptic("tap");
            setDate(e.target.value);
          }}
          className="absolute inset-x-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none w-px h-px"
          aria-hidden
          tabIndex={-1}
        />
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {!isToday && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[10px] font-medium shrink-0",
                isPast
                  ? "bg-[var(--color-elevated)] text-[var(--color-fg-2)] border border-[var(--color-stroke)]"
                  : "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
              )}
            >
              {describeOffset(date)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setDayTypeOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-medium border transition shrink-0",
              day?.dayType
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
            )}
          >
            {day?.dayType || "Set day type"}
            {day?.dayType ? (
              <X
                size={12}
                onClick={(e) => {
                  e.stopPropagation();
                  setDayType(date, "");
                }}
              />
            ) : (
              <Plus size={12} />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isToday && (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                goToday();
              }}
              className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-[var(--color-accent-strong)] text-white"
            >
              Today
            </button>
          )}
          <ScoreRing value={score} />
        </div>
      </div>

      {dayTypeOpen && (
        <DayTypePicker
          presets={presets}
          selected={day?.dayType}
          onPick={(v) => {
            setDayType(date, v);
            setDayTypeOpen(false);
          }}
          onAdd={(v) => {
            addDayType(v);
            setDayType(date, v);
            setDayTypeOpen(false);
          }}
          onClose={() => setDayTypeOpen(false)}
        />
      )}

    </section>
  );
}

function DayTypePicker({
  presets,
  selected,
  onPick,
  onAdd,
  onClose,
}: {
  presets: string[];
  selected?: string;
  onPick: (v: string) => void;
  onAdd: (v: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  return (
    <div className="mt-3 p-3 rounded-xl bg-[var(--color-elevated)] border border-[var(--color-stroke)] animate-fade-in">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs border transition",
              p === selected
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:border-[var(--color-stroke-strong)]"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          onAdd(v);
          setDraft("");
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Custom day type"
          className="control flex-1 h-9 px-3 no-zoom text-sm placeholder:text-[var(--color-fg-3)] outline-none accent-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-9 px-3 rounded-lg bg-[var(--color-accent-strong)] text-white text-xs font-medium disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-2 rounded-lg text-[var(--color-fg-2)] text-xs hover:text-[var(--color-fg)]"
        >
          Done
        </button>
      </form>
    </div>
  );
}

