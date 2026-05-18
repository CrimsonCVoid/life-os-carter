import type { Metadata, Viewport } from "next";
import { TopNav } from "@/components/nav/top-nav";
import { BottomNav } from "@/components/nav/bottom-nav";
import { MobileTopBar } from "@/components/nav/mobile-top-bar";
import { HydrateGate } from "@/components/hydrate-gate";
import { AccentProvider } from "@/components/accent-provider";
import { Overseer } from "@/components/overseer/overseer";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { CloudSyncMount } from "@/components/cloud-sync-mount";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life OS",
  description: "Your day at a glance.",
  applicationName: "Life OS",
  appleWebApp: {
    capable: true,
    title: "Life OS",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
        </HydrateGate>
      </body>
    </html>
  );
}
