"use client";

import * as React from "react";

export type BodyBracket =
  | "essential"
  | "athletic"
  | "lean"
  | "average"
  | "above_average"
  | "high";

export type VlmObservations = {
  bracket?: BodyBracket | string;
  features?: Record<string, number>;
  posture?: {
    shoulder_rounding?: number;
    hip_tilt?: "neutral" | "anterior" | "posterior" | string;
    weight_shift?: "neutral" | "left" | "right" | string;
  };
  confidence?: "low" | "medium" | "high" | string;
  summary?: string;
};

export type SilhouetteFeatures = {
  shoulder_to_waist_ratio: number | null;
  waist_to_hip_ratio: number | null;
  shoulder_to_hip_ratio: number | null;
  midsection_to_height_ratio: number | null;
  v_taper_score: number | null;
  composition_score: number | null;
  asymmetry_index: number | null;
  pose_visibility_mean: number;
  shoulder_px: number;
  waist_px: number;
  hip_px: number;
  shoulder_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
};

export type Measurements = Record<string, number>;

export type ProgressPhotoAnalysis = {
  id: string;
  status: "pending" | "processing" | "complete" | "failed";
  bfEstimatePct: number | null;
  bfConfidenceLow: number | null;
  bfConfidenceHigh: number | null;
  measurements: Measurements | null;
  silhouetteFeatures: SilhouetteFeatures | null;
  vlmCommentary: string | null;
  vlmObservations: VlmObservations | null;
  segmentationUrl: string | null;
  processedAt: string | null;
};

export type ProgressPhoto = {
  id: string;
  blobUrl: string;
  blobPathname: string;
  angle: "front" | "side" | "back";
  capturedAt: string;
  captureMeta: Record<string, unknown>;
  analysis: ProgressPhotoAnalysis | null;
};

type State = {
  photos: ProgressPhoto[];
  loading: boolean;
  error: string | null;
};

/** Fetch + watch the user's progress photos. Re-polls every 8s while any
 * analysis is in 'pending' or 'processing' so commentary shows up live. */
export function useProgressPhotos(): State & { reload: () => Promise<void> } {
  const [state, setState] = React.useState<State>({
    photos: [],
    loading: true,
    error: null,
  });

  const reload = React.useCallback(async () => {
    try {
      const r = await fetch("/api/body/progress-photos", {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const data = (await r.json()) as { photos: ProgressPhoto[] };
      setState({ photos: data.photos ?? [], loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "fetch-failed",
      }));
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // Poll while any analysis is in-flight.
  React.useEffect(() => {
    const hasInflight = state.photos.some(
      (p) => !p.analysis || p.analysis.status === "pending" || p.analysis.status === "processing"
    );
    if (!hasInflight) return;
    const id = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(id);
  }, [state.photos, reload]);

  return { ...state, reload };
}
