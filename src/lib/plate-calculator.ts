export const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const;
export const DEFAULT_BAR_WEIGHTS_LB = [45, 35, 25, 15, 0] as const;

export type PlateBreakdown = {
  perSide: number[];
  totalLoaded: number;
  remainder: number;
  barWeight: number;
  targetTotal: number;
};

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function calculatePlates(
  targetTotal: number,
  barWeight: number = 45
): PlateBreakdown {
  if (!Number.isFinite(targetTotal) || targetTotal < 0) {
    return {
      perSide: [],
      totalLoaded: barWeight,
      remainder: roundHalf(targetTotal - barWeight),
      barWeight,
      targetTotal,
    };
  }

  if (targetTotal < barWeight) {
    return {
      perSide: [],
      totalLoaded: barWeight,
      remainder: roundHalf(targetTotal - barWeight),
      barWeight,
      targetTotal,
    };
  }

  let perSideRemaining = (targetTotal - barWeight) / 2;
  const perSide: number[] = [];

  for (const plate of STANDARD_PLATES_LB) {
    while (perSideRemaining + 1e-9 >= plate) {
      perSide.push(plate);
      perSideRemaining -= plate;
    }
  }

  const perSideSum = perSide.reduce((a, b) => a + b, 0);
  const totalLoaded = roundHalf(barWeight + 2 * perSideSum);
  const remainder = roundHalf(targetTotal - totalLoaded);

  return {
    perSide,
    totalLoaded,
    remainder,
    barWeight,
    targetTotal,
  };
}

export function formatPerSide(perSide: number[]): string {
  if (perSide.length === 0) return "—";
  return perSide.join(" + ");
}
