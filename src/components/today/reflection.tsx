"use client";

import { Moon } from "lucide-react";
import { useStore } from "@/store";
import {
  usePlans,
  useStruggles,
  useToday,
  useWins,
} from "@/store/selectors";
import { ListSection } from "./list-section";
import { useDay } from "./day-context";

/**
 * Evening Reflection — three quick lists to close out the day:
 *   1. Wins / Positives
 *   2. Struggles today
 *   3. Goals for tomorrow
 *
 * Replaces the older 5-step modal reflection AND the standalone
 * Wins / Struggles / Plan-Tomorrow sections that used to live on Today.
 * Same store data, just collected under one heading.
 */
export function ReflectionCard() {
  const { date: today, isFuture } = useDay();
  const wins = useWins(today);
  const struggles = useStruggles(today);
  const plans = usePlans(today);

  const addWin = useStore((s) => s.addWin);
  const removeWin = useStore((s) => s.removeWin);
  const updateWin = useStore((s) => s.updateWin);

  const addStruggle = useStore((s) => s.addStruggle);
  const removeStruggle = useStore((s) => s.removeStruggle);
  const updateStruggle = useStore((s) => s.updateStruggle);

  const addPlan = useStore((s) => s.addPlan);
  const removePlan = useStore((s) => s.removePlan);
  const updatePlan = useStore((s) => s.updatePlan);

  // Evening reflection only applies after-the-fact (or live for today).
  // Hide for future days — handled at the page level too, but defensive.
  if (isFuture) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Moon size={14} className="text-[var(--color-accent)]" />
        <span className="label">Evening Reflection</span>
      </div>

      <ListSection
        title="Wins & Positives"
        placeholder="What went well?"
        bullet="plus"
        items={wins}
        onAdd={(text) => addWin(text, today)}
        onRemove={removeWin}
        onUpdate={updateWin}
        emptyText="Worth noting even small ones."
      />

      <ListSection
        title="Struggles Today"
        placeholder="What's hard right now?"
        bullet="minus"
        items={struggles}
        onAdd={(text) => addStruggle(text, today)}
        onRemove={removeStruggle}
        onUpdate={updateStruggle}
        emptyText="It's okay if nothing's hard."
      />

      <ListSection
        title="Goals for Tomorrow"
        placeholder="One concrete thing for tomorrow"
        bullet="dot"
        items={plans}
        onAdd={(text) => addPlan(text, today)}
        onRemove={removePlan}
        onUpdate={updatePlan}
        emptyText="Pre-load your top moves so morning isn't a scramble."
      />
    </section>
  );
}
