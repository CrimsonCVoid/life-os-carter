"use client";

import * as React from "react";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/ui/segmented";
import { MeasurementsTab } from "@/components/body/measurements";
import { PhotosTab } from "@/components/body/photos";

type Tab = "measure" | "photos";

export default function BodyPage() {
  const [tab, setTab] = React.useState<Tab>("measure");
  return (
    <Screen title="Body" subtitle="The whole picture, beyond the scale.">
      <div className="flex justify-center">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "measure", label: "Measurements" },
            { value: "photos", label: "Photos" },
          ]}
          size="sm"
        />
      </div>
      {tab === "measure" ? <MeasurementsTab /> : <PhotosTab />}
    </Screen>
  );
}
