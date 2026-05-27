/**
 * Rewrite every row's `user_id` from one id to another inside a single
 * transaction. Used by the link-identity flow when the user upgrades
 * a device-bound account into an Apple- or Google-bound account: we
 * point all of the device user's data at the new identity's user row,
 * then delete the old device row.
 *
 * If you add a new user-scoped table to `schema.ts`, add it to
 * USER_SCOPED_TABLES below.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const USER_SCOPED_TABLES: string[] = [
  "user_settings",
  "day_entries",
  "habits",
  "habit_logs",
  "goals",
  "recurring_goals",
  "recurring_goal_generations",
  "morning_routine_items",
  "morning_routine_logs",
  "evening_routine_items",
  "evening_routine_logs",
  "schedule_blocks",
  "workouts",
  "exercises",
  "lift_sessions",
  "meals",
  "saved_meals",
  "water_logs",
  "weight_logs",
  "mood_logs",
  "energy_logs",
  "steps_logs",
  "hrv_logs",
  "resting_heart_rate_logs",
  "sleep_logs",
  "cardio_load_logs",
  "peak_state_logs",
  "body_measurements",
  "body_photos",
  "body_photo_sessions",
  "push_subscriptions",
  "journal_entries",
  "list_items",
  "insights",
  "dismissed_patterns",
  "weekly_reviews",
  "behaviors",
  "fasting_windows",
  "recipes",
  "workout_routines",
  "workout_hr_series",
  "user_facts",
  "integrations",
  "integration_provenance",
  "accounts",
  "sessions",
];

/**
 * Reassign every row owned by `fromUserId` to `toUserId`, then delete
 * the `fromUserId` users row. If `toUserId` doesn't exist yet, the
 * caller should create it first — the FK constraint rejects the update
 * otherwise.
 *
 * Runs as a single PL/pgSQL DO block. The neon-http driver can't do
 * interactive `db.transaction()` (it's a stateless HTTP request per
 * query — "No transactions support in neon-http driver"), but a DO
 * block is one statement that executes atomically in its own implicit
 * transaction, so all the moves + the delete either land together or
 * not at all over a single round trip.
 */
export async function migrateUserIdAndCollapse(
  fromUserId: string,
  toUserId: string,
): Promise<{ tables: number }> {
  if (fromUserId === toUserId) return { tables: 0 };

  // Table names come from the fixed allowlist above (not user input);
  // the ids are escaped and cast to uuid to match the column type.
  const from = fromUserId.replace(/'/g, "''");
  const to = toUserId.replace(/'/g, "''");
  const updates = USER_SCOPED_TABLES.map(
    (t) => `  UPDATE "${t}" SET user_id = '${to}'::uuid WHERE user_id = '${from}'::uuid;`,
  ).join("\n");
  const doBlock = `DO $migrate$
BEGIN
${updates}
  DELETE FROM "users" WHERE id = '${from}'::uuid;
END
$migrate$;`;

  await db.execute(sql.raw(doBlock));

  return { tables: USER_SCOPED_TABLES.length };
}
