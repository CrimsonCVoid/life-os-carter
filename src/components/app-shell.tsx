"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/nav/top-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
import { MobileTopBar } from "@/components/nav/mobile-top-bar";
import { HydrateGate } from "@/components/hydrate-gate";
import { Overseer } from "@/components/overseer/overseer";

/**
 * Conditional chrome wrapper. The sign-in route lives at /signin and
 * shows its own pared-down layout — we hide the nav surfaces, HydrateGate,
 * and Overseer there. Everywhere else gets the full app shell.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute =
    pathname === "/signin" || pathname.startsWith("/signin/");

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <HydrateGate>
      <TopNav />
      <MobileTopBar />
      {children}
      <BottomNav />
      <Overseer />
    </HydrateGate>
  );
}
