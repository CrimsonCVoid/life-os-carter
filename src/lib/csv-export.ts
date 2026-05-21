import type { LiftSession } from "@/lib/types";
import { estimated1RM } from "@/lib/repcount";

/**
 * Convert lift sessions to a flat CSV. One row per set. Columns mirror what
 * a spreadsheet user wants for pivot tables: date, exercise, set#, weight,
 * reps, e1RM, RPE, notes, set/exercise/session ids for joining.
 */
export function liftSessionsToCsv(sessions: LiftSession[]): string {
  const header = [
    "session_id",
    "date",
    "exercise",
    "exercise_id",
    "set_number",
    "weight_lb",
    "reps",
    "e1rm_lb",
    "rpe",
    "is_drop_set",
    "superset_group",
    "set_notes",
  ];
  const rows: string[] = [header.map(csvEscape).join(",")];
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const sess of ordered) {
    for (const ex of sess.exercises) {
      const sets = [...ex.sets].sort((a, b) => a.order - b.order);
      for (const s of sets) {
        rows.push(
          [
            sess.id,
            sess.date,
            ex.name,
            ex.id,
            String(s.order),
            String(s.weight),
            String(s.reps),
            s.weight > 0 && s.reps > 0
              ? (Math.round(estimated1RM(s.weight, s.reps) * 10) / 10).toString()
              : "",
            s.rpe != null ? String(s.rpe) : "",
            s.isDropSet ? "true" : "",
            ex.supersetGroupId ?? "",
            s.notes ?? "",
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    }
  }
  return rows.join("\n");
}

function csvEscape(v: string): string {
  if (v === "") return "";
  // Quote if it contains commas, quotes, or newlines. Double inner quotes.
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Browser-side download helper. */
export function downloadCsv(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
