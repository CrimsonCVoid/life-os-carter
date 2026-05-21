"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Target,
  Repeat,
  Pen,
  Utensils,
  Dumbbell,
  ListChecks,
  ChefHat,
  Activity,
} from "lucide-react";
import useSWR from "swr";
import { useStore } from "@/store";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useHabits } from "@/lib/hooks/use-habits";
import { useJournalEntries } from "@/lib/hooks/use-journal";
import { useSavedMeals } from "@/lib/hooks/use-meals";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { useWorkoutRoutines } from "@/lib/hooks/use-workout-routines";
import { EXERCISE_LIBRARY } from "@/lib/exercise-library";
import type { GoalRow } from "@/lib/data/goals";
import type { JournalRow } from "@/lib/data/journal";
import type { SavedMealRow } from "@/lib/data/meals";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Props = {
  open: boolean;
  onClose: () => void;
};

type SearchKind =
  | "goal"
  | "habit"
  | "journal"
  | "meal"
  | "routine"
  | "recipe"
  | "exercise";

type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
};

const KIND_ICON: Record<SearchKind, typeof Search> = {
  goal: Target,
  habit: Repeat,
  journal: Pen,
  meal: Utensils,
  routine: ListChecks,
  recipe: ChefHat,
  exercise: Activity,
};

const KIND_LABEL: Record<SearchKind, string> = {
  goal: "Goal",
  habit: "Habit",
  journal: "Journal",
  meal: "Meal",
  routine: "Routine",
  recipe: "Recipe",
  exercise: "Exercise",
};

// Section ordering controls the grouped render order under the input.
const KIND_ORDER: SearchKind[] = [
  "goal",
  "habit",
  "journal",
  "meal",
  "recipe",
  "routine",
  "exercise",
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreMatch(text: string, q: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  if (new RegExp(`\\b${escapeRe(q)}`).test(t)) return 200;
  if (t.includes(q)) return 100;
  return 0;
}

export function UniversalSearchModal({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Cross-day goals: /api/data/goals with no `?date=...` returns all goals.
  const allGoals = useSWR<GoalRow[]>(open ? "/api/data/goals" : null);
  const { habits } = useHabits();
  const { entries: journalEntries } = useJournalEntries();
  // FIXME: there is no cross-day meals reader in v2 (use-meals only exposes
  // useMealsForDate). Saved meals are the only durable cross-day searchable
  // surface, so we use them here. Re-evaluate if a useAllMeals() hook lands.
  const { savedMeals } = useSavedMeals();
  const { recipes } = useRecipes();
  const { routines } = useWorkoutRoutines();
  // Lift sessions still live in Zustand (per CLAUDE.md, the route
  // intentionally skips SWR caching for sessions).
  const liftSessions = useStore((s) => s.liftSessions);

  React.useEffect(() => {
    if (!open) setQuery("");
    setActiveIndex(0);
  }, [open]);

  const hits = React.useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchHit[] = [];

    for (const g of allGoals.data ?? []) {
      const s = scoreMatch(g.text, q);
      if (s > 0) {
        out.push({
          kind: "goal",
          id: g.id,
          title: g.text,
          subtitle: g.date,
          href: `/?date=${g.date}`,
          score: s + (g.completed ? -10 : 0),
        });
      }
    }

    for (const h of habits) {
      const s = scoreMatch(h.name, q);
      if (s > 0) {
        out.push({
          kind: "habit",
          id: h.id,
          title: h.name,
          href: `/habits`,
          score: s,
        });
      }
    }

    for (const j of journalEntries as JournalRow[]) {
      const s1 = scoreMatch(j.summary ?? "", q);
      const s2 = scoreMatch(j.text ?? "", q);
      const s = Math.max(s1, s2 - 30);
      if (s > 0) {
        const text = j.text ?? "";
        out.push({
          kind: "journal",
          id: j.id,
          title: j.summary || text.slice(0, 60) || "Journal entry",
          subtitle: text.slice(0, 80),
          href: `/journal`,
          score: s,
        });
      }
    }

    for (const m of savedMeals as SavedMealRow[]) {
      if (!m.name) continue;
      const s = scoreMatch(m.name, q);
      if (s > 0) {
        out.push({
          kind: "meal",
          id: m.id,
          title: m.name,
          subtitle: `${Math.round(m.calories)} kcal · saved`,
          href: `/nutrition`,
          score: s,
        });
      }
    }

    for (const r of recipes) {
      const s = scoreMatch(r.name, q);
      if (s > 0) {
        out.push({
          kind: "recipe",
          id: r.id,
          title: r.name,
          subtitle: `${Math.round(r.caloriesPerServing)} kcal/serving`,
          href: `/nutrition`,
          score: s,
        });
      }
    }

    for (const t of routines) {
      const s = scoreMatch(t.name, q);
      if (s > 0) {
        out.push({
          kind: "routine",
          id: t.id,
          title: t.name,
          subtitle: `${t.exercises.length} exercises`,
          href: `/gym`,
          score: s,
        });
      }
    }

    // Exercises — dedupe by lowercase name. Surface user-logged lifts first
    // (boost score), then library exercises.
    const exerciseSeen = new Set<string>();
    for (const sess of liftSessions) {
      for (const ex of sess.exercises) {
        const key = ex.normalizedName || ex.name.toLowerCase().trim();
        if (exerciseSeen.has(key)) continue;
        const s = scoreMatch(ex.name, q);
        if (s > 0) {
          exerciseSeen.add(key);
          out.push({
            kind: "exercise",
            id: key,
            title: ex.name,
            subtitle: "Logged",
            href: `/gym/exercise/${encodeURIComponent(ex.name)}`,
            score: s + 50,
          });
        }
      }
    }
    for (const ex of EXERCISE_LIBRARY) {
      const key = ex.name.toLowerCase().trim();
      if (exerciseSeen.has(key)) continue;
      const aliasMatch = (ex.aliases ?? []).reduce(
        (best, a) => Math.max(best, scoreMatch(a, q)),
        0
      );
      const s = Math.max(scoreMatch(ex.name, q), aliasMatch);
      if (s > 0) {
        exerciseSeen.add(key);
        out.push({
          kind: "exercise",
          id: key,
          title: ex.name,
          subtitle: ex.muscleGroup,
          href: `/gym/exercise/${encodeURIComponent(ex.name)}`,
          score: s,
        });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [
    query,
    allGoals.data,
    habits,
    journalEntries,
    savedMeals,
    recipes,
    routines,
    liftSessions,
  ]);

  // Grouped view, preserving global rank within each group.
  const groups = React.useMemo(() => {
    const byKind = new Map<SearchKind, SearchHit[]>();
    for (const h of hits) {
      const arr = byKind.get(h.kind) ?? [];
      arr.push(h);
      byKind.set(h.kind, arr);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      hits: byKind.get(k)!,
    }));
  }, [hits]);

  // Flat list for keyboard nav (matches the rendered order).
  const flatHits = React.useMemo(
    () => groups.flatMap((g) => g.hits),
    [groups]
  );

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (flatHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatHits[activeIndex];
      if (hit) {
        haptic("tap");
        router.push(hit.href);
        onClose();
      }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Search" size="lg">
      <div className="space-y-3" onKeyDown={onKeyDown}>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search goals, habits, journal, meals, exercises…"
          inputMode="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {query.trim().length >= 2 && flatHits.length === 0 && (
          <div className="text-center py-6">
            <Search
              size={20}
              className="mx-auto text-[var(--color-fg-3)] mb-2"
            />
            <div className="text-xs text-[var(--color-fg-3)]">No matches.</div>
          </div>
        )}

        {query.trim().length < 2 && (
          <div className="text-center py-6">
            <div className="text-xs text-[var(--color-fg-3)]">
              Type at least 2 characters.
            </div>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto nice-scroll space-y-3 -mx-1 px-1">
          {groups.map((group) => {
            let runningIndex = 0;
            // Compute the starting flat-index of this group so per-row index
            // aligns with keyboard activeIndex.
            for (const g of groups) {
              if (g.kind === group.kind) break;
              runningIndex += g.hits.length;
            }
            return (
              <section key={group.kind} className="space-y-1">
                <div className="label px-2">{KIND_LABEL[group.kind]}</div>
                <ul className="space-y-0.5">
                  {group.hits.map((h, i) => {
                    const Icon = KIND_ICON[h.kind];
                    const flatIdx = runningIndex + i;
                    const isActive = flatIdx === activeIndex;
                    return (
                      <li key={`${h.kind}-${h.id}`}>
                        <Link
                          href={h.href}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={() => {
                            haptic("tap");
                            onClose();
                          }}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-control)]",
                            "transition-colors duration-[120ms]",
                            "active:scale-[0.99]",
                            isActive
                              ? "bg-[var(--color-elevated)]"
                              : "hover:bg-[var(--color-card-hover)]"
                          )}
                        >
                          <Icon
                            size={16}
                            className="text-[var(--color-fg-3)] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[15px] font-medium truncate">
                              {h.title}
                            </div>
                            {h.subtitle && (
                              <div className="text-xs text-[var(--color-fg-3)] truncate">
                                {h.subtitle}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] tnum shrink-0">
                            {KIND_LABEL[h.kind]}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
