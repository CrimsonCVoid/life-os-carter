import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function pluralize(n: number, one: string, many?: string) {
  return n === 1 ? one : many ?? `${one}s`;
}

export const ACCENT_HUES: Record<string, { h: number; s: number; l: number }> = {
  violet: { h: 258, s: 90, l: 76 },
  emerald: { h: 160, s: 70, l: 60 },
  rose: { h: 350, s: 84, l: 70 },
  amber: { h: 35, s: 95, l: 60 },
};
