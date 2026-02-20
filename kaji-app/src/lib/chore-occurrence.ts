import { Prisma } from "@prisma/client";

import { buildRecurrenceDateKeys, sortedDateKeys, type WindowRange } from "@/lib/schedule-policy";

export const OCCURRENCE_STATUS_PENDING = "pending" as const;
export const OCCURRENCE_STATUS_CONSUMED = "consumed" as const;

export const OCCURRENCE_SOURCE_GENERATOR = "generator" as const;
export const OCCURRENCE_SOURCE_OVERRIDE = "override" as const;

export type TxClient = Prisma.TransactionClient;

type ScheduleInput = {
  choreId: string;
  dueDateKey: string;
  intervalDays: number;
  dailyTargetCount: number;
  window: WindowRange;
};

export async function ensureOccurrenceBackfill(tx: TxClient, choreId: string) {
  const hasOccurrence = await tx.choreOccurrence.findFirst({
    where: { choreId },
    select: { id: true },
  });
  if (hasOccurrence) return;

  const overrides = await tx.choreScheduleOverride.findMany({
    where: { choreId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { date: true },
  });
  if (overrides.length === 0) return;

  await tx.choreOccurrence.createMany({
    data: overrides.map((override) => ({
      choreId,
      dateKey: override.date,
      status: OCCURRENCE_STATUS_PENDING,
      sourceType: OCCURRENCE_SOURCE_OVERRIDE,
    })),
  });
}

export async function loadCurrentScheduledDateKeys(tx: TxClient, input: ScheduleInput) {
  const occurrences = await tx.choreOccurrence.findMany({
    where: {
      choreId: input.choreId,
      status: OCCURRENCE_STATUS_PENDING,
      dateKey: { gte: input.window.fromDateKey, lte: input.window.toDateKey },
    },
    orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
    select: { dateKey: true },
  });
  if (occurrences.length > 0) {
    return occurrences.map((entry) => entry.dateKey);
  }

  const overrides = await tx.choreScheduleOverride.findMany({
    where: { choreId: input.choreId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { date: true },
  });
  if (overrides.length > 0) {
    return sortedDateKeys(
      overrides
        .map((entry) => entry.date)
        .filter((dateKey) => dateKey >= input.window.fromDateKey && dateKey <= input.window.toDateKey),
    );
  }

  return buildRecurrenceDateKeys({
    dueDateKey: input.dueDateKey,
    intervalDays: input.intervalDays,
    dailyTargetCount: input.dailyTargetCount,
    fromDateKey: input.window.fromDateKey,
    toDateKey: input.window.toDateKey,
  });
}

export async function consumePendingOccurrences(
  tx: TxClient,
  choreId: string,
  dateKey: string,
  count: number,
) {
  const targets = await tx.choreOccurrence.findMany({
    where: { choreId, dateKey, status: OCCURRENCE_STATUS_PENDING },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: count,
    select: { id: true },
  });
  if (targets.length === 0) return 0;

  await tx.choreOccurrence.updateMany({
    where: { id: { in: targets.map((target) => target.id) } },
    data: { status: OCCURRENCE_STATUS_CONSUMED },
  });
  return targets.length;
}
