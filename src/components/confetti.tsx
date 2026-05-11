"use client";

import * as React from "react";

const COLORS = ["#A78BFA", "#8B5CF6", "#34D399", "#FBBF24", "#F87171", "#60A5FA"];

export function Confetti() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rot: number;
      vr: number;
      life: number;
    };
    const particles: P[] = [];
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: width / 2,
        y: height / 2 - 20,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 6 - 4,
        size: 3 + Math.random() * 4,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }

    let raf = 0;
    const start = performance.now();

    const draw = (t: number) => {
      const dt = 1 / 60;
      ctx.clearRect(0, 0, width, height);
      const elapsed = (t - start) / 1000;
      for (const p of particles) {
        p.vy += 0.18;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 1.8);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();
      }
      if (elapsed < 1.8) {
        raf = requestAnimationFrame(draw);
      }
      void dt;
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10"
    />
  );
}
