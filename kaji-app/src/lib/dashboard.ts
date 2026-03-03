import type { Chore, ChoreRecord, User } from "@prisma/client";

import { addDays, buildHomeDateKeys, diffDaysFloor, startOfJstDay } from "@/lib/time";
import type { ChoreWithComputed, HomeProgressEntry, StatsPeriodKey } from "@/lib/types";

type ChoreWithLatest = Chore & {
  records: (ChoreRecord & { user: Pick<User, "id" | "name"> })[];
};

type ChoreRecordWithOptionalSkip = ChoreRecord & {
  isSkipped?: boolean | null;
};

export function computeChore(chore: ChoreWithLatest, now = new Date()): ChoreWithComputed {
  const todayStart = startOfJstDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrow = addDays(todayStart, 2);
  const latestRecord = chore.records[0];
  // Future completion records are treated as pending to keep metrics/schedule consistent.
  const latest =
    latestRecord && latestRecord.performedAt < tomorrowStart
      ? latestRecord
      : undefined;
  const lastPerformedAt = latest?.performedAt ?? null;
  const dueBase = lastPerformedAt ?? chore.createdAt;
  const dueAt = addDays(dueBase, chore.intervalDays);

  const isDueToday = !!dueAt && dueAt >= todayStart && dueAt < tomorrowStart;
  const isDueTomorrow = !!dueAt && dueAt >= tomorrowStart && dueAt < dayAfterTomorrow;
  const isOverdue = !!dueAt && dueAt < todayStart;
  const overdueDays = isOverdue && dueAt ? diffDaysFloor(dueAt, todayStart) : 0;
  const daysSinceLast = lastPerformedAt ? diffDaysFloor(lastPerformedAt, now) : null;
  const isInitial = latest?.isInitial ?? false;

  const latestWithOptionalSkip = latest as ChoreRecordWithOptionalSkip | undefined;
  const isSkipped = latestWithOptionalSkip?.isSkipped ?? false;

  return {
    id: chore.id,
    title: chore.title,
    icon: chore.icon,
    iconColor: chore.iconColor,
    bgColor: chore.bgColor,
    intervalDays: chore.intervalDays,
    dailyTargetCount: chore.dailyTargetCount,
    archived: chore.archived,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    lastPerformedAt: lastPerformedAt ? lastPerformedAt.toISOString() : null,
    lastPerformerName: isSkipped ? "スキップ" : (latest?.user.name ?? null),
    lastPerformerId: latest?.user.id ?? null,
    lastRecordId: latest?.id ?? null,
    lastRecordIsInitial: isInitial,
    lastRecordSkipped: isSkipped,
    dueAt: dueAt ? dueAt.toISOString() : null,
    isDueToday,
    isDueTomorrow,
    isOverdue,
    overdueDays,
    daysSinceLast,
  };
}

export function splitChoresForHome(chores: ChoreWithComputed[], now = new Date()) {
  return splitChoresForHomeByProgress(chores, {}, now);
}

export function splitChoresForHomeByProgress(
  chores: ChoreWithComputed[],
  homeProgressByDate: Record<string, Record<string, Pick<HomeProgressEntry, "completed" | "pending" | "skipped">>>,
  now = new Date(),
) {
  const { today: todayDateKey, tomorrow: tomorrowDateKey } = buildHomeDateKeys(now);
  const todayProgressByChore = homeProgressByDate[todayDateKey] ?? {};
  const tomorrowProgressByChore = homeProgressByDate[tomorrowDateKey] ?? {};
  const hasAnyOccurrence = (
    progressByChore: Record<string, Pick<HomeProgressEntry, "completed" | "pending" | "skipped">>,
    choreId: string,
  ) => {
    const entry = progressByChore[choreId];
    if (!entry) return false;
    return (entry.pending ?? 0) > 0 || (entry.completed ?? 0) > 0 || (entry.skipped ?? 0) > 0;
  };

  // Per-chore check: if the chore has an entry in homeProgressByDate (either a real
  // occurrence or a sentinel added for occurrence-system chores), use hasAnyOccurrence.
  // Otherwise fall back to recurrence-based fields (isDueToday/isOverdue/isDueTomorrow).
  // This prevents occurrence-system chores from appearing via recurrence on days where
  // they have no actual ChoreOccurrence scheduled.
  const todayChores = chores.filter((c) => {
    if (c.id in todayProgressByChore) return hasAnyOccurrence(todayProgressByChore, c.id);
    return c.isDueToday || c.isOverdue;
  });
  const tomorrowChores = chores.filter((c) => {
    if (c.id in tomorrowProgressByChore) return hasAnyOccurrence(tomorrowProgressByChore, c.id);
    return c.isDueTomorrow;
  });
  return { todayChores, tomorrowChores };
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
