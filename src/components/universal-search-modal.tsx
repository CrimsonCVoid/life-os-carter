"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Target, Repeat, Pen, Utensils, Dumbbell, ListChecks, ChefHat, Activity } from "lucide-react";
import { useStore } from "@/store";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { search, type SearchHit } from "@/lib/universal-search";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Props = {
  open: boolean;
  onClose: () => void;
};

const KIND_ICON: Record<SearchHit["kind"], typeof Search> = {
  goal: Target,
  habit: Repeat,
  journal: Pen,
  meal: Utensils,
  workout: Dumbbell,
  routine: ListChecks,
  recipe: ChefHat,
  exercise: Activity,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  goal: "Goal",
  habit: "Habit",
  journal: "Journal",
  meal: "Meal",
  workout: "Workout",
  routine: "Routine",
  recipe: "Recipe",
  exercise: "Exercise",
};

export function UniversalSearchModal({ open, onClose }: Props) {
  const [query, setQuery] = React.useState("");

  const goals = useStore((s) => s.goals);
  const habits = useStore((s) => s.habits);
  const journal = useStore((s) => s.journal);
  const meals = useStore((s) => s.meals);
  const liftSessions = useStore((s) => s.liftSessions);
  const workoutTemplates = useStore((s) => s.workoutTemplates);
  const recipes = useStore((s) => s.recipes);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const hits = React.useMemo(
    () =>
      search(
        { goals, habits, journal, meals, liftSessions, workoutTemplates, recipes },
        query
      ),
    [query, goals, habits, journal, meals, liftSessions, workoutTemplates, recipes]
  );

  return (
    <Modal open={open} onClose={onClose} title="Search" size="lg">
      <div className="space-y-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search goals, habits, journal, meals, exercises..."
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
        />
        {query.trim().length >= 2 && hits.length === 0 && (
          <div className="text-center py-6">
            <Search size={20} className="mx-auto text-[var(--color-fg-3)] mb-2" />
            <div className="text-[12px] text-[var(--color-fg-3)]">
              No matches.
            </div>
          </div>
        )}
        <ul className="space-y-1 max-h-[60vh] overflow-y-auto nice-scroll">
          {hits.map((h) => {
            const Icon = KIND_ICON[h.kind];
            return (
              <li key={`${h.kind}-${h.id}`}>
                <Link
                  href={h.href}
                  onClick={() => {
                    haptic("tap");
                    onClose();
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    "active:bg-[var(--color-elevated)] active:scale-[0.99]",
                    "transition-transform duration-[60ms]"
                  )}
                >
                  <Icon
                    size={14}
                    className="text-[var(--color-fg-3)] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {h.title}
                    </div>
                    {h.subtitle && (
                      <div className="text-[10px] text-[var(--color-fg-3)] truncate">
                        {h.subtitle}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] tnum shrink-0">
                    {KIND_LABEL[h.kind]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
