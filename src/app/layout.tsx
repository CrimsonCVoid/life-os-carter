import type { Metadata, Viewport } from "next";
import * as React from "react";
import { TopNav } from "@/components/nav/top-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
import { MobileTopBar } from "@/components/nav/mobile-top-bar";
import { HydrateGate } from "@/components/hydrate-gate";
import { AccentProvider } from "@/components/accent-provider";
import { Overseer } from "@/components/overseer/overseer";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { CloudSyncMount } from "@/components/cloud-sync-mount";
import { ActiveWorkoutBanner } from "@/components/workout/active-workout-banner";
import { QuickActionRouter } from "@/components/quick-action-router";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life OS",
  description: "Your day at a glance.",
  applicationName: "Life OS",
  appleWebApp: {
    capable: true,
    title: "Life OS",
    // default = system-controlled status bar text. Light system → dark text,
    // dark system → light text. Matches the auto color-scheme behavior.
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
  // iOS Safari ignores manifest icons for the home-screen install path —
  // it ONLY reads apple-touch-icon link tags. Next handles that for us via
  // src/app/apple-icon.tsx, which is exported here automatically.
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
    date: false,
  },
};

export const viewport: Viewport = {
  // Match the status bar color to the dark base. Safari uses this for the
  // OS-level chrome tint when the page first loads.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050507" },
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // userScalable=no prevents the iOS "double-tap to zoom" that pulls weird
  // gestures into focused inputs. Pinch-to-zoom on images still works since
  // we don't apply touch-action: none globally.
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AccentProvider />
        <ServiceWorkerRegister />
        <CloudSyncMount />
        <HydrateGate>
          <TopNav />
          <MobileTopBar />
          {children}
          <BottomNav />
          <Overseer />
          <ActiveWorkoutBanner />
          {/* Suspense around the search-params-reading router so it doesn't
           * blow up the static render path. */}
          <React.Suspense fallback={null}>
            <QuickActionRouter />
          </React.Suspense>
        </HydrateGate>
      </body>
    </html>
  );
}
