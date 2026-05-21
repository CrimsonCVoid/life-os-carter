"use client";

import * as React from "react";
import { Barcode } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { BarcodeScannerModal } from "@/components/nutrition/barcode-scanner-modal";
import { lookupBarcode, type OFFProduct } from "@/lib/integrations/open-food-facts";
import { haptic } from "@/lib/haptics";

export function BarcodeQuickAdd() {
  const addMeal = useStore((s) => s.addMeal);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<OFFProduct | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [servings, setServings] = React.useState("1");

  const handleDetected = async (barcode: string) => {
    setScannerOpen(false);
    setLoading(true);
    setError(null);
    try {
      const p = await lookupBarcode(barcode);
      if (!p) {
        setError(`No product found for ${barcode}.`);
        return;
      }
      setPreview(p);
      setServings("1");
    } catch {
      setError("Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const commit = () => {
    if (!preview) return;
    const s = parseFloat(servings) || 1;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    addMeal({
      date: todayStr(),
      time: `${hh}:${mm}`,
      name: preview.brand ? `${preview.brand} · ${preview.name}` : preview.name,
      calories: Math.round((preview.caloriesPerServing ?? 0) * s),
      protein: Math.round((preview.proteinPerServing ?? 0) * s),
      carbs:
        preview.carbsPerServing != null
          ? Math.round(preview.carbsPerServing * s)
          : undefined,
      fat:
        preview.fatPerServing != null
          ? Math.round(preview.fatPerServing * s)
          : undefined,
    });
    haptic("success");
    setPreview(null);
  };

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        size="lg"
        onClick={() => {
          setScannerOpen(true);
          haptic("tap");
        }}
      >
        <Barcode size={14} />
        Scan barcode
      </Button>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />

      <Modal
        open={!!preview || loading || !!error}
        onClose={() => {
          setPreview(null);
          setError(null);
        }}
        title="Add scanned item"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={commit} disabled={!preview}>
              Log
            </Button>
          </div>
        }
      >
        {loading && (
          <div className="text-center py-6 text-[12px] text-[var(--color-fg-3)]">
            Looking up product…
          </div>
        )}
        {error && (
          <div className="text-center py-6 text-[12px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
        {preview && (
          <div className="space-y-3">
            <div>
              <div className="text-[14px] font-semibold">
                {preview.brand ? `${preview.brand} · ${preview.name}` : preview.name}
              </div>
              {preview.servingSizeText && (
                <div className="text-[11px] text-[var(--color-fg-3)]">
                  Serving: {preview.servingSizeText}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[12px] tnum">
              <div>kcal {preview.caloriesPerServing ?? "—"}</div>
              <div>P {preview.proteinPerServing ?? "—"} g</div>
              <div>C {preview.carbsPerServing ?? "—"} g</div>
              <div>F {preview.fatPerServing ?? "—"} g</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1">
                Servings
              </div>
              <Input
                type="number"
                inputMode="decimal"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
