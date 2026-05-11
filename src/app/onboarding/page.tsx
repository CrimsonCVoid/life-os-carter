"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { HabitGlyph } from "@/components/habit-icon";
import { useStore } from "@/store";
import {
  AccentColor,
  DEFAULT_MORNING_ROUTINE,
  HABIT_TEMPLATES,
  Units,
} from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ACCENT_SWATCH: Array<{
  key: AccentColor;
  label: string;
  color: string;
  grad: string;
}> = [
  { key: "violet", label: "Violet", color: "#8B5CF6", grad: "linear-gradient(135deg,#8B5CF6,#6366F1)" },
  { key: "emerald", label: "Emerald", color: "#10B981", grad: "linear-gradient(135deg,#10B981,#059669)" },
  { key: "rose", label: "Rose", color: "#F43F5E", grad: "linear-gradient(135deg,#F43F5E,#BE185D)" },
  { key: "amber", label: "Amber", color: "#F59E0B", grad: "linear-gradient(135deg,#F59E0B,#D97706)" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const setUnits = useStore((s) => s.setUnits);
  const setAccent = useStore((s) => s.setAccent);
  const addHabit = useStore((s) => s.addHabit);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetRoutine = useStore((s) => s.resetRoutineToDefaults);

  const [step, setStep] = React.useState(0);
  const [weight, setWeight] = React.useState<"lb" | "kg">("lb");
  const [liquid, setLiquid] = React.useState<"oz" | "ml">("oz");
  const [accent, setAccentState] = React.useState<AccentColor>("violet");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [routinePicked, setRoutinePicked] = React.useState<Set<string>>(
    () => new Set(DEFAULT_MORNING_ROUTINE.map((d) => d.name))
  );

  const togglePick = (name: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleRoutinePick = (name: string) =>
    setRoutinePicked((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const finish = () => {
    setUnits({ weight, liquid } as Units);
    setAccent(accent);
    for (const name of picked) {
      const t = HABIT_TEMPLATES.find((x) => x.name === name);
      if (t) addHabit(t.name, t.icon);
    }
    resetRoutine(Array.from(routinePicked));
    updateSettings({ hasOnboarded: true });
    haptic("success");
    router.replace("/");
  };

  const next = () => setStep((s) => s + 1);

  const steps: Array<{ render: React.ReactNode; canNext: boolean; cta?: string }> = [
    {
      render: <WelcomeStep />,
      canNext: true,
      cta: "Get started",
    },
    {
      render: (
        <StepShell title="Pick your units" subtitle="You can change these later.">
          <div className="space-y-5">
            <div>
              <div className="label mb-2">Weight</div>
              <Segmented<"lb" | "kg">
                value={weight}
                onChange={setWeight}
                options={[
                  { value: "lb", label: "Pounds (lb)" },
                  { value: "kg", label: "Kilograms (kg)" },
                ]}
              />
            </div>
            <div>
              <div className="label mb-2">Liquid</div>
              <Segmented<"oz" | "ml">
                value={liquid}
                onChange={setLiquid}
                options={[
                  { value: "oz", label: "Ounces (oz)" },
                  { value: "ml", label: "Milliliters (ml)" },
                ]}
              />
            </div>
          </div>
        </StepShell>
      ),
      canNext: true,
    },
    {
      render: (
        <StepShell title="Pick an accent" subtitle="Used sparingly throughout the app.">
          <div className="grid grid-cols-2 gap-3">
            {ACCENT_SWATCH.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAccentState(a.key)}
                className={cn(
                  "h-32 rounded-2xl text-white text-sm font-medium relative overflow-hidden border-2 transition",
                  accent === a.key
                    ? "border-white/40 scale-[1.01]"
                    : "border-transparent"
                )}
                style={{ background: a.grad }}
              >
                <span className="absolute left-3 bottom-3">{a.label}</span>
                {accent === a.key && (
                  <span className="absolute top-3 right-3 h-6 w-6 grid place-items-center rounded-full bg-white/20">
                    <Check size={14} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </StepShell>
      ),
      canNext: true,
    },
    {
      render: (
        <StepShell
          title="Pick 3 habits to start"
          subtitle="You can edit or add more anytime."
        >
          <div className="grid grid-cols-2 gap-2">
            {HABIT_TEMPLATES.map((t) => {
              const on = picked.has(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => togglePick(t.name)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition active:scale-[0.98]",
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-stroke)] bg-[var(--color-elevated)]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={cn(
                        "h-8 w-8 grid place-items-center rounded-lg",
                        on
                          ? "bg-[var(--color-accent-strong)] text-white"
                          : "bg-[var(--color-card)] text-[var(--color-fg-2)]"
                      )}
                    >
                      <HabitGlyph name={t.icon} size={14} />
                    </div>
                    {on && (
                      <Check
                        size={14}
                        className="text-[var(--color-accent)]"
                      />
                    )}
                  </div>
                  <div className="mt-2 text-[12px] font-medium leading-tight">
                    {t.name}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-center text-xs text-[var(--color-fg-2)]">
            {picked.size} selected
            {picked.size === 0 && " · skip is fine"}
          </div>
        </StepShell>
      ),
      canNext: true,
    },
    {
      render: (
        <StepShell
          title="Build your morning"
          subtitle="Check the ones you actually want. You can change these anytime."
        >
          <div className="space-y-1.5">
            {DEFAULT_MORNING_ROUTINE.map((r) => {
              const on = routinePicked.has(r.name);
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => toggleRoutinePick(r.name)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition active:scale-[0.99]",
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-stroke)] bg-[var(--color-elevated)] opacity-70"
                  )}
                >
                  <span className="text-2xl leading-none">{r.icon}</span>
                  <span className="flex-1 text-sm font-medium">{r.name}</span>
                  <span
                    className={cn(
                      "h-5 w-5 grid place-items-center rounded-md border transition",
                      on
                        ? "bg-[var(--color-accent-strong)] border-[var(--color-accent-strong)] text-white"
                        : "border-[var(--color-stroke-strong)]"
                    )}
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-center text-xs text-[var(--color-fg-2)]">
            {routinePicked.size} of {DEFAULT_MORNING_ROUTINE.length} kept
          </div>
        </StepShell>
      ),
      canNext: true,
      cta: "Finish setup",
    },
  ];

  const last = step === steps.length - 1;

  return (
    <main
      className="mx-auto w-full max-w-[480px] min-h-dvh px-5 pb-8 flex flex-col"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-1.5 mb-8">
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 rounded-full transition-all",
              i <= step
                ? "bg-[var(--color-accent)] w-8"
                : "bg-[var(--color-stroke)] w-4"
            )}
          />
        ))}
      </div>

      <div className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {steps[step].render}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="pt-4 flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="lg"
          onClick={last ? finish : next}
          disabled={!steps[step].canNext}
        >
          {steps[step].cta ?? "Continue"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </main>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="text-sm text-[var(--color-fg-2)] mt-1.5">{subtitle}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="text-center pt-10">
      <div className="mx-auto h-20 w-20 rounded-[28px] grad-hero grid place-items-center shadow-[var(--shadow-glow)]">
        <Sparkles size={32} className="text-white" />
      </div>
      <h1 className="mt-6 text-[34px] font-bold tracking-tight">Life OS</h1>
      <p className="mt-2 text-sm text-[var(--color-fg-2)] max-w-xs mx-auto leading-relaxed">
        Your daily command center for health, productivity, and life — with a
        sharp AI coach that sees the whole picture.
      </p>
      <ul className="mt-8 text-left text-sm text-[var(--color-fg-2)] space-y-2 max-w-xs mx-auto">
        <Bullet>Track goals, habits, mood, sleep, workouts.</Bullet>
        <Bullet>Patterns surface automatically.</Bullet>
        <Bullet>Local-first. Your data stays yours.</Bullet>
      </ul>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check size={14} className="text-[var(--color-accent)] mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
