"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/store";
import { useBodyRaw } from "@/store/selectors";
import { BodyMeasurement } from "@/lib/types";
import { todayStr, format, fromDateStr, lastNDates } from "@/lib/date";
import { round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const FIELDS: Array<{
  key: keyof Omit<BodyMeasurement, "id" | "createdAt" | "date" | "notes">;
  label: string;
  unit: string;
}> = [
  { key: "weight", label: "Weight", unit: "lb" },
  { key: "chest", label: "Chest", unit: "in" },
  { key: "waist", label: "Waist", unit: "in" },
  { key: "hips", label: "Hips", unit: "in" },
  { key: "bicep", label: "Bicep", unit: "in" },
  { key: "thigh", label: "Thigh", unit: "in" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
];

export function MeasurementsTab() {
  const body = useBodyRaw();
  const removeBodyMeasurement = useStore((s) => s.removeBodyMeasurement);
  const [logOpen, setLogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BodyMeasurement | null>(null);

  const sorted = React.useMemo(
    () => [...body].sort((a, b) => b.date.localeCompare(a.date)),
    [body]
  );

  return (
    <>
      <Button
        onClick={() => setLogOpen(true)}
        className="w-full"
        size="lg"
      >
        <Plus size={16} />
        Log measurements
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Trends · 90 days</CardTitle>
        </CardHeader>
        {body.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--color-fg-3)]">
            Log some measurements to see trends.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <MiniChart key={f.key} field={f} body={body} />
            ))}
          </div>
        )}
      </Card>

      {sorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {sorted.slice(0, 30).map((m) => (
              <li
                key={m.id}
                className="group flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--color-elevated)]"
              >
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium">
                    {format(fromDateStr(m.date), "MMM d, yyyy")}
                  </div>
                  <div className="text-[11px] text-[var(--color-fg-3)] truncate">
                    {FIELDS.filter((f) => m[f.key] != null)
                      .map((f) => `${f.label} ${round1(m[f.key] as number)}${f.unit}`)
                      .join(" · ") || "—"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeBodyMeasurement(m.id);
                    haptic("warn");
                  }}
                  className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <LogMeasurementModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
      <EditMeasurementModal
        item={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function MiniChart({
  field,
  body,
}: {
  field: (typeof FIELDS)[number];
  body: BodyMeasurement[];
}) {
  const data = React.useMemo(() => {
    const dates = lastNDates(90);
    const map = new Map<string, number>();
    for (const m of body) {
      if (m[field.key] != null) map.set(m.date, m[field.key] as number);
    }
    return dates.map((d) => ({
      date: format(fromDateStr(d), "M/d"),
      v: map.get(d) ?? null,
    }));
  }, [body, field.key]);
  const valid = data.filter((d) => d.v != null);
  if (valid.length === 0) return null;
  const last = valid[valid.length - 1].v as number;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="label text-[9px]">{field.label}</span>
        <span className="text-sm font-semibold tnum">
          {round1(last)}
          {field.unit}
        </span>
      </div>
      <div className="h-12 mt-1.5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="2 4" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-stroke-strong)",
                fontSize: 11,
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--color-fg-3)" }}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LogMeasurementModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addBodyMeasurement = useStore((s) => s.addBodyMeasurement);
  const [date, setDate] = React.useState(todayStr());
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setDate(todayStr());
      setValues({});
      setNotes("");
    }
  }, [open]);

  const save = () => {
    const m: Partial<BodyMeasurement> = { date };
    for (const f of FIELDS) {
      const v = values[f.key];
      if (v && v.trim()) {
        const n = parseFloat(v);
        if (Number.isFinite(n)) {
          (m as Record<string, number>)[f.key] = n;
        }
      }
    }
    if (notes.trim()) m.notes = notes.trim();
    addBodyMeasurement(m as Omit<BodyMeasurement, "id" | "createdAt">);
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log measurements"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-2">Date</div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <div className="label mb-2 text-[9px]">
                {f.label} ({f.unit})
              </div>
              <Input
                type="number"
                inputMode="decimal"
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder="—"
              />
            </div>
          ))}
        </div>
        <div>
          <div className="label mb-2">Notes (optional)</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>
    </Modal>
  );
}

function EditMeasurementModal({
  item,
  onClose,
}: {
  item: BodyMeasurement | null;
  onClose: () => void;
}) {
  const updateBodyMeasurement = useStore((s) => s.updateBodyMeasurement);
  const open = !!item;
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!item) return;
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = item[f.key];
      if (v != null) next[f.key] = String(v);
    }
    setValues(next);
    setNotes(item.notes ?? "");
  }, [item]);

  if (!open) return null;
  const save = () => {
    const patch: Partial<BodyMeasurement> = { notes: notes.trim() || undefined };
    for (const f of FIELDS) {
      const v = values[f.key];
      if (!v || !v.trim()) {
        (patch as Record<string, undefined>)[f.key] = undefined;
        continue;
      }
      const n = parseFloat(v);
      if (Number.isFinite(n)) (patch as Record<string, number>)[f.key] = n;
    }
    updateBodyMeasurement(item.id, patch);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit · ${format(fromDateStr(item.date), "MMM d, yyyy")}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="label mb-2 text-[9px]">
              {f.label} ({f.unit})
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="label mb-2">Notes</div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </Modal>
  );
}
