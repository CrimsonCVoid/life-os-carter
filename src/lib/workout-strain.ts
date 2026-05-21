/**
 * Workout strain — a Whoop-style cardiovascular load score on a 0–21
 * scale derived from time-in-zone heart-rate data.
 *
 * Whoop's actual algorithm is proprietary, but the public description
 * combines a TRIMP-like (Training Impulse) zone-weighted minutes total
 * with a logarithmic mapping to the 0–21 strain band.
 *
 * Methodology used here:
 *   1. Compute weighted minutes:
 *        TRIMP = Σ (minutes_in_zone_i × intensity_factor_i)
 *      Zones 1..5 cover the 50–60, 60–70, 70–80, 80–90, 90–100 percent
 *      of HR-reserve buckets carter's adapter already computes.
 *      Intensity factors: Z1=1.0, Z2=2.0, Z3=3.0, Z4=4.5, Z5=6.0
 *      (Z4 and Z5 are super-linear because anaerobic / VO2 work taxes
 *      recovery disproportionately — matches Whoop's "all-out" curve.)
 *   2. Map TRIMP → strain via a saturating curve:
 *        strain = 21 × (1 − e^(−TRIMP / SATURATION))
 *      with SATURATION tuned so a moderate hour-long workout lands
 *      around 13, an intense hour around 17, an all-out 90-min around
 *      20+. Below 21 means "always more room to suffer".
 *   3. Classify into 4 verbal bands matching Whoop's labels:
 *        Light (0–9) · Moderate (10–13) · High (14–17) · All-Out (18–21)
 *
 * If samples are missing or zoneMinutes is undefined, returns null.
 * Callers should fall back to a volume-based proxy or render N/A.
 */

import type { WorkoutHRSeries, ZoneMinutes } from "@/lib/types";

const ZONE_WEIGHTS: Record<keyof ZoneMinutes, number> = {
  zone1: 1.0,
  zone2: 2.0,
  zone3: 3.0,
  zone4: 4.5,
  zone5: 6.0,
};

const SATURATION = 180;

export type StrainBand = "light" | "moderate" | "high" | "all-out";

export type WorkoutStrain = {
  /** 0–21 Whoop-scale value, two decimals of precision. */
  score: number;
  /** Verbal classification. */
  band: StrainBand;
  /** Raw TRIMP (zone-weighted minutes) — useful for debugging. */
  trimp: number;
  /** Total minutes the user spent in the "useful" zones (Z1+ aerobic). */
  workMinutes: number;
  /** Z4+Z5 minutes — anaerobic / VO2 time. */
  highIntensityMinutes: number;
  /** Average %HRR across the work portion. */
  averagePercentHRR: number;
};

export function computeWorkoutStrain(
  series: WorkoutHRSeries,
  opts?: { maxHr?: number }
): WorkoutStrain | null {
  const zm = series.zoneMinutes;
  if (!zm) return null;

  let trimp = 0;
  let workMinutes = 0;
  for (const z of ["zone1", "zone2", "zone3", "zone4", "zone5"] as const) {
    const minutes = zm[z] ?? 0;
    if (minutes <= 0) continue;
    workMinutes += minutes;
    trimp += minutes * ZONE_WEIGHTS[z];
  }

  if (trimp <= 0) return null;

  const score = Math.min(21, 21 * (1 - Math.exp(-trimp / SATURATION)));
  const band: StrainBand =
    score < 10 ? "light" : score < 14 ? "moderate" : score < 18 ? "high" : "all-out";

  // Approximate average %HRR from zone midpoints — good enough for a
  // displayed stat; precise version would integrate the raw samples.
  const zoneMidpoint: Record<keyof ZoneMinutes, number> = {
    zone1: 0.55,
    zone2: 0.65,
    zone3: 0.75,
    zone4: 0.85,
    zone5: 0.95,
  };
  let weightedSum = 0;
  for (const z of ["zone1", "zone2", "zone3", "zone4", "zone5"] as const) {
    weightedSum += (zm[z] ?? 0) * zoneMidpoint[z];
  }
  const averagePercentHRR = workMinutes > 0 ? weightedSum / workMinutes : 0;

  const highIntensityMinutes = (zm.zone4 ?? 0) + (zm.zone5 ?? 0);

  return {
    score: Math.round(score * 10) / 10,
    band,
    trimp: Math.round(trimp),
    workMinutes,
    highIntensityMinutes,
    averagePercentHRR: Math.round(averagePercentHRR * 100) / 100,
  };
}

/**
 * Sum strain across multiple workouts (e.g. all workouts logged today).
 * Whoop displays daily strain as a similar saturating-curve aggregate, so
 * we recombine the TRIMPs rather than averaging the individual scores —
 * two short hard workouts ≠ one easy long workout even if scores look close.
 */
export function aggregateDailyStrain(seriesList: WorkoutHRSeries[]): WorkoutStrain | null {
  let totalTrimp = 0;
  let totalWork = 0;
  let totalHigh = 0;
  let weightedSum = 0;
  const zoneMidpoint: Record<keyof ZoneMinutes, number> = {
    zone1: 0.55,
    zone2: 0.65,
    zone3: 0.75,
    zone4: 0.85,
    zone5: 0.95,
  };

  for (const series of seriesList) {
    const zm = series.zoneMinutes;
    if (!zm) continue;
    for (const z of ["zone1", "zone2", "zone3", "zone4", "zone5"] as const) {
      const minutes = zm[z] ?? 0;
      totalTrimp += minutes * ZONE_WEIGHTS[z];
      totalWork += minutes;
      weightedSum += minutes * zoneMidpoint[z];
    }
    totalHigh += (zm.zone4 ?? 0) + (zm.zone5 ?? 0);
  }

  if (totalTrimp <= 0) return null;

  const score = Math.min(21, 21 * (1 - Math.exp(-totalTrimp / SATURATION)));
  const band: StrainBand =
    score < 10 ? "light" : score < 14 ? "moderate" : score < 18 ? "high" : "all-out";

  return {
    score: Math.round(score * 10) / 10,
    band,
    trimp: Math.round(totalTrimp),
    workMinutes: totalWork,
    highIntensityMinutes: totalHigh,
    averagePercentHRR: totalWork > 0 ? Math.round((weightedSum / totalWork) * 100) / 100 : 0,
  };
}

export const STRAIN_BAND_LABEL: Record<StrainBand, string> = {
  light: "Light",
  moderate: "Moderate",
  high: "High",
  "all-out": "All-Out",
};

/** Returns the CSS color token that best matches the strain band. */
export function strainBandColor(band: StrainBand): string {
  switch (band) {
    case "light":
      return "var(--readiness-green)";
    case "moderate":
      return "var(--pillar-strain)";
    case "high":
      return "var(--color-accent)";
    case "all-out":
      return "var(--readiness-red)";
  }
}
