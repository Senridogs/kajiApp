import { addDays, parseDateKey, toJstDateKey } from "@/lib/time";
import { buildOccurrenceReadModelByDate } from "@/lib/occurrence-read-model";
import type { OccurrenceSourceRecord } from "@/lib/occurrence-read-model";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CALENDAR_GRID_DAYS = 42; // 6 weeks

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

/**
 * Returns the 42 date keys (6 weeks × 7 days) for the calendar grid of the
 * given month, starting from the Monday of the week that contains the 1st.
 * This includes overflow days from the previous and next months that are
 * visible in the calendar grid.
 */
export function calendarGridDateKeys(month: string): string[] {
  const monthInfo = parseMonthKey(month);
  if (!monthInfo) return [];
  const firstOfMonth = parseDateKey(`${monthInfo.month}-01`);
  if (!firstOfMonth) return monthDateKeys(monthInfo);
  const jstDay = new Date(firstOfMonth.getTime() + JST_OFFSET_MS).getUTCDay();
  const diff = jstDay === 0 ? -6 : 1 - jstDay;
  const gridStart = addDays(firstOfMonth, diff);
  return Array.from({ length: CALENDAR_GRID_DAYS }, (_, index) =>
    toJstDateKey(addDays(gridStart, index)),
  );
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
  records: OccurrenceSourceRecord[] = [],
) {
  const monthInfo = parseMonthKey(month);
  if (!monthInfo) {
    throw new Error(`Invalid month key: ${month}`);
  }
  const dateKeys = calendarGridDateKeys(month);
  return buildOccurrenceReadModelByDate({
    dateKeys,
    chores: chores.map((chore) => ({
      id: chore.id,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      dueAt: addDays(chore.latestRecord?.performedAt ?? chore.createdAt, chore.intervalDays),
      scheduleOverrides: chore.scheduleOverrides,
    })),
    records,
  });
}
