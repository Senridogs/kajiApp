import { startOfJstDay, toJstDateKey } from "@/lib/time";
import type {
  ChoreScheduleOverride,
  ChoreWithComputed,
  HomeProgressEntry,
  HomeProgressState,
} from "@/lib/types";

export type HomeRowProjection = {
  chore: ChoreWithComputed;
  state: HomeProgressState;
  total: number;
  completed: number;
  skipped: number;
  pending: number;
  latestState: HomeProgressState;
};

type ProgressMutable = HomeProgressEntry & {
  latestPerformedAtMs: number;
};

type HomeProgressRecordInput = {
  choreId: string;
  scheduledDate: string | null;
  performedAt: Date | string;
  isSkipped: boolean;
  isInitial?: boolean | null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const JA_COLLATOR = new Intl.Collator("ja");

function scheduledDayOffset(
  chore: Pick<ChoreWithComputed, "dueAt">,
  targetDate: Date,
) {
  if (!chore.dueAt) return null;
  const dueStart = startOfJstDay(new Date(chore.dueAt));
  if (Number.isNaN(dueStart.getTime())) return null;
  const targetStart = startOfJstDay(targetDate);
  return Math.floor((targetStart.getTime() - dueStart.getTime()) / DAY_IN_MS);
}

function isScheduledOnDate(
  chore: Pick<ChoreWithComputed, "dueAt" | "intervalDays">,
  targetDate: Date,
) {
  const diffDays = scheduledDayOffset(chore, targetDate);
  if (diffDays === null || diffDays < 0) return false;
  return diffDays % Math.max(1, chore.intervalDays) === 0;
}

function scheduledOccurrencesOnDate(params: {
  chore: ChoreWithComputed;
  dateKey: string;
  scheduleOverridesByChore: Map<string, ChoreScheduleOverride[]>;
}) {
  const { chore, dateKey, scheduleOverridesByChore } = params;
  const overrideList = scheduleOverridesByChore.get(chore.id) ?? [];
  if (overrideList.length > 0) {
    return overrideList.filter((override) => override.date === dateKey).length;
  }
  const targetDate = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
  if (Number.isNaN(targetDate.getTime())) return 0;
  return isScheduledOnDate(chore, targetDate) ? Math.max(1, chore.dailyTargetCount ?? 1) : 0;
}

function sanitizeEntry(entry: HomeProgressEntry): HomeProgressEntry {
  const total = Math.max(0, Math.trunc(entry.total));
  const completed = Math.max(0, Math.trunc(entry.completed));
  const skipped = Math.max(0, Math.trunc(entry.skipped));
  const consumed = completed + skipped;
  const normalizedTotal = Math.max(total, consumed);
  const pending = Math.max(0, normalizedTotal - consumed);
  const latestState: HomeProgressState =
    pending > 0
      ? "pending"
      : completed > 0
        ? "done"
        : skipped > 0
          ? "skipped"
          : entry.latestState;
  return {
    total: normalizedTotal,
    completed,
    skipped,
    pending,
    latestState,
  };
}

function toDisplayChore(chore: ChoreWithComputed, state: HomeProgressState): ChoreWithComputed {
  if (state === "pending") {
    return {
      ...chore,
      doneToday: false,
      lastRecordSkipped: false,
    };
  }
  if (state === "skipped") {
    return {
      ...chore,
      doneToday: true,
      lastRecordSkipped: true,
    };
  }
  return {
    ...chore,
    doneToday: true,
    lastRecordSkipped: false,
  };
}

function sortRows(rows: HomeRowProjection[]) {
  rows.sort((a, b) => {
    const titleDiff = JA_COLLATOR.compare(a.chore.title, b.chore.title);
    if (titleDiff !== 0) return titleDiff;
    return JA_COLLATOR.compare(a.chore.id, b.chore.id);
  });
  return rows;
}

export function buildHomeProgressByDate(params: {
  chores: ChoreWithComputed[];
  dateKeys: string[];
  scheduleOverridesByChore: Map<string, ChoreScheduleOverride[]>;
  records: HomeProgressRecordInput[];
}) {
  const { chores, dateKeys, scheduleOverridesByChore, records } = params;
  const dateKeySet = new Set(dateKeys);
  const progressByDate = new Map<string, Map<string, ProgressMutable>>();

  for (const dateKey of dateKeys) {
    const byChore = new Map<string, ProgressMutable>();
    for (const chore of chores) {
      const total = scheduledOccurrencesOnDate({ chore, dateKey, scheduleOverridesByChore });
      if (total <= 0) continue;
      byChore.set(chore.id, {
        total,
        completed: 0,
        skipped: 0,
        pending: total,
        latestState: "pending",
        latestPerformedAtMs: Number.NEGATIVE_INFINITY,
      });
    }
    progressByDate.set(dateKey, byChore);
  }

  for (const record of records) {
    if (record.isInitial) continue;
    const performedAt = new Date(record.performedAt);
    if (Number.isNaN(performedAt.getTime())) continue;

    const effectiveDateKey =
      record.scheduledDate ?? toJstDateKey(startOfJstDay(performedAt));
    if (!dateKeySet.has(effectiveDateKey)) continue;

    const byChore = progressByDate.get(effectiveDateKey);
    if (!byChore) continue;

    const existing = byChore.get(record.choreId);
    const nextEntry: ProgressMutable =
      existing ?? {
        total: 0,
        completed: 0,
        skipped: 0,
        pending: 0,
        latestState: "pending",
        latestPerformedAtMs: Number.NEGATIVE_INFINITY,
      };
    if (record.isSkipped) {
      nextEntry.skipped += 1;
    } else {
      nextEntry.completed += 1;
    }
    const performedAtMs = performedAt.getTime();
    if (performedAtMs >= nextEntry.latestPerformedAtMs) {
      nextEntry.latestPerformedAtMs = performedAtMs;
      nextEntry.latestState = record.isSkipped ? "skipped" : "done";
    }
    byChore.set(record.choreId, nextEntry);
  }

  const result: Record<string, Record<string, HomeProgressEntry>> = {};
  for (const [dateKey, byChore] of progressByDate.entries()) {
    result[dateKey] = {};
    for (const [choreId, entry] of byChore.entries()) {
      const sanitized = sanitizeEntry(entry);
      if (sanitized.total <= 0 && sanitized.completed <= 0 && sanitized.skipped <= 0) {
        continue;
      }
      result[dateKey][choreId] = sanitized;
    }
  }
  return result;
}

export function buildHomeRowsByDate(params: {
  chores: ChoreWithComputed[];
  dateKey: string;
  scheduleOverridesByChore: Map<string, ChoreScheduleOverride[]>;
  homeProgressByDate?: Record<string, Record<string, HomeProgressEntry>>;
}) {
  const { chores, dateKey, scheduleOverridesByChore, homeProgressByDate } = params;
  const rows: HomeRowProjection[] = [];
  const progressByChore = homeProgressByDate?.[dateKey] ?? {};

  for (const chore of chores) {
    let entry = progressByChore[chore.id];
    if (!entry) {
      const performedDateKey =
        chore.lastPerformedAt && !chore.lastRecordIsInitial
          ? toJstDateKey(startOfJstDay(new Date(chore.lastPerformedAt)))
          : null;
      const isCompletedOnDate = performedDateKey === dateKey;
      const completed = isCompletedOnDate && !chore.lastRecordSkipped ? 1 : 0;
      const skipped = isCompletedOnDate && chore.lastRecordSkipped ? 1 : 0;
      const total = scheduledOccurrencesOnDate({
        chore,
        dateKey,
        scheduleOverridesByChore,
      });
      entry = sanitizeEntry({
        total,
        completed,
        skipped,
        pending: 0,
        latestState: isCompletedOnDate ? (chore.lastRecordSkipped ? "skipped" : "done") : "pending",
      });
    } else {
      entry = sanitizeEntry(entry);
    }

    if (entry.total <= 0 && entry.completed <= 0 && entry.skipped <= 0) {
      continue;
    }

    const state: HomeProgressState =
      entry.pending > 0 ? "pending" : entry.completed > 0 ? "done" : "skipped";
    rows.push({
      chore: toDisplayChore(chore, state),
      state,
      total: entry.total,
      completed: entry.completed,
      skipped: entry.skipped,
      pending: entry.pending,
      latestState: entry.latestState,
    });
  }

  return sortRows(rows);
}

export function countDoneHomeOccurrences(rows: HomeRowProjection[]) {
  return rows.reduce((sum, row) => sum + row.completed + row.skipped, 0);
}

export function countTotalHomeOccurrences(rows: HomeRowProjection[]) {
  return rows.reduce((sum, row) => sum + row.total, 0);
}
