"use client";

import * as React from "react";
import { useMotionValue, useTransform, animate } from "motion/react";
import { motion } from "motion/react";

type Props = {
  value: number;
  decimals?: number;
  className?: string;
  suffix?: string;
  durationMs?: number;
};

export function CountUp({
  value,
  decimals = 0,
  className,
  suffix,
  durationMs = 600,
}: Props) {
  const m = useMotionValue(value);
  const rounded = useTransform(m, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()
  );

  React.useEffect(() => {
    const controls = animate(m, value, {
      duration: durationMs / 1000,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [value, m, durationMs]);

  return (
    <span className={className}>
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}
