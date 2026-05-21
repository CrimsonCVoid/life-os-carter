"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Delete } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type KeypadMode = "weight" | "reps";

export type NumericKeypadProps = {
  open: boolean;
  onClose: () => void;
  initialValue: number;
  mode: KeypadMode;
  step?: number;
  onCommit: (value: number) => void;
  title?: string;
  unit?: string;
};

const MAX_LEN = 6;

function seedFromInitial(initialValue: number): string {
  if (!Number.isFinite(initialValue) || initialValue === 0) return "0";
  return String(initialValue);
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function NumericKeypad({
  open,
  onClose,
  initialValue,
  mode,
  step,
  onCommit,
  title,
  unit,
}: NumericKeypadProps): React.JSX.Element | null {
  const nudgeStep = step ?? (mode === "weight" ? 5 : 1);

  const [display, setDisplay] = React.useState<string>(() => seedFromInitial(initialValue));
  const [dirty, setDirty] = React.useState<boolean>(false);

  const displayRef = React.useRef(display);
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => {
    displayRef.current = display;
  }, [display]);
  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  React.useEffect(() => {
    if (open) {
      const seeded = seedFromInitial(initialValue);
      setDisplay(seeded);
      setDirty(false);
      displayRef.current = seeded;
      dirtyRef.current = false;
    }
  }, [open, initialValue]);

  const liveValue = React.useMemo(() => {
    const n = Number(display);
    return Number.isFinite(n) ? n : 0;
  }, [display]);

  const pressDigit = React.useCallback(
    (d: string) => {
      haptic("tap");
      const cur = displayRef.current;
      const wasDirty = dirtyRef.current;
      let next: string;
      if (!wasDirty) {
        next = d;
      } else if (cur === "0" && !cur.includes(".")) {
        next = d;
      } else {
        if (cur.length >= MAX_LEN) return;
        next = cur + d;
      }
      setDisplay(next);
      setDirty(true);
    },
    []
  );

  const pressDot = React.useCallback(() => {
    if (mode === "reps") return;
    const cur = displayRef.current;
    if (cur.includes(".")) return;
    haptic("tap");
    if (!dirtyRef.current) {
      setDisplay("0.");
    } else {
      if (cur.length >= MAX_LEN) return;
      setDisplay(cur + ".");
    }
    setDirty(true);
  }, [mode]);

  const pressBackspace = React.useCallback(() => {
    haptic("tap");
    if (!dirtyRef.current) {
      setDisplay("0");
      setDirty(true);
      return;
    }
    const cur = displayRef.current;
    let next = cur.slice(0, -1);
    if (next === "" || next === "-") next = "0";
    setDisplay(next);
  }, []);

  const applyNudge = React.useCallback(
    (delta: number) => {
      const cur = Number(displayRef.current);
      const base = Number.isFinite(cur) ? cur : 0;
      let next = Math.max(0, base + delta);
      next = mode === "weight" ? roundToHalf(next) : Math.round(next);
      const asStr = mode === "weight"
        ? (Number.isInteger(next) ? String(next) : String(next))
        : String(next);
      setDisplay(asStr.length > MAX_LEN ? asStr.slice(0, MAX_LEN) : asStr);
      setDirty(true);
    },
    [mode]
  );

  const handleDone = React.useCallback(() => {
    const raw = Number(displayRef.current);
    const safe = Number.isFinite(raw) ? raw : 0;
    const value = mode === "reps" ? Math.floor(Math.max(0, safe)) : Math.max(0, safe);
    haptic("success");
    onCommit(value);
    onClose();
  }, [mode, onCommit, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const keys: Array<{ label: string; kind: "digit" | "dot" | "back"; value?: string }> = [
    { label: "1", kind: "digit", value: "1" },
    { label: "2", kind: "digit", value: "2" },
    { label: "3", kind: "digit", value: "3" },
    { label: "4", kind: "digit", value: "4" },
    { label: "5", kind: "digit", value: "5" },
    { label: "6", kind: "digit", value: "6" },
    { label: "7", kind: "digit", value: "7" },
    { label: "8", kind: "digit", value: "8" },
    { label: "9", kind: "digit", value: "9" },
    { label: ".", kind: "dot" },
    { label: "0", kind: "digit", value: "0" },
    { label: "back", kind: "back" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close keypad"
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "fixed inset-x-0 bottom-0 z-[60]",
              "bg-[var(--color-card)] border-t border-[var(--color-stroke-strong)]",
              "rounded-t-[24px] shadow-[var(--shadow-float)] select-none"
            )}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            <div className="w-9 h-[5px] rounded-full bg-[color:color-mix(in_srgb,var(--color-fg-3)_70%,transparent)] mx-auto mt-2 mb-1" />

            <div className="px-4 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {title && (
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-medium truncate">
                    {title}
                  </div>
                )}
              </div>
              <div className="flex items-baseline justify-center shrink-0">
                <span className="text-[44px] leading-none font-bold tnum tabular-nums tracking-tight text-[var(--color-fg)]">
                  {display}
                </span>
                {unit && (
                  <span className="text-[18px] text-[var(--color-fg-3)] ml-1">
                    {unit}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleDone}
                  className={cn(
                    "h-9 px-4 rounded-full bg-[var(--color-accent-strong)]",
                    "text-white text-[14px] font-semibold",
                    "active:scale-95 transition-transform duration-[60ms]"
                  )}
                >
                  Done
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 px-3 mb-1.5">
              <RepeatPressButton
                onPress={() => applyNudge(-nudgeStep)}
                className={cn(
                  "h-12 rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
                  "text-[var(--color-fg)] text-[18px] font-medium tnum",
                  "active:scale-[0.96] active:bg-[var(--color-card-hover)]",
                  "transition-transform duration-[60ms]"
                )}
                ariaLabel={`Decrease by ${nudgeStep}`}
              >
                −{nudgeStep}
              </RepeatPressButton>
              <RepeatPressButton
                onPress={() => applyNudge(nudgeStep)}
                className={cn(
                  "h-12 rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
                  "text-[var(--color-fg)] text-[18px] font-medium tnum",
                  "active:scale-[0.96] active:bg-[var(--color-card-hover)]",
                  "transition-transform duration-[60ms]"
                )}
                ariaLabel={`Increase by ${nudgeStep}`}
              >
                +{nudgeStep}
              </RepeatPressButton>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-3">
              {keys.map((k, idx) => {
                if (k.kind === "dot") {
                  const disabled = mode === "reps";
                  return (
                    <button
                      key={`key-${idx}`}
                      type="button"
                      disabled={disabled}
                      onClick={disabled ? undefined : pressDot}
                      className={cn(
                        "h-14 rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
                        "text-[var(--color-fg)] text-[24px] font-medium tnum",
                        "transition-transform duration-[60ms]",
                        disabled
                          ? "opacity-30"
                          : "active:scale-[0.96] active:bg-[var(--color-card-hover)]"
                      )}
                      aria-label="Decimal point"
                    >
                      .
                    </button>
                  );
                }
                if (k.kind === "back") {
                  return (
                    <button
                      key={`key-${idx}`}
                      type="button"
                      onClick={pressBackspace}
                      className={cn(
                        "h-14 rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
                        "text-[var(--color-fg)] grid place-items-center",
                        "active:scale-[0.96] active:bg-[var(--color-card-hover)]",
                        "transition-transform duration-[60ms]"
                      )}
                      aria-label="Backspace"
                    >
                      <Delete size={20} />
                    </button>
                  );
                }
                const digit = k.value as string;
                return (
                  <button
                    key={`key-${idx}`}
                    type="button"
                    onClick={() => pressDigit(digit)}
                    className={cn(
                      "h-14 rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
                      "text-[var(--color-fg)] text-[24px] font-medium tnum",
                      "active:scale-[0.96] active:bg-[var(--color-card-hover)]",
                      "transition-transform duration-[60ms]"
                    )}
                    aria-label={`Digit ${digit}`}
                  >
                    {digit}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

type RepeatPressButtonProps = {
  onPress: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
};

function RepeatPressButton({
  onPress,
  children,
  className,
  ariaLabel,
}: RepeatPressButtonProps): React.JSX.Element {
  const initialTimerRef = React.useRef<number | null>(null);
  const repeatTimerRef = React.useRef<number | null>(null);

  const clear = React.useCallback(() => {
    if (initialTimerRef.current) {
      window.clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      window.clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  const fire = React.useCallback(() => {
    haptic("soft");
    onPress();
  }, [onPress]);

  const handleDown = React.useCallback(() => {
    fire();
    initialTimerRef.current = window.setTimeout(() => {
      repeatTimerRef.current = window.setInterval(fire, 80);
    }, 380);
  }, [fire]);

  React.useEffect(() => clear, [clear]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        handleDown();
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      className={className}
    >
      {children}
    </button>
  );
}
