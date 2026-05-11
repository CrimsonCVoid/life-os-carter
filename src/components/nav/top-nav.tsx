"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/stats", label: "Stats" },
  { href: "/habits", label: "Habits" },
  { href: "/journal", label: "Journal" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-30 bg-[var(--color-base)]/85 backdrop-blur-md border-b border-[var(--color-stroke)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto max-w-[640px] px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 hide-scroll overflow-x-auto flex-1">
          {TABS.map((t) => {
            const active =
              t.href === "/"
                ? pathname === "/"
                : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "relative h-9 px-3 grid place-items-center text-xs font-semibold tracking-wide uppercase rounded-lg transition",
                  active
                    ? "text-[var(--color-fg)]"
                    : "text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)]"
                )}
              >
                {t.label}
                {active && (
                  <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] rounded-full bg-[var(--color-accent)]" />
                )}
              </Link>
            );
          })}
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="h-9 w-9 grid place-items-center rounded-lg text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
        >
          <Settings size={18} />
        </Link>
      </div>
    </nav>
  );
}
