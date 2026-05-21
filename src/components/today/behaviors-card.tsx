"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  Activity,
  Brain,
  Coffee,
  Flame,
  Smartphone,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wind,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { BEHAVIOR_FIELDS, type BehaviorLog } from "@/lib/types";
import { findCorrelations } from "@/lib/behavior-correlation";
import { Modal } from "@/components/ui/modal";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const ICON_MAP: Record<string, LucideIcon> = {
  coffee: Coffee,
  wine: Wine,
  utensils: Utensils,
  smartphone: Smartphone,
  activity: Activity,
  brain: Brain,
  wind: Wind,
  flame: Flame,
  snowflake: Snowflake,
};

export function BehaviorsCard() {
  const behaviors = useStore((s) => s.behaviors);
  const health = useStore((s) => s.health);
  const setBehavior = useStore((s) => s.setBehavior);

  const today = todayStr();
  const todayLog: BehaviorLog = behaviors[today] ?? { date: today };

  const [editorField, setEditorField] = React.useState<
    (typeof BEHAVIOR_FIELDS)[number] | null
  >(null);
  const [editorBuffer, setEditorBuffer] = React.useState<number>(0);

  const correlations = React.useMemo(
    () => findCorrelations({ behaviors, health }),
    [behaviors, health]
  );

  const openEditor = (field: (typeof BEHAVIOR_FIELDS)[number]) => {
    const current = todayLog[field.key];
    setEditorBuffer(typeof current === "number" ? current : field.step ?? 0);
    setEditorField(field);
  };

  const incrementField = (field: (typeof BEHAVIOR_FIELDS)[number]) => {
    if (!field.numeric) {
      const curr = todayLog[field.key];
      const next = curr ? undefined : true;
      setBehavior(today, { [field.key]: next } as Partial<BehaviorLog>);
      haptic("soft");
      return;
    }
    const curr = todayLog[field.key];
    const currentNum = typeof curr === "number" ? curr : 0;
    const step = field.step ?? 1;
    const max = field.max ?? 100;
    const next = Math.min(max, currentNum + step);
    setBehavior(today, { [field.key]: next } as Partial<BehaviorLog>);
    haptic("tap");
  };

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-3)] font-medium mb-2 px-1">
        Behaviors · Today
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {BEHAVIOR_FIELDS.map((field) => (
          <BehaviorTile
            key={field.key}
            field={field}
            value={todayLog[field.key]}
            onTap={() => incrementField(field)}
            onLongPress={field.numeric ? () => openEditor(field) : undefined}
          />
        ))}
      </div>

      {correlations.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] font-medium mb-1.5 px-1">
            Insights
          </div>
          <div className="space-y-1.5">
            {correlations.slice(0, 2).map((c) => {
              const Icon =
                c.direction === "negative" ? TrendingDown : TrendingUp;
              const color =
                c.direction === "negative"
                  ? "var(--color-warning)"
                  : "var(--color-success)";
              return (
                <motion.div
                  key={c.behavior as string}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.24 }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-elevated)]/40 border border-[var(--color-stroke)]"
                >
                  <Icon size={11} style={{ color }} />
                  <span className="text-[11px] text-[var(--color-fg-2)] leading-tight">
                    {c.text}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={!!editorField}
        onClose={() => setEditorField(null)}
        title={editorField?.label}
        size="sm"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!editorField) return;
                setBehavior(today, {
                  [editorField.key]: undefined,
                } as Partial<BehaviorLog>);
                haptic("warn");
                setEditorField(null);
              }}
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                if (!editorField) return;
                setBehavior(today, {
                  [editorField.key]: editorBuffer,
                } as Partial<BehaviorLog>);
                haptic("success");
                setEditorField(null);
              }}
            >
              Save
            </Button>
          </div>
        }
      >
        {editorField && (
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-[28px] font-bold tnum tracking-tight">
                {editorBuffer}
              </div>
              <div className="text-[11px] text-[var(--color-fg-3)]">
                {editorField.unit || "value"}
              </div>
            </div>
            <Slider
              value={editorBuffer}
              min={0}
              max={editorField.max ?? 100}
              step={editorField.step ?? 1}
              onChange={(v) => setEditorBuffer(v)}
            />
          </div>
        )}
      </Modal>
    </section>
  );
}

function BehaviorTile({
  field,
  value,
  onTap,
  onLongPress,
}: {
  field: (typeof BEHAVIOR_FIELDS)[number];
  value: BehaviorLog[keyof BehaviorLog];
  onTap: () => void;
  onLongPress?: () => void;
}) {
  const Icon = ICON_MAP[field.icon] ?? Activity;
  const isSet =
    field.numeric ? typeof value === "number" && value > 0 : !!value;

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
    onTap();
  };

  const displayValue = field.numeric
    ? typeof value === "number" && value > 0
      ? `${value}${field.unit ? " " + field.unit : ""}`
      : "—"
    : value
      ? "Yes"
      : "—";

  return (
    <button
      type="button"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onClick={handleClick}
      className={cn(
        "h-[92px] rounded-xl border p-2.5 text-left",
        "active:scale-[0.97] transition-transform duration-[80ms] ease-out"
      )}
      style={{
        borderColor: isSet
          ? "color-mix(in srgb, var(--color-accent) 30%, var(--color-stroke))"
          : "var(--color-stroke)",
        background: isSet
          ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-card))"
          : "var(--color-card)",
      }}
    >
      <div
        className="h-7 w-7 grid place-items-center rounded-full mb-1.5"
        style={{
          background: isSet
            ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
            : "var(--color-elevated)",
          color: isSet
            ? "var(--color-accent)"
            : "var(--color-fg-2)",
        }}
      >
        <Icon size={14} />
      </div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] truncate">
        {field.label}
      </div>
      <div className="text-[14px] font-semibold tnum mt-0.5">
        {displayValue}
      </div>
    </button>
  );
}
