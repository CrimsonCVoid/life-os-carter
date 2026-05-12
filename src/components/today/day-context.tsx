"use client";

import * as React from "react";
import {
  clampDateWithin,
  shiftDate,
  todayStr,
} from "@/lib/date";
import { useStore } from "@/store";
import type { DateStr } from "@/lib/types";

type DayCtx = {
  date: DateStr;
  setDate: (d: DateStr) => void;
  step: (delta: number) => void;
  goToday: () => void;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  daysBack: number;
  daysForward: number;
  canGoBack: boolean;
  canGoForward: boolean;
};

const Ctx = React.createContext<DayCtx | null>(null);

export function DayProvider({ children }: { children: React.ReactNode }) {
  const settings = useStore((s) => s.settings.dayNavigation);
  const [date, setDateRaw] = React.useState<DateStr>(() => todayStr());

  const setDate = React.useCallback(
    (d: DateStr) => {
      setDateRaw(
        clampDateWithin(d, settings.daysBack, settings.daysForward)
      );
    },
    [settings.daysBack, settings.daysForward]
  );

  const step = React.useCallback(
    (delta: number) => {
      setDate(shiftDate(date, delta));
    },
    [date, setDate]
  );

  const goToday = React.useCallback(() => setDate(todayStr()), [setDate]);

  const today = todayStr();
  const isToday = date === today;
  const isPast = date < today;
  const isFuture = date > today;
  const minDate = shiftDate(today, -settings.daysBack);
  const maxDate = shiftDate(today, settings.daysForward);

  const value: DayCtx = {
    date,
    setDate,
    step,
    goToday,
    isToday,
    isPast,
    isFuture,
    daysBack: settings.daysBack,
    daysForward: settings.daysForward,
    canGoBack: date > minDate,
    canGoForward: date < maxDate,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Selected day date — falls back to actual today when no DayProvider is mounted. */
export function useSelectedDate(): DateStr {
  const ctx = React.useContext(Ctx);
  return ctx?.date ?? todayStr();
}

/** Full day-navigation context. Only valid inside a DayProvider. */
export function useDay(): DayCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error("useDay must be used inside a DayProvider");
  }
  return ctx;
}

/** True if the user is viewing actual-today. Defaults to true outside a provider. */
export function useIsActualToday(): boolean {
  const ctx = React.useContext(Ctx);
  return ctx ? ctx.isToday : true;
}
