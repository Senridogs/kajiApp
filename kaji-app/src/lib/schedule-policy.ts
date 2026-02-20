import { addDays, parseDateKey, startOfJstDay, toJstDateKey } from "@/lib/time";

const FUTURE_WINDOW_DAYS = 730;
const PAST_WINDOW_DAYS = 45;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type WindowRange = {
  fromDateKey: string;
  toDateKey: string;
};

export function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dateKeyToJstDate(dateKey: string) {
  return parseDateKey(dateKey) ?? new Date(Number.NaN);
}

export function uniqueSortedDateKeys(dateKeys: string[]) {
  return [...new Set(dateKeys)].sort((a, b) => a.localeCompare(b));
}

export function sortedDateKeys(dateKeys: string[]) {
  return [...dateKeys].sort((a, b) => a.localeCompare(b));
}

export function resolveScheduleWindow(sourceDateKey: string, targetDateKey: string): WindowRange {
  const nowStart = startOfJstDay(new Date());
  const fallbackFrom = toJstDateKey(addDays(nowStart, -PAST_WINDOW_DAYS));
  const fromDateKey = sourceDateKey < fallbackFrom ? sourceDateKey : fallbackFrom;
  const maxDateKey = sourceDateKey > targetDateKey ? sourceDateKey : targetDateKey;
  const toDateKey = toJstDateKey(addDays(dateKeyToJstDate(maxDateKey), FUTURE_WINDOW_DAYS));
  return { fromDateKey, toDateKey };
}

// occurrence テーブルが運用状態の正となるため、このモジュールは
// 「理論上の定期発生を生成する」責務だけを持つ。
export function buildRecurrenceDateKeys(params: {
  dueDateKey: string;
  intervalDays: number;
  dailyTargetCount?: number;
  fromDateKey: string;
  toDateKey: string;
}) {
  const { dueDateKey, intervalDays, fromDateKey, toDateKey } = params;
  const dailyTargetCount = Math.max(1, Math.trunc(params.dailyTargetCount ?? 1));
  const dueDate = dateKeyToJstDate(dueDateKey);
  const fromDate = dateKeyToJstDate(fromDateKey);
  const toDate = dateKeyToJstDate(toDateKey);
  if (
    Number.isNaN(dueDate.getTime()) ||
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime())
  ) {
    return [];
  }
  if (intervalDays <= 0) return [];

  let cursor = dueDate;
  if (cursor.getTime() < fromDate.getTime()) {
    const diffDays = Math.floor((fromDate.getTime() - cursor.getTime()) / DAY_IN_MS);
    const jumpCount = Math.floor(diffDays / intervalDays);
    cursor = addDays(cursor, jumpCount * intervalDays);
    while (cursor.getTime() < fromDate.getTime()) {
      cursor = addDays(cursor, intervalDays);
    }
  }

  const results: string[] = [];
  while (cursor.getTime() <= toDate.getTime()) {
    const dateKey = toJstDateKey(cursor);
    for (let i = 0; i < dailyTargetCount; i += 1) {
      results.push(dateKey);
    }
    cursor = addDays(cursor, intervalDays);
  }
  return results;
}
