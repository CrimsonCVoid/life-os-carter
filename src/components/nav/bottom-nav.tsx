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
  if (pathname === "/login" || pathname.startsWith("/onboarding")) return null;
  return (
    <nav
      className={cn(
        // iOS tab bar: blurred chrome above the safe area, 1px hairline top
        // border, no rounded corners — looks like a UITabBar.
        "fixed bottom-0 left-0 right-0 z-30",
        "ios-blur border-t border-[var(--color-stroke)]",
        "md:hidden"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around max-w-[640px] mx-auto px-1">
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
                  // 44pt+ height, no sticky highlight, snappy press
                  "h-12 w-full flex flex-col items-center justify-center gap-[2px]",
                  "relative transition-[color,transform] duration-150 ease-[var(--ease-spring)]",
                  "active:scale-[0.94]",
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-fg-2)]"
                )}
              >
                <t.Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.9}
                  // SF Symbols-style "filled when selected" — Lucide icons
                  // accept fill on their inner paths via fill="currentColor".
                  fill={active ? "currentColor" : "none"}
                  fillOpacity={active ? 0.18 : 0}
                />
                <span
                  className={cn(
                    "text-[10px] leading-none tracking-tight tabular-nums",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
