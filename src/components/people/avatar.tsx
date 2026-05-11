"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#8B5CF6",
  "#6366F1",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#22D3EE",
  "#84CC16",
  "#A855F7",
];

function hueForName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function Avatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const color = hueForName(name);
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "shrink-0 grid place-items-center rounded-full font-semibold text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, #000))`,
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}
