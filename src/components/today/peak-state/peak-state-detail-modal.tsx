"use client";

import * as React from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Modal } from "@/components/ui/modal";
import { format, fromDateStr, shiftDate } from "@/lib/date";
import { metricColors, metricHex } from "@/lib/metric-colors";
import { ProgressRing } from "@/components/today/vitals/progress-ring";
import {
  useHrvRange,
  useRhrRange,
  useCardioLoadRange,
} from "@/lib/hooks/use-metrics";
import { usePeakState } from "@/lib/hooks/use-peak-state";
import { RecommendationPill, recommendationColor } from "./recommendation-pill";
import type { Contributor, Recommendation } from "@/lib/peak-state/compute";
import { recommendationDetail } from "@/lib/peak-state/compute";

type PeakStateRangeRow = {
  date: string;
  peakState: number | null;
  recovery: number | null;
  strain: number | null;
  lifestyle: number | null;
  recommendation: Recommendation | null;
  contributors: Contributor[];
  availableInputs: number;
};

const BASELINE_TARGET_DAYS = 14;

/**
 * Peak State detail bottom sheet. Layout, top → bottom:
 *   1. Big Peak State ring (today)
 *   2. Three sub-score rings (Recovery / Strain / Lifestyle)
 *   3. "What's moving your score" — full contributors list, sorted
 *      by |impact| desc, with +/- chips
 *   4. Baseline status (HRV / RHR / Cardio days vs 14)
 *   5. 30-day Peak State trend bar chart, colored by recommendation
 */
export function PeakStateDetailModal({
  open,
  onClose,
  rowDate,
}: {
  open: boolean;
  onClose: () => void;
  rowDate: string;
}) {
  const { row } = usePeakState(rowDate);
  // 30-day trend.
  const start = React.useMemo(() => shiftDate(rowDate, -29), [rowDate]);
  const trend = useSWR<PeakStateRangeRow[]>(
    open ? `/api/data/peak-state?start=${start}&end=${rowDate}` : null
  );
  // Baselines — counted client-side from the same range endpoints the
  // sparkline & chart consume, so we don't add new round-trips.
  const baselineStart = React.useMemo(
    () => shiftDate(rowDate, -BASELINE_TARGET_DAYS),
    [rowDate]
  );
  const cardioStart = React.useMemo(
    () => shiftDate(rowDate, -28),
    [rowDate]
  );
  const hrvRange = useHrvRange(baselineStart, rowDate);
  const rhrRange = useRhrRange(baselineStart, rowDate);
  const cardioRange = useCardioLoadRange(cardioStart, rowDate);

  const c = metricColors("peak");
  const peakColor = metricHex("peak");

  if (!row || row.peakState == null) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Peak State"
        description="No score yet"
        size="lg"
      >
        <p className="text-sm text-[var(--color-fg-2)]">
          Once at least 4 inputs are available (mood, energy, water, sleep,
          HRV, RHR, cardio load), this view will explain what&rsquo;s moving
          your number.
        </p>
      </Modal>
    );
  }

  const contributors = (row.contributors as Contributor[] | undefined) ?? [];
  const recovery = row.recovery;
  const strain = row.strain;
  const lifestyle = row.lifestyle;

  const hrvDays = countFinite(hrvRange.data as unknown[] | undefined, "ms");
  const rhrDays = countFinite(rhrRange.data as unknown[] | undefined, "bpm");
  const cardioDays = countFinite(
    cardioRange.data as unknown[] | undefined,
    "value"
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Peak State"
      description={
        row.recommendation
          ? recommendationDetail(row.recommendation as Recommendation)
          : undefined
      }
      size="lg"
    >
      <div className="space-y-6">
        {/* ── Hero ring + recommendation ─────────────────────────────────── */}
        <div className="flex items-center justify-center py-2">
          <ProgressRing
            progress={row.peakState / 100}
            size={156}
            stroke={12}
            color={c.base}
            ariaLabel={`Peak State ${row.peakState} out of 100`}
          >
            <div className="text-center">
              <div
                className="tnum font-bold leading-none text-[52px]"
                style={{ color: c.base }}
              >
                {row.peakState}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-3)]">
                /100
              </div>
            </div>
          </ProgressRing>
        </div>
        {row.recommendation && (
          <div className="flex justify-center">
            <RecommendationPill
              recommendation={row.recommendation as Recommendation}
            />
          </div>
        )}

        {/* ── Sub-score rings ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <SubScoreRing label="Recovery" value={recovery} tone="--color-success" />
          <SubScoreRing label="Strain" value={strain} tone="--color-warning" inverted />
          <SubScoreRing label="Lifestyle" value={lifestyle} tone="--mc-carbs" />
        </div>

        {/* ── Contributors ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="label">What&rsquo;s moving your score</h3>
          {contributors.length === 0 ? (
            <p className="text-[12px] text-[var(--color-fg-3)]">
              Not enough inputs to attribute movement yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {contributors.map((c, i) => (
                <ContributorRow key={`${c.label}-${i}`} contributor={c} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Baseline status ───────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="label">Baseline status</h3>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <BaselineCell label="HRV" days={hrvDays} />
            <BaselineCell label="RHR" days={rhrDays} />
            <BaselineCell label="Cardio" days={cardioDays} target={28} />
          </div>
        </section>

        {/* ── 30-day trend ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="label">30-day trend</h3>
          <TrendChart
            data={trend.data ?? []}
            fallbackColor={peakColor}
            endDate={rowDate}
          />
        </section>
      </div>
    </Modal>
  );
}

function SubScoreRing({
  label,
  value,
  tone,
  inverted,
}: {
  label: string;
  value: number | null;
  tone: string;
  inverted?: boolean;
}) {
  const color = `var(${tone})`;
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-3 flex flex-col items-center gap-2">
      <div className="label text-[9px]">{label}</div>
      <ProgressRing
        progress={(value ?? 0) / 100}
        size={72}
        stroke={6}
        color={color}
        ariaLabel={`${label} ${value ?? 0} out of 100`}
      >
        <div className="text-center">
          <div
            className="tnum font-semibold leading-none text-[20px]"
            style={{ color: value != null ? color : "var(--color-fg-3)" }}
          >
            {value != null ? value : "—"}
          </div>
        </div>
      </ProgressRing>
      {inverted && (
        <div className="text-[9px] text-[var(--color-fg-3)] tracking-tight">
          higher = more taxed
        </div>
      )}
    </div>
  );
}

function ContributorRow({ contributor }: { contributor: Contributor }) {
  const positive = contributor.direction === "positive";
  const negative = contributor.direction === "negative";
  const tone = positive
    ? "var(--color-success)"
    : negative
      ? "var(--color-danger)"
      : "var(--color-fg-3)";
  const sign = positive ? "+" : negative ? "−" : "±";
  const value = Math.abs(contributor.impact).toFixed(1);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--color-fg)]">
          {contributor.label}
        </div>
        <div className="text-[11px] text-[var(--color-fg-3)] truncate">
          {contributor.detail}
        </div>
      </div>
      <span
        className="tnum text-[12px] font-semibold tabular-nums whitespace-nowrap"
        style={{ color: tone }}
      >
        {sign}
        {value}
      </span>
    </li>
  );
}

function BaselineCell({
  label,
  days,
  target = BASELINE_TARGET_DAYS,
}: {
  label: string;
  days: number;
  target?: number;
}) {
  const ready = days >= target;
  return (
    <div
      className="rounded-lg border px-2.5 py-1.5"
      style={{
        borderColor: ready
          ? "color-mix(in srgb, var(--color-success) 32%, transparent)"
          : "var(--color-stroke)",
        background: ready
          ? "color-mix(in srgb, var(--color-success) 8%, transparent)"
          : "var(--color-elevated)",
      }}
    >
      <div className="label text-[9px]">{label}</div>
      <div
        className="mt-0.5 tnum text-[13px] font-semibold"
        style={{
          color: ready ? "var(--color-success)" : "var(--color-fg)",
        }}
      >
        {Math.min(days, target)}/{target}
        {!ready && (
          <span className="ml-1 font-normal text-[10px] text-[var(--color-fg-3)]">
            building
          </span>
        )}
      </div>
    </div>
  );
}

function TrendChart({
  data,
  fallbackColor,
  endDate,
}: {
  data: PeakStateRangeRow[];
  fallbackColor: string;
  endDate: string;
}) {
  // Pad to 30 days so the x-axis stays stable when data is sparse.
  const chartData = React.useMemo(() => {
    const byDate = new Map(data.map((r) => [r.date, r]));
    const out: Array<{
      date: string;
      label: string;
      value: number | null;
      color: string;
    }> = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = shiftDate(endDate, -i);
      const r = byDate.get(d);
      out.push({
        date: d,
        label: format(fromDateStr(d), "M/d"),
        value: r?.peakState ?? null,
        color: r?.recommendation
          ? recommendationColor(r.recommendation)
          : fallbackColor,
      });
    }
    return out;
  }, [data, endDate, fallbackColor]);

  return (
    <div className="h-[180px] -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={28}
            domain={[0, 100]}
          />
          <Tooltip
            cursor={{ fill: "var(--color-elevated)" }}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-stroke-strong)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-fg)",
            }}
            formatter={(v) =>
              v == null || typeof v !== "number" ? "—" : `${Math.round(v)}`
            }
            labelFormatter={(d) =>
              typeof d === "string" ? d : String(d)
            }
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={d.value == null ? 0 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function countFinite(rows: unknown[] | undefined, key: string): number {
  if (!rows) return 0;
  let n = 0;
  for (const r of rows) {
    const v = (r as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) n += 1;
  }
  return n;
}
