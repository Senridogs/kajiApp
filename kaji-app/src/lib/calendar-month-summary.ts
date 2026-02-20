import { addDays, toJstDateKey } from "@/lib/time";
import { buildOccurrenceReadModelByDate } from "@/lib/occurrence-read-model";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export type CalendarSummaryChoreSource = {
  id: string;
  intervalDays: number;
  dailyTargetCount?: number;
  createdAt: Date;
  latestRecord: { performedAt: Date; isSkipped: boolean } | null;
  scheduleOverrides: Array<{ date: string }>;
};

type MonthInfo = {
  month: string;
  daysInMonth: number;
};

function parseMonthKey(month: string): MonthInfo | null {
  if (!MONTH_KEY_RE.test(month)) return null;
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  if (!Number.isInteger(yearRaw) || !Number.isInteger(monthRaw)) return null;
  if (monthRaw < 1 || monthRaw > 12) return null;

  const daysInMonth = new Date(Date.UTC(yearRaw, monthRaw, 0)).getUTCDate();
  return {
    month,
    daysInMonth,
  };
}

function monthDateKeys(monthInfo: MonthInfo): string[] {
  return Array.from({ length: monthInfo.daysInMonth }, (_, idx) => {
    const day = String(idx + 1).padStart(2, "0");
    return `${monthInfo.month}-${day}`;
  });
}

export function isValidMonthKey(month: string): boolean {
  return parseMonthKey(month) !== null;
}

export function buildCalendarMonthCountsByDate(
  month: string,
  chores: CalendarSummaryChoreSource[],
): Record<string, number> {
  const readModel = buildCalendarMonthReadModelByDate(month, chores);
  return Object.fromEntries(
    Object.entries(readModel).map(([dateKey, byChore]) => {
      const total = Object.values(byChore).reduce((sum, entry) => sum + entry.scheduled, 0);
      return [dateKey, total];
    }),
  );
}

export function buildCalendarMonthReadModelByDate(
  month: string,
  chores: CalendarSummaryChoreSource[],
) {
  const monthInfo = parseMonthKey(month);
  if (!monthInfo) {
    throw new Error(`Invalid month key: ${month}`);
  }
  const dateKeys = monthDateKeys(monthInfo);
  const readModel = buildOccurrenceReadModelByDate({
    dateKeys,
    chores: chores.map((chore) => ({
      id: chore.id,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      dueAt: addDays(chore.latestRecord?.performedAt ?? chore.createdAt, chore.intervalDays),
      scheduleOverrides: chore.scheduleOverrides,
    })),
    records: [],
  });

  for (const chore of chores) {
    if (!chore.latestRecord || chore.latestRecord.isSkipped) continue;
    const dateKey = toJstDateKey(chore.latestRecord.performedAt);
    if (!(dateKey in readModel)) continue;
    const current = readModel[dateKey][chore.id] ?? { scheduled: 0, completed: 0, skipped: 0, pending: 0 };
    current.scheduled += 1;
    readModel[dateKey][chore.id] = current;
  }

  return readModel;
}
