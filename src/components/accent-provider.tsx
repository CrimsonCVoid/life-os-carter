"use client";

import * as React from "react";
import { useStore } from "@/store";
import { ACCENT_HUES } from "@/lib/utils";

const ACCENT_TO_HEX: Record<string, { strong: string; soft: string }> = {
  violet: { strong: "#8B5CF6", soft: "#A78BFA" },
  emerald: { strong: "#10B981", soft: "#34D399" },
  rose: { strong: "#F43F5E", soft: "#FB7185" },
  amber: { strong: "#F59E0B", soft: "#FBBF24" },
};

export function AccentProvider() {
  const accent = useStore((s) => s.settings.accent);

  React.useEffect(() => {
    const hex = ACCENT_TO_HEX[accent] ?? ACCENT_TO_HEX.violet;
    const hue = ACCENT_HUES[accent] ?? ACCENT_HUES.violet;
    const root = document.documentElement;
    root.style.setProperty("--color-accent", hex.soft);
    root.style.setProperty("--color-accent-strong", hex.strong);
    root.style.setProperty(
      "--color-accent-soft",
      `hsla(${hue.h}, ${hue.s}%, ${hue.l}%, 0.14)`
    );
  }, [accent]);

  return null;
}
