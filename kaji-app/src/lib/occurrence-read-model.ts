import { startOfJstDay, toJstDateKey } from "@/lib/time";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type OccurrenceSourceChore = {
  id: string;
  intervalDays: number;
  dailyTargetCount?: number;
  dueAt: Date | null;
  scheduleOverrides: Array<{ date: string }>;
};

export type OccurrenceSourceRecord = {
  choreId: string;
  scheduledDate: string | null;
  performedAt: Date | string;
  isSkipped: boolean;
  isInitial?: boolean | null;
};

export type OccurrenceEntry = {
  scheduled: number;
  completed: number;
  pending: number;
};

function scheduledDayOffset(dueAt: Date, targetDate: Date): number {
  const dueStart = startOfJstDay(dueAt);
  const targetStart = startOfJstDay(targetDate);
  return Math.floor((targetStart.getTime() - dueStart.getTime()) / DAY_IN_MS);
}

function isScheduledOnDate(dueAt: Date, intervalDays: number, targetDate: Date): boolean {
  const diffDays = scheduledDayOffset(dueAt, targetDate);
  if (diffDays < 0) return false;
  return diffDays % Math.max(1, intervalDays) === 0;
}

export function buildOccurrenceReadModelByDate(params: {
  dateKeys: string[];
  chores: OccurrenceSourceChore[];
  records: OccurrenceSourceRecord[];
}) {
  const { dateKeys, chores, records } = params;
  const dateKeySet = new Set(dateKeys);
  const result: Record<string, Record<string, OccurrenceEntry>> = {};

  for (const dateKey of dateKeys) {
    result[dateKey] = {};
    const targetDate = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
    if (Number.isNaN(targetDate.getTime())) continue;

    for (const chore of chores) {
      let scheduled = 0;
      const overrides = chore.scheduleOverrides;
      if (overrides.length > 0) {
        scheduled = overrides.filter((override) => override.date === dateKey).length;
      } else if (chore.dueAt && isScheduledOnDate(chore.dueAt, chore.intervalDays, targetDate)) {
        scheduled = Math.max(1, Math.trunc(chore.dailyTargetCount ?? 1));
      }

      if (scheduled > 0) {
        result[dateKey][chore.id] = {
          scheduled,
          completed: 0,
          pending: scheduled,
        };
      }
    }
  }

  for (const record of records) {
    if (record.isInitial) continue;
    const performedAt = new Date(record.performedAt);
    if (Number.isNaN(performedAt.getTime())) continue;

    const effectiveDateKey = record.scheduledDate ?? toJstDateKey(startOfJstDay(performedAt));
    if (!dateKeySet.has(effectiveDateKey)) continue;

    const current =
      result[effectiveDateKey][record.choreId] ?? {
        scheduled: 0,
        completed: 0,
        pending: 0,
      };

    current.completed += 1;
    const consumed = current.completed;
    const total = Math.max(current.scheduled, consumed);
    current.pending = Math.max(0, total - consumed);
    result[effectiveDateKey][record.choreId] = {
      scheduled: total,
      completed: current.completed,
      pending: current.pending,
    };
  }

  return result;
}
