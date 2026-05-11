"use client";

import * as React from "react";

type Props = {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
};

export function Sparkline({
  values,
  width = 64,
  height = 22,
  color = "var(--color-accent)",
  fill = true,
}: Props) {
  const points = React.useMemo(() => {
    const cleaned = values.map((v) =>
      v == null || Number.isNaN(v) ? null : v
    );
    const nonNull = cleaned.filter((v): v is number => v != null);
    if (!nonNull.length) return null;
    const min = Math.min(...nonNull);
    const max = Math.max(...nonNull);
    const span = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    const coords = cleaned.map((v, i) => {
      if (v == null) return null;
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return { x, y };
    });
    return coords;
  }, [values, width, height]);

  if (!points) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--color-stroke-strong)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      </svg>
    );
  }

  let path = "";
  let area = "";
  let started = false;
  for (const p of points) {
    if (p == null) continue;
    if (!started) {
      path += `M ${p.x},${p.y}`;
      area += `M ${p.x},${height} L ${p.x},${p.y}`;
      started = true;
    } else {
      path += ` L ${p.x},${p.y}`;
      area += ` L ${p.x},${p.y}`;
    }
  }
  area += ` L ${width},${height} Z`;

  return (
    <svg width={width} height={height} aria-hidden>
      {fill && <path d={area} fill={color} opacity={0.18} />}
      <path d={path} stroke={color} strokeWidth={1.4} fill="none" />
    </svg>
  );
}
