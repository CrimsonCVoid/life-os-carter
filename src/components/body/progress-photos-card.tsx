"use client";

import * as React from "react";
import {
  Camera,
  Loader2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Minus,
  Film,
  Flame,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ProgressPhotoModal } from "./progress-photo-modal";
import { MonthVideoModal } from "./month-video-modal";
import { PhotoTimelineScrubber } from "./photo-timeline-scrubber";
import {
  useProgressPhotos,
  type ProgressPhoto,
  type SilhouetteFeatures,
  type VlmObservations,
} from "@/lib/hooks/use-progress-photos";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Props = { userId?: string };

function ymd(d: Date | string): string {
  const dd = typeof d === "string" ? new Date(d) : d;
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
}

function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function inCurrentMonth(p: ProgressPhoto): boolean {
  const d = new Date(p.capturedAt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Daily streak = consecutive days back from today with at least one front photo. */
function calcStreak(photos: ProgressPhoto[]): number {
  const days = new Set(photos.map((p) => ymd(p.capturedAt)));
  let streak = 0;
  const cursor = new Date();
  while (days.has(ymd(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function ProgressPhotosCard({ userId }: Props) {
  void userId;
  const heightCm = useStore((s) => s.settings.bodyProfile.heightCm);
  const { photos, loading, error, reload } = useProgressPhotos();
  const [open, setOpen] = React.useState(false);
  const [videoOpen, setVideoOpen] = React.useState(false);

  // Deep-link from the "Capture daily photo" App Shortcut — opens the
  // capture modal automatically when arriving at /body?action=capture.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "capture") {
      setOpen(true);
      params.delete("action");
      const q = params.toString();
      const url = window.location.pathname + (q ? `?${q}` : "");
      window.history.replaceState(null, "", url);
    }
  }, []);

  const completed = React.useMemo(
    () => photos.filter((p) => p.analysis?.status === "complete"),
    [photos]
  );

  const latest = photos[0] ?? null;
  const prior = photos[1] ?? null;

  const photosThisMonth = React.useMemo(
    () => photos.filter(inCurrentMonth),
    [photos]
  );

  const streak = React.useMemo(() => calcStreak(photos), [photos]);
  const todayCaptured = photos.some(
    (p) => ymd(p.capturedAt) === ymd(new Date())
  );

  const latestCompleted = completed[0] ?? null;
  const priorCompleted = completed[1] ?? null;

  const bfTrend = React.useMemo(
    () =>
      [...completed]
        .reverse()
        .filter((p) => p.analysis?.bfEstimatePct != null)
        .map((p) => ({
          date: p.capturedAt.slice(5, 10),
          bf: p.analysis!.bfEstimatePct,
        })),
    [completed]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily progress photo</CardTitle>
        <Button
          variant={todayCaptured ? "secondary" : "primary"}
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Camera size={12} />
          {todayCaptured ? "Replace today" : "Capture today"}
        </Button>
      </CardHeader>

      {loading && photos.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-fg-3)]">Loading…</div>
      ) : error ? (
        <div className="py-6 text-center text-xs text-[var(--color-danger)]">{error}</div>
      ) : photos.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-fg-3)]">
          <div className="text-[14px] text-[var(--color-fg-2)] mb-1">
            Today's the start of the streak.
          </div>
          Capture your first photo to begin the monthly compilation.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-stretch gap-3">
            <div className="w-32 shrink-0">
              <LatestPhotoTile photo={latest} onChange={reload} />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <StatTile
                icon={<Flame size={14} />}
                label="Streak"
                value={`${streak}`}
                suffix=" day"
                accent={streak >= 7 ? "warning" : streak >= 3 ? "accent" : "neutral"}
              />
              <StatTile
                icon={<Camera size={14} />}
                label="This month"
                value={`${photosThisMonth.length}`}
                suffix=" / 30"
              />
            </div>
          </div>

          {photos.length >= 2 && <PhotoTimelineScrubber photos={photos} />}

          {photosThisMonth.length >= 2 && (
            <Button
              variant="secondary"
              size="default"
              className="w-full"
              onClick={() => setVideoOpen(true)}
            >
              <Film size={14} />
              Export this month's video ({photosThisMonth.length}s)
            </Button>
          )}

          {!heightCm && completed.length > 0 && (
            <a
              href="/settings"
              className="block text-center text-[11px] text-[var(--color-warning)] underline underline-offset-2"
            >
              Add your height in settings to unlock BF% + cm measurements
            </a>
          )}

          {latestCompleted && (
            <HeadlineCard latest={latestCompleted} prior={priorCompleted} />
          )}

          {bfTrend.length >= 2 && <BfTrendChart data={bfTrend} />}

          {latestCompleted?.analysis?.silhouetteFeatures && (
            <MeasurementsGrid
              current={latestCompleted.analysis.silhouetteFeatures}
              prior={priorCompleted?.analysis?.silhouetteFeatures ?? null}
            />
          )}

          {latestCompleted?.analysis?.vlmObservations && (
            <ObservationsCard obs={latestCompleted.analysis.vlmObservations} />
          )}
        </div>
      )}

      <ProgressPhotoModal
        open={open}
        onClose={() => setOpen(false)}
        priorPhotoId={prior?.id ?? null}
        onCreated={() => void reload()}
      />
      <MonthVideoModal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        photos={photosThisMonth}
      />
    </Card>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  accent?: "neutral" | "accent" | "warning";
}) {
  const color =
    accent === "warning"
      ? "var(--color-warning)"
      : accent === "accent"
      ? "var(--color-accent)"
      : "var(--color-fg-2)";
  return (
    <div className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-2.5 flex flex-col justify-between">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="text-[20px] font-semibold tnum mt-1" style={{ color }}>
        {value}
        {suffix && <span className="text-[11px] font-normal opacity-70">{suffix}</span>}
      </div>
    </div>
  );
}

function LatestPhotoTile({
  photo,
  onChange,
}: {
  photo: ProgressPhoto | null;
  onChange: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const status = photo?.analysis?.status;
  const inflight = status === "pending" || status === "processing" || (photo && !status);

  const handleDelete = async () => {
    if (!photo) return;
    await fetch(`/api/body/progress-photos/${photo.id}`, { method: "DELETE" });
    haptic("warn");
    onChange();
  };

  return (
    <>
      <div className="relative rounded-xl border border-[var(--color-stroke)] overflow-hidden aspect-[3/4] bg-[var(--color-elevated)]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/body/progress-photos/${photo.id}/image`}
            alt="Latest progress"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[var(--color-fg-3)]">
            <Camera size={16} />
          </div>
        )}

        {photo && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete photo"
            className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded bg-black/50 text-white"
          >
            <Trash2 size={11} />
          </button>
        )}

        {photo && inflight && (
          <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white">
            <Loader2 size={10} className="animate-spin" />
            {status === "processing" ? "analyzing" : "queued"}
          </div>
        )}

        {photo?.analysis?.bfEstimatePct != null && (
          <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white text-center tnum">
            {photo.analysis.bfEstimatePct.toFixed(1)}% BF
          </div>
        )}

        {status === "failed" && (
          <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 text-[10px] rounded text-center bg-[var(--color-danger)]/70 text-white">
            failed
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this photo?"
        description="The photo and its analysis row are removed. Blob bytes remain until cleanup."
      />
    </>
  );
}

function HeadlineCard({
  latest,
  prior,
}: {
  latest: ProgressPhoto;
  prior: ProgressPhoto | null;
}) {
  const bf = latest.analysis?.bfEstimatePct ?? null;
  const low = latest.analysis?.bfConfidenceLow ?? null;
  const high = latest.analysis?.bfConfidenceHigh ?? null;
  const priorBf = prior?.analysis?.bfEstimatePct ?? null;
  const delta = bf != null && priorBf != null ? bf - priorBf : null;
  const days = prior ? Math.round(daysBetween(prior.capturedAt, latest.capturedAt)) : null;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
            Body fat
          </div>
          {bf != null ? (
            <div className="flex items-baseline gap-2 mt-0.5">
              <div className="text-3xl font-semibold tnum">{bf.toFixed(1)}%</div>
              {low != null && high != null && (
                <div className="text-[11px] tnum text-[var(--color-fg-3)]">
                  ±{((high - low) / 2).toFixed(1)}%
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-fg-3)] mt-0.5">
              Set height to unlock
            </div>
          )}
        </div>
        {delta != null && (
          <DeltaPill
            delta={delta}
            suffix="%"
            decimals={1}
            inverted
            days={days}
          />
        )}
      </div>
    </div>
  );
}

function BfTrendChart({ data }: { data: Array<{ date: string; bf: number | null }> }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1">
        Trend
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="2 4" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-stroke-strong)",
                fontSize: 11,
                borderRadius: 8,
              }}
            />
            <Line
              type="monotone"
              dataKey="bf"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MeasurementsGrid({
  current,
  prior,
}: {
  current: SilhouetteFeatures;
  prior: SilhouetteFeatures | null;
}) {
  type Row = {
    label: string;
    value: number | null | undefined;
    priorValue: number | null | undefined;
    suffix?: string;
    decimals?: number;
    inverted?: boolean;
  };
  const rows: Row[] = [
    {
      label: "Shoulder/Waist",
      value: current.shoulder_to_waist_ratio,
      priorValue: prior?.shoulder_to_waist_ratio,
      decimals: 2,
    },
    {
      label: "Waist/Hip",
      value: current.waist_to_hip_ratio,
      priorValue: prior?.waist_to_hip_ratio,
      decimals: 2,
      inverted: true,
    },
    {
      label: "Waist (cm)",
      value: current.waist_cm,
      priorValue: prior?.waist_cm,
      suffix: " cm",
      decimals: 1,
      inverted: true,
    },
    {
      label: "Waist/Height",
      value: current.midsection_to_height_ratio,
      priorValue: prior?.midsection_to_height_ratio,
      decimals: 3,
      inverted: true,
    },
    {
      label: "V-taper score",
      value: current.v_taper_score,
      priorValue: prior?.v_taper_score,
      decimals: 0,
    },
    {
      label: "Composition score",
      value: current.composition_score,
      priorValue: prior?.composition_score,
      decimals: 0,
    },
  ];
  const visible = rows.filter((r) => r.value != null);
  if (visible.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)] mb-2">
        Measurements
      </div>
      <div className="grid grid-cols-2 gap-2">
        {visible.map((r) => (
          <MeasurementTile key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}

function MeasurementTile({
  label,
  value,
  priorValue,
  suffix,
  decimals = 1,
  inverted,
}: {
  label: string;
  value: number | null | undefined;
  priorValue?: number | null;
  suffix?: string;
  decimals?: number;
  inverted?: boolean;
}) {
  if (value == null) return null;
  const delta = priorValue != null ? value - priorValue : null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <div className="text-base font-semibold tnum">
          {value.toFixed(decimals)}
          {suffix ?? ""}
        </div>
        {delta != null && (
          <DeltaPill
            delta={delta}
            decimals={decimals}
            suffix={suffix}
            inverted={inverted}
            compact
          />
        )}
      </div>
    </div>
  );
}

function DeltaPill({
  delta,
  decimals = 1,
  suffix,
  inverted,
  compact,
  days,
}: {
  delta: number;
  decimals?: number;
  suffix?: string;
  inverted?: boolean;
  compact?: boolean;
  days?: number | null;
}) {
  const isZero = Math.abs(delta) < 0.0005;
  const good = isZero ? null : inverted ? delta < 0 : delta > 0;
  const Icon = isZero ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const color = isZero
    ? "var(--color-fg-3)"
    : good
    ? "var(--color-success)"
    : "var(--color-danger)";
  const sign = isZero ? "" : delta > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full tnum",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      )}
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      <Icon size={compact ? 9 : 11} />
      {sign}
      {Math.abs(delta).toFixed(decimals)}
      {suffix ?? ""}
      {days != null && !compact && (
        <span className="opacity-60 ml-0.5">· {days}d</span>
      )}
    </span>
  );
}

function ObservationsCard({ obs }: { obs: VlmObservations }) {
  const bracketLabels: Record<string, string> = {
    essential: "Essential",
    athletic: "Athletic",
    lean: "Lean",
    average: "Average",
    above_average: "Above average",
    high: "High",
  };
  const featureLabels: Record<string, string> = {
    obliques_visible: "Obliques",
    abdominal_definition: "Abs",
    vascularity: "Vascularity",
    midsection_softness: "Midsection",
    shoulder_definition: "Shoulders",
    chest_definition: "Chest",
    back_definition: "Back",
    leg_definition: "Legs",
  };
  const features = obs.features ?? {};
  const featureKeys = Object.keys(featureLabels).filter((k) => k in features);
  const bracket =
    obs.bracket && bracketLabels[obs.bracket]
      ? bracketLabels[obs.bracket as string]
      : obs.bracket;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-fg-3)]">
        <span className="uppercase tracking-wider">Observations</span>
        {obs.confidence && <span className="opacity-80">conf · {obs.confidence}</span>}
      </div>
      {bracket && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1">
            Bracket
          </div>
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            {bracket}
          </span>
        </div>
      )}
      {featureKeys.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1.5">
            Visible features
          </div>
          <div className="space-y-1.5">
            {featureKeys.map((k) => (
              <FeatureBar
                key={k}
                label={featureLabels[k]}
                value={Math.max(0, Math.min(5, Number(features[k] ?? 0)))}
                inverted={k === "midsection_softness"}
              />
            ))}
          </div>
        </div>
      )}
      {obs.summary && (
        <p className="text-[12px] leading-relaxed text-[var(--color-fg-2)] pt-1 border-t border-[var(--color-stroke)]">
          {obs.summary}
        </p>
      )}
    </div>
  );
}

function FeatureBar({
  label,
  value,
  inverted,
}: {
  label: string;
  value: number;
  inverted?: boolean;
}) {
  const pct = (value / 5) * 100;
  const tone = inverted
    ? value >= 3
      ? "var(--color-warning)"
      : "var(--color-fg-2)"
    : value >= 3
    ? "var(--color-accent)"
    : "var(--color-fg-2)";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-[11px] text-[var(--color-fg-2)] shrink-0">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-stroke)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
      <div className="w-6 text-[10px] tnum text-[var(--color-fg-3)] text-right">
        {value}/5
      </div>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(db - da) / 86_400_000;
}
