export type FreshnessLevel = "fresh" | "upcoming" | "due" | "stale";

export type FreshnessInfo = {
  level: FreshnessLevel;
  ratio: number;
  label: string;
};

export function computeFreshness(
  lastPerformedAt: Date | null,
  intervalDays: number,
  now: Date = new Date()
): FreshnessInfo {
  const hoursSinceLast = lastPerformedAt
    ? (now.getTime() - lastPerformedAt.getTime()) / (1000 * 60 * 60)
    : intervalDays * 24;

  const totalHours = intervalDays * 24;
  const ratio = totalHours > 0 ? hoursSinceLast / totalHours : 0;

  let level: FreshnessLevel;
  let label: string;
  if (ratio < 0.5) {
    level = "fresh";
    label = "やったぜ";
  } else if (ratio < 0.85) {
    level = "upcoming";
    label = "もう一回やっとく？";
  } else if (ratio < 1.5) {
    level = "due";
    label = "そろそろかな";
  } else {
    level = "stale";
    label = "久しぶりだね";
  }

  return { level, ratio, label };
}

export function freshnessHue(ratio: number): number {
  const clamped = Math.min(Math.max(ratio, 0), 2.0);
  return Math.round(140 - (clamped / 2.0) * 115);
}

export type PlantStage = "sprout" | "growing" | "budding" | "bloom" | "wilting" | "withered";

export function plantStage(ratio: number): PlantStage {
  if (ratio < 0.3) return "sprout";
  if (ratio < 0.6) return "growing";
  if (ratio < 0.85) return "budding";
  if (ratio < 1.2) return "bloom";
  if (ratio < 1.8) return "wilting";
  return "withered";
}

export function plantEmoji(stage: PlantStage): string {
  const map: Record<PlantStage, string> = {
    sprout: "🌱",
    growing: "🌿",
    budding: "🌷",
    bloom: "🌺",
    wilting: "🥀",
    withered: "🍂",
  };
  return map[stage];
}
