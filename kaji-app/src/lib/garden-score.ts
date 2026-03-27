export function calcGardenScore(ratios: number[]): number {
  if (ratios.length === 0) return 100;
  const withinCycle = ratios.filter((r) => r <= 1.0).length;
  return Math.round((withinCycle / ratios.length) * 100);
}

export type GardenRecord = {
  highScore: number;
  allGreenCount: number;
  longestAllGreen: number;
};
