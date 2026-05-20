"use client";

import Link from "next/link";
import { BookOpen, Scale, Settings } from "lucide-react";

/**
 * Mobile-only top bar — safe-area inset + a small icon row.
 *
 * The bottom tab bar holds five primary tabs per iOS HIG; Journal +
 * Body lost their slots in the 7→5 reduction, so we surface them
 * here for one-tap access on every screen. Settings rounds out the
 * trio. Each button is a 44×44 target.
 */
export function MobileTopBar() {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 pointer-events-none md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex justify-end items-center gap-2 px-3 py-2">
        <TopIcon href="/journal" label="Journal">
          <BookOpen size={17} />
        </TopIcon>
        <TopIcon href="/body" label="Body">
          <Scale size={17} />
        </TopIcon>
        <TopIcon href="/settings" label="Settings">
          <Settings size={17} />
        </TopIcon>
      </div>
    </div>
  );
}

function TopIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="pointer-events-auto h-11 w-11 grid place-items-center rounded-full bg-[var(--color-card)]/85 backdrop-blur-md border border-[var(--color-stroke)] text-[var(--color-fg-2)] active:scale-95 transition"
    >
      {children}
    </Link>
  );
}
