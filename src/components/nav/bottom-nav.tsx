"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BarChart3,
  CheckSquare,
  Dumbbell,
  Apple,
  BookOpen,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const TABS = [
  { href: "/", label: "Today", Icon: Home },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/habits", label: "Habits", Icon: CheckSquare },
  { href: "/gym", label: "Gym", Icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", Icon: Apple },
  { href: "/journal", label: "Journal", Icon: BookOpen },
  { href: "/body", label: "Body", Icon: Scale },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--color-base)]/85 backdrop-blur-md border-t border-[var(--color-stroke)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around max-w-[640px] mx-auto">
        {TABS.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/"
              : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                onClick={() => haptic("tap")}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "h-14 w-full flex flex-col items-center justify-center gap-0.5 relative transition active:scale-95",
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-fg-3)]"
                )}
              >
                <t.Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 2}
                  fill={active ? "currentColor" : "none"}
                  fillOpacity={active ? 0.15 : 0}
                />
                <span
                  className={cn(
                    "text-[10px] tracking-tight",
                    active ? "font-semibold" : "font-normal"
                  )}
                >
                  {t.label}
                </span>
                {active && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-[var(--color-accent)]" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
