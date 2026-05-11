import type { OverseerContext } from "@/store/selectors";

export const PERSONA_SYSTEM = `You are Overseer — a direct, encouraging, no-fluff personal coach embedded in the user's daily life-OS dashboard. You see the full data: goals, habits, workouts, mood/energy/sleep/water/weight/steps, journal entries, streaks.

Voice rules — non-negotiable:
- Sharp, plain, warm. No corporate language. No bullet lists unless they truly help. No preamble like "Great question!" or "Of course!". Just the answer.
- Default to a sentence or two. Go longer only when the user asks.
- Cite the data concretely. "Your second goal is the biggest unlock today" beats "focus on priorities".
- Call out patterns when you see them ("Your mood drops on days you skip morning sunlight"). Don't sugarcoat — if the data says something, say it.
- Never invent goals, habits, or numbers the user didn't log. If context is sparse, ask one short clarifying question instead of guessing.
- Never lecture. Encourage by being precise.`;

export function buildContextBlock(ctx: OverseerContext): string {
  const renderGoals = ctx.goalsToday.length
    ? ctx.goalsToday
        .map(
          (g) =>
            `  - [${g.done ? "x" : " "}] (${g.priority}) ${g.emoji ?? ""} ${g.text}`
        )
        .join("\n")
    : "  (none)";

  const renderHabits = ctx.habits.length
    ? ctx.habits
        .map(
          (h) =>
            `  - ${h.name} — ${h.doneToday ? "done today" : "not yet"}, streak ${h.streak}`
        )
        .join("\n")
    : "  (none)";

  const renderWorkouts = ctx.workoutsToday.length
    ? ctx.workoutsToday
        .map(
          (w) =>
            `  - ${w.type}, ${w.durationMin}min, intensity ${w.intensity}/10`
        )
        .join("\n")
    : "  (none)";

  const health = ctx.health
    ? [
        `  - sleep: ${ctx.health.sleepHours ?? "—"}h (q${ctx.health.sleepQuality ?? "—"})`,
        `  - mood: ${ctx.health.mood ?? "—"}/10`,
        `  - energy: ${ctx.health.energy ?? "—"}/10`,
        `  - water: ${ctx.health.waterOz ?? 0}oz`,
        `  - weight: ${ctx.health.weight ?? "—"}lb`,
        `  - steps: ${ctx.health.steps ?? "—"}`,
      ].join("\n")
    : "  (none)";

  const renderList = (arr: string[]) =>
    arr.length ? arr.map((s) => `  - ${s}`).join("\n") : "  (none)";

  const last7 = ctx.last7DaysSummary
    .map(
      (d) =>
        `  - ${d.date}: ${d.goalsDone}/${d.goalsTotal} goals · ${d.habitsDone}/${d.habitsTotal} habits · sleep ${d.sleepHours ?? "—"}h · mood ${d.mood ?? "—"} · energy ${d.energy ?? "—"}`
    )
    .join("\n");

  const journal = ctx.recentJournal.length
    ? ctx.recentJournal
        .map((j) => `  - ${j.date} (mood ${j.mood ?? "—"}): ${j.snippet}`)
        .join("\n")
    : "  (none)";

  return [
    `Today: ${ctx.today}`,
    `Day type: ${ctx.dayType || "(unset)"}`,
    `Reminder: ${ctx.reminder || "(none)"}`,
    "",
    "Goals today:",
    renderGoals,
    "",
    "Habits:",
    renderHabits,
    "",
    "Workouts today:",
    renderWorkouts,
    "",
    "Health today:",
    health,
    "",
    "Plans for tomorrow:",
    renderList(ctx.plansTomorrow),
    "",
    "Wins today:",
    renderList(ctx.winsToday),
    "",
    "Current struggles:",
    renderList(ctx.strugglesToday),
    "",
    "Last 7 days summary:",
    last7,
    "",
    "Recent journal entries:",
    journal,
  ].join("\n");
}

export const BRIEFING_PROMPT = `Write a morning briefing. EXACTLY this format, no preamble:

Line 1: One-sentence recap of yesterday (specific — sleep, mood, key win or miss).
Line 2: Today's top priority — name the actual goal text and why.
Line 3: One trend observation from the 7-day data (specific).
Line 4: One short motivating line, max 12 words.

Each line on its own line, no labels, no markdown. Total 4 lines.`;

export const EVENING_PROMPT = `Write a 3-line evening summary plus 2-3 short journal prompts.

Format (no preamble):
Line 1: One sentence on today (specific — score, goals done, mood, sleep).
Line 2: One pattern or observation.
Line 3: One nudge for tomorrow.

Then a blank line, then:
PROMPTS:
- short prompt 1
- short prompt 2
- short prompt 3 (optional)`;
