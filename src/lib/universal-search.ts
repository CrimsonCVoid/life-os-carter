import type {
  Goal,
  Habit,
  JournalEntry,
  Meal,
  LiftSession,
  WorkoutTemplate,
  Recipe,
} from "@/lib/types";

export type SearchHit = {
  kind: "goal" | "habit" | "journal" | "meal" | "workout" | "routine" | "recipe" | "exercise";
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  /** Navigation target. */
  href: string;
  /** Relevance score (higher = better). */
  score: number;
};

export type SearchSource = {
  goals: Goal[];
  habits: Habit[];
  journal: JournalEntry[];
  meals: Meal[];
  liftSessions: LiftSession[];
  workoutTemplates: WorkoutTemplate[];
  recipes: Recipe[];
};

export function search(source: SearchSource, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: SearchHit[] = [];

  for (const g of source.goals) {
    const score = scoreMatch(g.text, q);
    if (score > 0) {
      out.push({
        kind: "goal",
        id: g.id,
        title: g.text,
        subtitle: g.date,
        date: g.date,
        href: `/`,
        score: score + (g.completed ? -10 : 0),
      });
    }
  }

  for (const h of source.habits) {
    const score = scoreMatch(h.name, q);
    if (score > 0) {
      out.push({
        kind: "habit",
        id: h.id,
        title: h.name,
        href: `/habits`,
        score,
      });
    }
  }

  for (const j of source.journal) {
    const s1 = scoreMatch(j.summary ?? "", q);
    const s2 = scoreMatch(j.text ?? "", q);
    const score = Math.max(s1, s2 - 30);
    if (score > 0) {
      out.push({
        kind: "journal",
        id: j.id,
        title: j.summary || (j.text ?? "").slice(0, 60),
        subtitle: (j.text ?? "").slice(0, 80),
        date: j.date,
        href: `/journal`,
        score,
      });
    }
  }

  for (const m of source.meals) {
    if (!m.name) continue;
    const score = scoreMatch(m.name, q);
    if (score > 0) {
      out.push({
        kind: "meal",
        id: m.id,
        title: m.name,
        subtitle: `${m.calories} kcal · ${m.date}`,
        date: m.date,
        href: `/nutrition`,
        score,
      });
    }
  }

  const exerciseSeen = new Set<string>();
  for (const s of source.liftSessions) {
    for (const ex of s.exercises) {
      const key = ex.normalizedName;
      if (exerciseSeen.has(key)) continue;
      const score = scoreMatch(ex.name, q);
      if (score > 0) {
        exerciseSeen.add(key);
        out.push({
          kind: "exercise",
          id: key,
          title: ex.name,
          subtitle: "Exercise",
          href: `/gym/exercise/${encodeURIComponent(ex.name)}`,
          score: score + 50,
        });
      }
    }
  }

  for (const t of source.workoutTemplates) {
    const score = scoreMatch(t.name, q);
    if (score > 0) {
      out.push({
        kind: "routine",
        id: t.id,
        title: t.name,
        subtitle: `${t.exercises.length} exercises`,
        href: `/gym`,
        score,
      });
    }
  }

  for (const r of source.recipes) {
    const score = scoreMatch(r.name, q);
    if (score > 0) {
      out.push({
        kind: "recipe",
        id: r.id,
        title: r.name,
        subtitle: `${Math.round(r.caloriesPerServing)} kcal/serving`,
        href: `/nutrition`,
        score,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

function scoreMatch(text: string, q: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  // word-start match
  if (new RegExp(`\\b${escapeRe(q)}`).test(t)) return 200;
  if (t.includes(q)) return 100;
  return 0;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
