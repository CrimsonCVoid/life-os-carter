"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

type Briefing = {
  headline: string;
  observations: string[];
  generatedAt: string;
};

export function DailyBriefingCard() {
  const [briefing, setBriefing] = React.useState<Briefing | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/briefings/today", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setBriefing(j?.briefing ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded || !briefing) return null;

  return (
    <div
      className="animate-card-in relative overflow-hidden rounded-[var(--radius-card)] border p-4"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
        borderColor: "color-mix(in srgb, var(--color-accent) 28%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        <Sparkles size={11} />
        Today's briefing
      </div>
      <p className="text-[15px] font-semibold leading-snug text-[var(--color-fg)]">
        {briefing.headline}
      </p>
      {briefing.observations.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {briefing.observations.map((o, i) => (
            <li
              key={i}
              className="text-[13px] leading-relaxed text-[var(--color-fg-2)] flex gap-2"
            >
              <span className="text-[var(--color-accent)] mt-0.5 shrink-0">·</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
