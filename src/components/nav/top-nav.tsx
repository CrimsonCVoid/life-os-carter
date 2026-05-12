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
  { href: "/gym", label: "Gym" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/journal", label: "Journal" },
  { href: "/body", label: "Body" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});

  // ensure the active tab is visible (centered if possible)
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = TABS.find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)
    );
    if (!active) return;
    const el = itemRefs.current[active.href];
    if (!el) return;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const offset =
      el.offsetLeft - scroller.clientWidth / 2 + el.clientWidth / 2;
    scroller.scrollTo({ left: offset, behavior: "smooth" });
    void sRect;
    void eRect;
  }, [pathname]);

  return (
    <nav
      className="sticky top-0 z-30 bg-[var(--color-base)]/85 backdrop-blur-md border-b border-[var(--color-stroke)] hidden md:block"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto max-w-[640px] px-4 h-14 flex items-center gap-2">
        <div
          ref={scrollerRef}
          className="flex items-center gap-1 hide-scroll overflow-x-auto flex-1 snap-x scroll-smooth"
          style={{ scrollPaddingInline: 16 }}
        >
          {TABS.map((t) => {
            const active =
              t.href === "/"
                ? pathname === "/"
                : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                ref={(el) => {
                  itemRefs.current[t.href] = el;
                }}
                className={cn(
                  "relative h-9 px-3 grid place-items-center text-xs font-semibold tracking-wide uppercase rounded-lg transition snap-start shrink-0",
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
          className="h-9 w-9 grid place-items-center rounded-lg text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition shrink-0"
        >
          <Settings size={18} />
        </Link>
      </div>
    </nav>
  );
}
