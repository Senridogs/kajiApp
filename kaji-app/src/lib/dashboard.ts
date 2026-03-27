import { computeFreshness, plantStage } from "@/lib/freshness";
import { addDays, startOfJstDay } from "@/lib/time";
import type { ChoreWithComputed, StatsPeriodKey } from "@/lib/types";

export function computeChore(
  chore: {
    id: string;
    title: string;
    icon: string;
    iconColor: string;
    bgColor: string;
    intervalDays: number;
    archived: boolean;
    defaultAssigneeId: string | null;
    createdAt: Date;
  },
  latestRecord: {
    id: string;
    performedAt: Date;
    isInitial: boolean;
    isSkipped: boolean;
    userId: string;
  } | null,
  users: Array<{ id: string; name: string }>,
  now: Date = new Date()
): ChoreWithComputed {
  // isInitialレコードは最終実施日から除外（現行踏襲）
  const effectiveRecord =
    latestRecord && !latestRecord.isInitial ? latestRecord : null;

  const lastPerformedAt = effectiveRecord?.performedAt ?? null;
  const daysSinceLast = lastPerformedAt
    ? Math.floor(
        (now.getTime() - lastPerformedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const freshness = computeFreshness(lastPerformedAt, chore.intervalDays, now);
  const stage = plantStage(freshness.ratio);

  const performer = effectiveRecord
    ? users.find((u) => u.id === effectiveRecord.userId)
    : null;

  return {
    id: chore.id,
    title: chore.title,
    icon: chore.icon,
    iconColor: chore.iconColor,
    bgColor: chore.bgColor,
    intervalDays: chore.intervalDays,
    archived: chore.archived,
    defaultAssigneeId: chore.defaultAssigneeId,
    defaultAssigneeName:
      chore.defaultAssigneeId
        ? (users.find((u) => u.id === chore.defaultAssigneeId)?.name ?? null)
        : null,
    daysSinceLast,
    lastPerformedAt: lastPerformedAt?.toISOString() ?? null,
    lastPerformerName: effectiveRecord?.isSkipped
      ? "スキップ"
      : (performer?.name ?? null),
    lastPerformerId: effectiveRecord?.userId ?? null,
    lastRecordId: effectiveRecord?.id ?? null,
    lastRecordIsInitial: latestRecord?.isInitial ?? false,
    lastRecordSkipped: effectiveRecord?.isSkipped ?? false,
    freshnessRatio: freshness.ratio,
    freshnessLevel: freshness.level,
    freshnessLabel: freshness.label,
    plantStage: stage,
  };
}

export function getStatsRange(
  period: StatsPeriodKey,
  now = new Date(),
  customFrom?: string,
  customTo?: string,
) {
  const end = new Date(addDays(startOfJstDay(now), 1).getTime() - 1);

  if (period === "all") {
    return { start: undefined, end, label: "全期間" };
  }

  if (period === "custom") {
    if (!customFrom || !customTo) return null;

    const from = new Date(`${customFrom}T00:00:00+09:00`);
    const to = new Date(`${customTo}T23:59:59.999+09:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    if (from > to) return null;

    return { start: from, end: to, label: `${customFrom} - ${customTo}` };
  }

  const daysMap: Record<Exclude<StatsPeriodKey, "all" | "custom">, number> = {
    week: 7,
    month: 30,
    half: 180,
    year: 365,
  };
  const days = daysMap[period as keyof typeof daysMap] ?? 7;
  // Relative periods are evaluated by completed calendar days in JST.
  const start = addDays(startOfJstDay(now), -(days - 1));
  const labelMap: Record<Exclude<StatsPeriodKey, "custom">, string> = {
    week: "直近1週間",
    month: "直近1か月",
    half: "直近半年",
    year: "直近1年",
    all: "全期間",
  };
  return { start, end, label: labelMap[period as keyof typeof labelMap] };
}
