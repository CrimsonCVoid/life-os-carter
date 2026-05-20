import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life OS",
    short_name: "Life OS",
    description: "Your daily command center.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#050507",
    orientation: "portrait",
    // dir + lang help iOS install prompts render correctly.
    dir: "ltr",
    lang: "en-US",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    // PWA App Shortcuts. iOS 16.4+ surfaces these when you long-press the
    // home screen icon. Each URL deep-links via ?action= so the layout's
    // QuickActionRouter can immediately trigger the right modal/state.
    shortcuts: [
      {
        name: "Start workout",
        short_name: "Workout",
        description: "Begin an active workout session with a timer",
        url: "/?action=start-workout",
        icons: [{ src: "/icon", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Capture daily photo",
        short_name: "Photo",
        description: "Open the progress photo camera",
        url: "/body?action=capture",
        icons: [{ src: "/icon", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Voice journal",
        short_name: "Journal",
        description: "Record a voice journal entry",
        url: "/journal?action=voice",
        icons: [{ src: "/icon", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Log water",
        short_name: "Water",
        description: "Add 16oz to today's water",
        url: "/?action=log-water",
        icons: [{ src: "/icon", sizes: "192x192", type: "image/png" }],
      },
    ],
    categories: ["productivity", "health", "lifestyle"],
  };
}
