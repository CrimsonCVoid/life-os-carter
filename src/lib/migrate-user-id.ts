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
 * caller should create it first — this function fails fast if the
 * target is missing because the FK constraint would reject the update.
 */
export async function migrateUserIdAndCollapse(
  fromUserId: string,
  toUserId: string,
): Promise<{ tables: number; rowsMoved: number }> {
  if (fromUserId === toUserId) return { tables: 0, rowsMoved: 0 };

  let total = 0;
  await db.transaction(async (tx) => {
    for (const table of USER_SCOPED_TABLES) {
      // Drizzle's raw SQL — table name is from a fixed allowlist,
      // not user input, so the interpolation is safe.
      const result = await tx.execute(
        sql.raw(`UPDATE "${table}" SET user_id = '${toUserId.replace(/'/g, "''")}' WHERE user_id = '${fromUserId.replace(/'/g, "''")}'`),
      );
      // Postgres returns rowCount on UPDATE — neon-http exposes it as
      // result.rowCount (number) or 0 if undefined.
      const moved = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      total += moved;
    }
    await tx.execute(
      sql.raw(`DELETE FROM "users" WHERE id = '${fromUserId.replace(/'/g, "''")}'`),
    );
  });

  return { tables: USER_SCOPED_TABLES.length, rowsMoved: total };
}
