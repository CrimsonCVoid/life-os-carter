"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  X,
  Mic,
  Camera,
  Timer,
  Droplet,
  ListTodo,
  Apple,
  Pen,
} from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Floating action button bottom-right. Tap opens a radial / bottom-sheet
 * action picker. Hidden on auth + onboarding. Suppressed when the workout
 * banner is also visible (would visually collide) — the workout banner is
 * its own primary action surface.
 */
export function QuickCaptureFab() {
  const pathname = usePathname();
  const router = useRouter();
  const active = useStore((s) => s.activeWorkout);
  const startWorkout = useStore((s) => s.startActiveWorkout);
  const setHealth = useStore((s) => s.setHealth);
  const [open, setOpen] = React.useState(false);

  if (pathname === "/login" || pathname.startsWith("/onboarding")) return null;
  // Don't double-stack with the workout banner — the banner already gives
  // a tap-to-act surface, and visually the FAB would overlap it.
  if (active) return null;

  const goAndClose = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const actions: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    onClick: () => void;
  }> = [
    {
      key: "workout",
      label: "Start workout",
      icon: <Timer size={16} />,
      color: "var(--color-accent)",
      onClick: () => {
        startWorkout();
        haptic("success");
        setOpen(false);
      },
    },
    {
      key: "photo",
      label: "Progress photo",
      icon: <Camera size={16} />,
      color: "var(--mc-protein)",
      onClick: () => goAndClose("/body?action=capture"),
    },
    {
      key: "water",
      label: "+16oz water",
      icon: <Droplet size={16} fill="currentColor" />,
      color: "var(--mc-water)",
      onClick: () => {
        const date = todayStr();
        const log = useStore.getState().health[date];
        const current = typeof log?.waterOz === "number" ? log.waterOz : 0;
        setHealth(date, { waterOz: current + 16 });
        haptic("tap");
        setOpen(false);
      },
    },
    {
      key: "voice",
      label: "Voice journal",
      icon: <Mic size={16} />,
      color: "var(--mc-mood-high)",
      onClick: () => goAndClose("/journal?action=voice"),
    },
    {
      key: "meal",
      label: "Log meal",
      icon: <Apple size={16} />,
      color: "var(--mc-calories)",
      onClick: () => goAndClose("/nutrition"),
    },
    {
      key: "todo",
      label: "Quick todo",
      icon: <ListTodo size={16} />,
      color: "var(--mc-carbs)",
      onClick: () => goAndClose("/?action=quick-todo"),
    },
    {
      key: "note",
      label: "Quick note",
      icon: <Pen size={16} />,
      color: "var(--mc-sleep)",
      onClick: () => goAndClose("/journal"),
    },
  ];

  return (
    <>
      {/* FAB itself */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen((v) => !v);
        }}
        aria-label={open ? "Close menu" : "Quick capture"}
        className={cn(
          "fixed z-40 right-4 grid place-items-center rounded-full shadow-[var(--shadow-float)]",
          "h-14 w-14",
          "bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-4",
          "bg-[var(--color-accent-strong)] text-white",
          "transition-transform duration-150 ease-out",
          "active:scale-[0.92] active:duration-[60ms]",
          open && "rotate-45"
        )}
        style={{ willChange: "transform" }}
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      {/* Action sheet — bottom-sheet on mobile, popover on desktop */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-end sm:justify-end"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className={cn(
              "relative w-full bg-[var(--color-card)] border border-[var(--color-stroke)]",
              "rounded-t-[20px] sm:rounded-[var(--radius-card)]",
              "sm:mr-4 sm:mb-20 sm:max-w-xs",
              "shadow-[var(--shadow-float)] p-3 animate-panel-up"
            )}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-1 grid place-items-center sm:hidden mb-2">
              <div className="h-[5px] w-9 rounded-full bg-[color:color-mix(in_srgb,var(--color-fg-3)_70%,transparent)]" />
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="text-[12px] uppercase tracking-wider text-[var(--color-fg-3)]">
                Quick capture
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="h-7 w-7 grid place-items-center rounded-full text-[var(--color-fg-2)] active:scale-95"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 mt-1">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.onClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left",
                    "active:bg-[var(--color-elevated)] active:scale-[0.99]",
                    "transition-[transform,background-color] duration-[80ms] ease-out"
                  )}
                >
                  <span
                    className="h-9 w-9 grid place-items-center rounded-full shrink-0"
                    style={{
                      background: `color-mix(in srgb, ${a.color} 16%, transparent)`,
                      color: a.color,
                    }}
                  >
                    {a.icon}
                  </span>
                  <span className="text-[15px] font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
