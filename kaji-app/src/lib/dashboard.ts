import { Chore, ChoreRecord, User } from "@prisma/client";

import { addDays, diffDaysFloor, startOfJstDay } from "@/lib/time";
import { ChoreWithComputed, StatsPeriodKey } from "@/lib/types";

type ChoreWithLatest = Chore & {
  records: (ChoreRecord & { user: Pick<User, "id" | "name"> })[];
};

export function computeChore(chore: ChoreWithLatest, now = new Date()): ChoreWithComputed {
  const latest = chore.records[0];
  const lastPerformedAt = latest?.performedAt ?? null;
  const dueBase = lastPerformedAt ?? chore.createdAt;
  const dueAt = addDays(dueBase, chore.intervalDays);
  const todayStart = startOfJstDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrow = addDays(todayStart, 2);

  const isDueToday = !!dueAt && dueAt >= todayStart && dueAt < tomorrowStart;
  const isDueTomorrow = !!dueAt && dueAt >= tomorrowStart && dueAt < dayAfterTomorrow;
  const isOverdue = !!dueAt && dueAt < todayStart;
  const overdueDays = isOverdue && dueAt ? diffDaysFloor(dueAt, todayStart) : 0;
  const daysSinceLast = lastPerformedAt ? diffDaysFloor(lastPerformedAt, now) : null;
  const doneToday = !!latest && latest.performedAt >= todayStart;

  return {
    id: chore.id,
    title: chore.title,
    icon: chore.icon,
    iconColor: chore.iconColor,
    bgColor: chore.bgColor,
    intervalDays: chore.intervalDays,
    isBigTask: chore.isBigTask,
    archived: chore.archived,
    lastPerformedAt: lastPerformedAt ? lastPerformedAt.toISOString() : null,
    lastPerformerName: latest?.user.name ?? null,
    lastRecordId: latest?.id ?? null,
    dueAt: dueAt ? dueAt.toISOString() : null,
    isDueToday,
    isDueTomorrow,
    isOverdue,
    overdueDays,
    daysSinceLast,
    doneToday,
  };
}

export function splitChoresForHome(chores: ChoreWithComputed[], now = new Date()) {
  const todayStart = startOfJstDay(now);
  const nextWeek = addDays(todayStart, 7);

  const todayChores = chores.filter((c) => c.isDueToday || c.isOverdue || c.doneToday);
  const tomorrowChores = chores.filter((c) => c.isDueTomorrow);
  const upcomingBigChores = chores.filter((c) => {
    if (!c.isBigTask || !c.dueAt) return false;
    const due = new Date(c.dueAt);
    return due >= todayStart && due <= nextWeek;
  });

  return { todayChores, tomorrowChores, upcomingBigChores };
}

export function getStatsRange(
  period: StatsPeriodKey,
  now = new Date(),
  customFrom?: string,
  customTo?: string,
) {
  const end = now;

  if (period === "all") {
    return { start: undefined, end, label: "全期間" };
  }

  if (period === "custom" && customFrom && customTo) {
    const start = new Date(customFrom);
    const to = new Date(customTo);
    return { start, end: to, label: `${customFrom} - ${customTo}` };
  }

  const daysMap: Record<Exclude<StatsPeriodKey, "all" | "custom">, number> = {
    week: 7,
    month: 30,
    half: 180,
    year: 365,
  };
  const days = daysMap[period as keyof typeof daysMap] ?? 7;
  const start = addDays(end, -days);
  const labelMap: Record<Exclude<StatsPeriodKey, "custom">, string> = {
    week: "直近1週間",
    month: "直近1か月",
    half: "直近半年",
    year: "直近1年",
    all: "全期間",
  };
  return { start, end, label: labelMap[period as keyof typeof labelMap] };
}
