"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

/**
 * Mobile-only top bar — just the safe-area inset and a floating
 * Settings gear. The full nav lives in BottomNav on mobile.
 */
export function MobileTopBar() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/onboarding")) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 pointer-events-none md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex justify-end px-3 py-2">
        <Link
          href="/settings"
          aria-label="Settings"
          className="pointer-events-auto h-10 w-10 grid place-items-center rounded-full bg-[var(--color-card)]/85 backdrop-blur-md border border-[var(--color-stroke)] text-[var(--color-fg-2)] active:scale-95 transition"
        >
          <Settings size={17} />
        </Link>
      </div>
    </div>
  );
}
