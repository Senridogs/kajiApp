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

function removeOneOccurrence(dateKeys: string[], targetDateKey: string) {
  const next = [...dateKeys];
  const index = next.findIndex((dateKey) => dateKey === targetDateKey);
  if (index >= 0) {
    next.splice(index, 1);
  }
  return next;
}

function mergeTargetDateKey(dateKeys: string[], targetDateKey: string) {
  let seenTarget = false;
  const merged: string[] = [];
  for (const dateKey of dateKeys) {
    if (dateKey !== targetDateKey) {
      merged.push(dateKey);
      continue;
    }
    if (seenTarget) continue;
    seenTarget = true;
    merged.push(dateKey);
  }
  return merged;
}

export function resolveScheduleWindow(sourceDateKey: string, targetDateKey: string): WindowRange {
  const nowStart = startOfJstDay(new Date());
  const fallbackFrom = toJstDateKey(addDays(nowStart, -PAST_WINDOW_DAYS));
  const fromDateKey = sourceDateKey < fallbackFrom ? sourceDateKey : fallbackFrom;
  const maxDateKey = sourceDateKey > targetDateKey ? sourceDateKey : targetDateKey;
  const toDateKey = toJstDateKey(addDays(dateKeyToJstDate(maxDateKey), FUTURE_WINDOW_DAYS));
  return { fromDateKey, toDateKey };
}

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

export function resolveCurrentScheduleDateKeys(params: {
  overrideDateKeys: string[];
  dueDateKey: string;
  intervalDays: number;
  dailyTargetCount?: number;
  window: WindowRange;
}) {
  const { overrideDateKeys, dueDateKey, intervalDays, window } = params;
  if (overrideDateKeys.length > 0) {
    return sortedDateKeys(
      overrideDateKeys.filter(
        (dateKey) => dateKey >= window.fromDateKey && dateKey <= window.toDateKey,
      ),
    );
  }
  return buildRecurrenceDateKeys({
    dueDateKey,
    intervalDays,
    dailyTargetCount: params.dailyTargetCount,
    fromDateKey: window.fromDateKey,
    toDateKey: window.toDateKey,
  });
}

export function rebuildScheduleDateKeys(params: {
  currentDateKeys: string[];
  sourceDateKey: string;
  targetDateKey: string;
  recalculateFuture: boolean;
  mergeIfDuplicate: boolean;
  intervalDays: number;
  dailyTargetCount?: number;
  window: WindowRange;
}) {
  const {
    currentDateKeys,
    sourceDateKey,
    targetDateKey,
    recalculateFuture,
    mergeIfDuplicate,
    intervalDays,
    dailyTargetCount,
    window,
  } = params;
  if (!recalculateFuture) {
    const moved = removeOneOccurrence(currentDateKeys, sourceDateKey);
    moved.push(targetDateKey);
    const normalized = mergeIfDuplicate
      ? mergeTargetDateKey(moved, targetDateKey)
      : moved;
    return sortedDateKeys(normalized);
  }

  const keepBefore = currentDateKeys.filter((dateKey) => dateKey < sourceDateKey);
  const toDate = dateKeyToJstDate(window.toDateKey);
  const futureDates: string[] = [];
  let cursor = dateKeyToJstDate(targetDateKey);
  if (!Number.isNaN(cursor.getTime()) && intervalDays > 0) {
    while (cursor.getTime() <= toDate.getTime()) {
      const dateKey = toJstDateKey(cursor);
      const occurrenceCount = Math.max(1, Math.trunc(dailyTargetCount ?? 1));
      for (let i = 0; i < occurrenceCount; i += 1) {
        futureDates.push(dateKey);
      }
      cursor = addDays(cursor, intervalDays);
    }
  }
  const rebuilt = [...keepBefore, ...futureDates];
  const normalized = mergeIfDuplicate
    ? mergeTargetDateKey(rebuilt, targetDateKey)
    : rebuilt;
  return sortedDateKeys(normalized);
}
