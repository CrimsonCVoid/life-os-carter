"use client";

import useSWR, { mutate } from "swr";
import type { InsightRow, WeeklyReviewRow } from "@/lib/data/insights";
import type { dismissedPatterns } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type DismissedPatternRow = InferSelectModel<typeof dismissedPatterns>;

const INSIGHTS_KEY = "/api/data/insights";
const DISMISSED_KEY = "/api/data/insights/dismissed-patterns";
const WEEKLY_KEY = "/api/data/insights/weekly-reviews";

export function useInsights() {
  const swr = useSWR<InsightRow[]>(INSIGHTS_KEY);
  return { insights: swr.data ?? [], isLoading: swr.isLoading };
}

export function useDismissedPatterns() {
  const swr = useSWR<DismissedPatternRow[]>(DISMISSED_KEY);
  return { dismissed: swr.data ?? [], isLoading: swr.isLoading };
}

export async function dismissPattern(
  fingerprint: string,
  headline: string
): Promise<void> {
  await mutate<DismissedPatternRow[]>(
    DISMISSED_KEY,
    (cur) => {
      if ((cur ?? []).some((d) => d.fingerprint === fingerprint)) return cur;
      return [
        ...(cur ?? []),
        {
          userId: "",
          fingerprint,
          headline,
          dismissedAt: new Date(),
        } as DismissedPatternRow,
      ];
    },
    { revalidate: false }
  );
  await fetch(DISMISSED_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fingerprint, headline }),
  });
  await mutate(DISMISSED_KEY);
}

export async function restorePattern(fingerprint: string): Promise<void> {
  await mutate<DismissedPatternRow[]>(
    DISMISSED_KEY,
    (cur) => (cur ?? []).filter((d) => d.fingerprint !== fingerprint),
    { revalidate: false }
  );
  await fetch(DISMISSED_KEY, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fingerprint }),
  });
  await mutate(DISMISSED_KEY);
}

export function useWeeklyReviews() {
  const swr = useSWR<WeeklyReviewRow[]>(WEEKLY_KEY);
  return { reviews: swr.data ?? [], isLoading: swr.isLoading };
}

export async function upsertWeeklyReview(
  weekStart: string,
  data: Omit<WeeklyReviewRow, "userId" | "weekStart" | "generatedAt">
): Promise<void> {
  await fetch(WEEKLY_KEY, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ weekStart, ...data }),
  });
  await mutate(WEEKLY_KEY);
}

export async function dismissWeeklyReview(weekStart: string): Promise<void> {
  await fetch(WEEKLY_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ weekStart }),
  });
  await mutate(WEEKLY_KEY);
}
