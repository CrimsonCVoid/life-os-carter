import type { OverseerContext } from "@/store/selectors";

export const PERSONA_SYSTEM = `You are Overseer — a direct, encouraging, no-fluff personal coach embedded in the user's daily life-OS dashboard. You see the full data:
- goals, habits, morning routine, workouts
- mood, sleep, water, weight, steps
- energy curve (4 periods per day: morning, midday, afternoon, evening)
- today's schedule (time-blocked plan)
- nutrition (today's totals vs targets, 7-day protein avg)
- latest body measurements + 30-day trend
- journal entries (including voice journal entries — the user sometimes records voice memos that get transcribed; recent voice summaries are surfaced separately)
- recurring goals (templates that auto-generate goals on a schedule — daily, M/W/F, monthly, etc.; each has a 30-day completion rate and a "struggling" flag when last 14 days are below 50%)

Voice rules — non-negotiable:
- Sharp, plain, warm. No corporate language. No bullet lists unless they truly help. No preamble like "Great question!" or "Of course!". Just the answer.
- Default to a sentence or two. Go longer only when the user asks.
- Cite the data concretely. "Your second goal is the biggest unlock today" beats "focus on priorities".
- Call out patterns. When the user asks for advice, *prefer to make connections across data types*. Examples (never copy verbatim):
  - "Your energy dips midday and you haven't been hitting protein — try a higher-protein lunch."
  - "You finish your morning routine 30 min later on days you sleep poorly."
  - "Sunlight and stretches are the two you bail on most. Try stacking them."
  - "You're 0 of 8 on your morning. Want to start with the easiest one?"
- Never invent items the user didn't log. If context is sparse, ask one short clarifying question instead of guessing.
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

  const renderMorning = ctx.morningRoutine.total
    ? [
        `  done today: ${ctx.morningRoutine.doneToday}/${ctx.morningRoutine.total}` +
          (ctx.morningRoutine.completedAtToday
            ? ` (finished at ${ctx.morningRoutine.completedAtToday})`
            : ""),
        `  current streak: ${ctx.morningRoutine.currentStreak}`,
        `  last 7 days completion: ${ctx.morningRoutine.last7DayRatePct}%`,
        "  items today:",
        ...ctx.morningRoutine.items.map(
          (r) =>
            `    - [${r.doneToday ? "x" : " "}] ${r.name}` +
            (r.completedAt ? ` @ ${r.completedAt}` : "")
        ),
        ctx.morningRoutine.mostSkipped14d.length
          ? "  most skipped (last 14d):"
          : "",
        ...ctx.morningRoutine.mostSkipped14d.map(
          (s) => `    - ${s.name} (skipped ${s.skipped}d)`
        ),
      ]
        .filter(Boolean)
        .join("\n")
    : "  (none configured)";

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
        `  - ${d.date}: ${d.goalsDone}/${d.goalsTotal} goals · ${d.habitsDone}/${d.habitsTotal} habits · morning ${d.morningDone}/${d.morningTotal} · sleep ${d.sleepHours ?? "—"}h · mood ${d.mood ?? "—"} · energy ${d.energy ?? "—"}`
    )
    .join("\n");

  const journal = ctx.recentJournal.length
    ? ctx.recentJournal
        .map((j) => `  - ${j.date} (mood ${j.mood ?? "—"}): ${j.snippet}`)
        .join("\n")
    : "  (none)";

  const voiceJournal = ctx.recentVoiceSummaries?.length
    ? ctx.recentVoiceSummaries
        .map(
          (v) =>
            `  - ${v.date} (${v.moodWord ?? "—"}, mood ${v.mood ?? "—"}): ${v.summary}`
        )
        .join("\n")
    : "  (none)";

  // schedule
  const schedule = ctx.scheduleToday?.length
    ? ctx.scheduleToday
        .map(
          (b) =>
            `  - ${b.start}-${b.end} (${b.type}) ${b.title}${
              b.done ? " [done]" : ""
            }`
        )
        .join("\n")
    : "  (empty)";

  // energy
  const renderEnergyToday = ctx.energyToday
    ? Object.entries(ctx.energyToday)
        .map(([p, v]) => `  - ${p}: ${v ?? "—"}`)
        .join("\n")
    : "  (none)";

  // nutrition
  const nutrition = ctx.nutritionToday
    ? [
        `  totals: ${ctx.nutritionToday.totals.calories}c · ${ctx.nutritionToday.totals.protein}p · ${ctx.nutritionToday.totals.carbs ?? 0}c · ${ctx.nutritionToday.totals.fat ?? 0}f`,
        `  targets: ${ctx.nutritionToday.targets.calories ?? "—"}c · ${ctx.nutritionToday.targets.protein ?? "—"}p`,
        `  7-day protein avg: ${ctx.nutritionToday.proteinAvg7 ?? "—"}g`,
      ].join("\n")
    : "  (disabled)";

  // body
  const body = ctx.bodyLatest
    ? `  ${ctx.bodyLatest.date}: weight ${ctx.bodyLatest.weight ?? "—"}, bodyfat ${ctx.bodyLatest.bodyFatPct ?? "—"}%`
    : "  (no measurements)";

  return [
    `Today: ${ctx.today}`,
    `Day type: ${ctx.dayType || "(unset)"}`,
    `Reminder: ${ctx.reminder || "(none)"}`,
    "",
    "Goals today:",
    renderGoals,
    "",
    "Schedule today:",
    schedule,
    "",
    "Habits:",
    renderHabits,
    "",
    "Morning routine:",
    renderMorning,
    "",
    "Energy today (1-10 by period):",
    renderEnergyToday,
    "",
    "Workouts today:",
    renderWorkouts,
    "",
    "Health today:",
    health,
    "",
    "Nutrition today:",
    nutrition,
    "",
    "Latest body measurement:",
    body,
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
    "",
    "Recent voice journal summaries:",
    voiceJournal,
    "",
    "Recurring goals:",
    ctx.recurringGoals?.length
      ? ctx.recurringGoals
          .map(
            (r) =>
              `  - "${r.text}" (${r.pattern}) — last 30d: ${r.completed30}/${r.scheduled30}${
                r.rate30Pct != null ? ` (${r.rate30Pct}%)` : ""
              }${r.struggling ? " · STRUGGLING (last 14d under 50%)" : ""}`
          )
          .join("\n")
      : "  (none)",
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
