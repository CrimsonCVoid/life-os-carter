"use client";

import * as React from "react";
import { Droplet, Smile, Activity, Timer, Plus } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Four big-tap-target tiles at the top of /today for the most common
 * actions. Each tile commits in a single tap — no modal, no confirmation.
 * Mood + Energy use a long-press to open a finer-grain picker; the short
 * tap commits to a sensible default (mood = +1 over last value, energy
 * = "fine" baseline).
 */
export function QuickLogTiles() {
  const setHealth = useStore((s) => s.setHealth);
  const startActiveWorkout = useStore((s) => s.startActiveWorkout);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const todayLog = useStore((s) => s.health[todayStr()]);

  const water = todayLog?.waterOz ?? 0;
  const mood = todayLog?.mood;

  const bumpWater = () => {
    const date = todayStr();
    setHealth(date, { waterOz: water + 16 });
    haptic("tap");
  };

  const setMood = (value: number) => {
    setHealth(todayStr(), { mood: value });
    haptic("soft");
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <WaterTile current={water} onAdd={bumpWater} />
      <MoodTile current={mood} onSet={setMood} />
      <EnergyTile />
      <WorkoutTile
        active={!!activeWorkout}
        onStart={() => {
          startActiveWorkout();
          haptic("success");
        }}
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  accentColor,
  onClick,
  onLongPress,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  accentColor: string;
  onClick: () => void;
  onLongPress?: () => void;
  active?: boolean;
}) {
  const pressTimerRef = React.useRef<number | null>(null);
  const longFiredRef = React.useRef(false);

  const startPress = () => {
    longFiredRef.current = false;
    if (!onLongPress) return;
    pressTimerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      onLongPress();
      haptic("long");
    }, 380);
  };
  const endPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const handleClick = () => {
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      className={cn(
        "relative rounded-2xl border p-3.5 text-left",
        "transition-[transform,background-color,border-color] duration-[80ms] ease-out",
        "active:scale-[0.97] active:duration-[60ms]",
        active
          ? "bg-[color:color-mix(in_srgb,var(--color-accent)_18%,var(--color-card))]"
          : "bg-[var(--color-card)] hover-mouse:bg-[var(--color-card-hover)]"
      )}
      style={{
        borderColor: active
          ? "color-mix(in srgb, var(--color-accent) 40%, transparent)"
          : `color-mix(in srgb, ${accentColor} 22%, transparent)`,
      }}
    >
      <div
        className="h-8 w-8 grid place-items-center rounded-full mb-2"
        style={{
          background: `color-mix(in srgb, ${accentColor} 16%, transparent)`,
          color: accentColor,
        }}
      >
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="text-[15px] font-semibold tnum mt-0.5">{value ?? "—"}</div>
    </button>
  );
}

function WaterTile({
  current,
  onAdd,
}: {
  current: number;
  onAdd: () => void;
}) {
  return (
    <Tile
      icon={<Droplet size={16} fill="currentColor" />}
      label="Water"
      value={
        <span>
          {current} <span className="text-[11px] font-normal opacity-70">oz</span>
          <Plus
            size={11}
            className="inline-block ml-1 -mt-0.5 text-[var(--color-fg-3)]"
          />
          <span className="text-[11px] font-normal opacity-70 ml-0.5">16</span>
        </span>
      }
      accentColor="var(--mc-water)"
      onClick={onAdd}
    />
  );
}

function MoodTile({
  current,
  onSet,
}: {
  current?: number;
  onSet: (n: number) => void;
}) {
  const [picker, setPicker] = React.useState(false);
  return (
    <>
      <Tile
        icon={<Smile size={16} />}
        label="Mood"
        value={current ?? "Tap"}
        accentColor="var(--mc-mood-high)"
        onClick={() => {
          // Short tap bumps by 1 (clamped 1..10). Default starting point = 7
          // when there's no prior value — most days are "fine."
          const next = Math.min(10, (current ?? 6) + 1);
          onSet(next);
        }}
        onLongPress={() => setPicker(true)}
      />
      {picker && (
        <MoodPicker
          value={current}
          onPick={(v) => {
            onSet(v);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}

function EnergyTile() {
  // Energy logs are per-period; the short tap nudge isn't well-defined
  // without knowing the current period. For now just deep-link into the
  // energy log modal via a custom event the existing modal listens for.
  return (
    <Tile
      icon={<Activity size={16} />}
      label="Energy"
      value="Log"
      accentColor="var(--mc-energy)"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("life-os:open-energy-log"));
      }}
    />
  );
}

function WorkoutTile({
  active,
  onStart,
}: {
  active: boolean;
  onStart: () => void;
}) {
  return (
    <Tile
      icon={<Timer size={16} />}
      label={active ? "Workout" : "Start workout"}
      value={active ? "In progress" : "Tap"}
      accentColor="var(--color-accent)"
      onClick={onStart}
      active={active}
    />
  );
}

function MoodPicker({
  value,
  onPick,
  onClose,
}: {
  value?: number;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
      <div
        className="relative w-full sm:max-w-sm bg-[var(--color-card)] border border-[var(--color-stroke)] rounded-t-[20px] sm:rounded-[var(--radius-card)] p-5 animate-panel-up"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-1 grid place-items-center sm:hidden mb-3">
          <div className="h-[5px] w-9 rounded-full bg-[color:color-mix(in_srgb,var(--color-fg-3)_70%,transparent)]" />
        </div>
        <div className="text-[17px] font-semibold tracking-tight mb-3">
          How's the mood?
        </div>
        <div className="grid grid-cols-10 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              className={cn(
                "h-12 rounded-lg text-[15px] font-semibold tnum",
                "active:scale-[0.96] transition-transform duration-[60ms]",
                n === value
                  ? "bg-[var(--color-accent-strong)] text-white"
                  : "bg-[var(--color-elevated)] border border-[var(--color-stroke)]"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
