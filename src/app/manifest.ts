import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life OS",
    short_name: "Life OS",
    description: "Your daily command center.",
    start_url: "/",
    // Tight scope keeps OAuth callbacks anchored to the PWA origin so
    // iOS Safari is more likely to route them back into the installed
    // standalone window after sign-in.
    scope: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#050507",
    orientation: "portrait",
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
      },
    ],
    categories: ["productivity", "health", "lifestyle"],
  };
}
