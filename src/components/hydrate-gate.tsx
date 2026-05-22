"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useStore } from "@/store";

/**
 * Blocks render until Zustand has hydrated from localStorage. Onboarding
 * has been dropped — /signin is now the only entry gate. First-time users
 * land on the home screen with sensible defaults right after the Google
 * SSO handshake. If someone hits /onboarding directly (old bookmark,
 * deep link), bounce them home.
 */
export function HydrateGate({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const router = useRouter();
  const pathname = usePathname();
  const [showLoader, setShowLoader] = React.useState(false);

  // delay loader to avoid flash
  React.useEffect(() => {
    const t = window.setTimeout(() => setShowLoader(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  // Safety net: if Zustand's persist middleware never flips `hydrated`,
  // give up after 2.5s and lift the gate so the user isn't trapped on
  // "Loading…" forever.
  React.useEffect(() => {
    if (hydrated) return;
    const t = window.setTimeout(() => {
      useStore.getState().setHydrated();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [hydrated]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
      router.replace("/");
    }
  }, [hydrated, pathname, router]);

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
