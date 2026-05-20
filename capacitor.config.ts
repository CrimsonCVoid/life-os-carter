/**
 * Capacitor configuration. The native iOS shell live-loads the existing
 * Vercel-hosted Next.js app — no static export, no asset bundling. The
 * webDir is a placeholder so `npx cap add ios` succeeds; the real content
 * comes from server.url at runtime.
 *
 * If you ever want to ship offline-capable (no Vercel dependency), switch
 * to Next.js static export (`output: "export"` in next.config.ts) + remove
 * the server.url block — Capacitor will then load index.html from the
 * bundled out/ directory instead.
 */

import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.CAPACITOR_DEV === "1";

const config: CapacitorConfig = {
  appId: "com.carterbrady.lifeos",
  appName: "Life OS",
  webDir: "out",
  server: {
    url: isDev
      ? "http://localhost:3000"
      : "https://life-os-carter.vercel.app",
    cleartext: isDev,
  },
  ios: {
    // Matches the dark theme; iOS uses this for the splash + first paint
    // before the WebView loads the Vercel URL.
    backgroundColor: "#050507",
    // contentInset: "always" keeps content out from under the safe area
    // automatically without the webapp needing to know it's in Capacitor.
    contentInset: "always",
  },
  plugins: {
    Haptics: {},
    StatusBar: {
      // We control color-scheme via prefers-color-scheme in globals.css;
      // matching the system style means our dark gradient bleeds correctly.
      style: "DEFAULT",
      backgroundColor: "#050507",
    },
  },
};

export default config;
