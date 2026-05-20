"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleRow } from "@/components/ui/toggle";
import { saveSettings, useUserSettings } from "@/lib/hooks/use-settings";

type PeakStateSettings = {
  showPeakState?: boolean;
};

/**
 * Single switch: show / hide the Peak State hero on Today.
 *
 * Default = on. When off, the hero card hides even when the score is
 * computable; the underlying peak_state_logs row still updates in the
 * background (no point throwing away the data if the user re-enables
 * it tomorrow).
 *
 * NO weight customization here. The formula is opinionated by design —
 * the spec explicitly forbids gamification, so we don't let users
 * tune the score until it tells them what they want to hear.
 */
export function PeakStateCard() {
  const { settings } = useUserSettings<PeakStateSettings & Record<string, unknown>>();
  const checked = settings.showPeakState !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Peak State</CardTitle>
      </CardHeader>
      <ToggleRow
        label="Show Peak State"
        description="Hero card at the top of Today. Hide if you'd rather see Vitals first."
        checked={checked}
        onChange={(v) => {
          void saveSettings({ ...settings, showPeakState: v });
        }}
      />
    </Card>
  );
}
