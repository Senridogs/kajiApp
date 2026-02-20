import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function monthDates(monthInfo: MonthInfo): Array<{ dateKey: string; date: Date }> {
  return monthDateKeys(monthInfo).map((dateKey) => ({
    dateKey,
    date: startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`)),
  }));
}

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

export function isValidMonthKey(month: string): boolean {
  return parseMonthKey(month) !== null;
}

export function buildCalendarMonthCountsByDate(
  month: string,
  chores: CalendarSummaryChoreSource[],
): Record<string, number> {
  const monthInfo = parseMonthKey(month);
  if (!monthInfo) {
    throw new Error(`Invalid month key: ${month}`);
  }

  const dateEntries = monthDates(monthInfo);
  const countsByDate = Object.fromEntries(
    dateEntries.map((entry) => [entry.dateKey, 0]),
  ) as Record<string, number>;

  for (const chore of chores) {
    const countByDateForChore = new Map<string, number>();
    const addCount = (dateKey: string) => {
      if (!(dateKey in countsByDate)) return;
      countByDateForChore.set(dateKey, (countByDateForChore.get(dateKey) ?? 0) + 1);
    };

    if (chore.latestRecord && !chore.latestRecord.isSkipped) {
      const performedDateKey = toJstDateKey(startOfJstDay(chore.latestRecord.performedAt));
      addCount(performedDateKey);
    }

    const overrideKeys = chore.scheduleOverrides
      .map((override) => override.date)
      .filter((dateKey) => dateKey in countsByDate);

    if (overrideKeys.length > 0) {
      overrideKeys.forEach((dateKey) => addCount(dateKey));
    } else {
      const dueBase = chore.latestRecord?.performedAt ?? chore.createdAt;
      const dueAt = addDays(dueBase, chore.intervalDays);
      const occurrenceCount = Math.max(1, Math.trunc(chore.dailyTargetCount ?? 1));
      for (const entry of dateEntries) {
        if (isScheduledOnDate(dueAt, chore.intervalDays, entry.date)) {
          for (let i = 0; i < occurrenceCount; i += 1) {
            addCount(entry.dateKey);
          }
        }
      }
    }

    countByDateForChore.forEach((count, dateKey) => {
      countsByDate[dateKey] += count;
    });
  }

  return countsByDate;
}
