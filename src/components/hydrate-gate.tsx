"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useStore } from "@/store";

/**
 * Blocks render until Zustand has hydrated from localStorage,
 * and redirects to /onboarding if the user hasn't onboarded yet.
 */
export function HydrateGate({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const hasOnboarded = useStore((s) => s.settings.hasOnboarded);
  const router = useRouter();
  const pathname = usePathname();
  const [showLoader, setShowLoader] = React.useState(false);

  // delay loader to avoid flash
  React.useEffect(() => {
    const t = window.setTimeout(() => setShowLoader(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!hasOnboarded && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
    if (hasOnboarded && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [hydrated, hasOnboarded, pathname, router]);

  if (!hydrated) {
    return (
      <div className="min-h-dvh grid place-items-center">
        {showLoader && (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="h-10 w-10 rounded-2xl grad-hero" />
            <div className="text-xs text-[var(--color-fg-3)]">Loading…</div>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
