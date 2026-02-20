import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeRowsByDate,
  countDoneHomeOccurrences,
  countTotalHomeOccurrences,
} from "../../src/lib/home-occurrence.js";
import type { ChoreScheduleOverride, ChoreWithComputed } from "../../src/lib/types.js";

function makeChore(overrides: Partial<ChoreWithComputed> = {}): ChoreWithComputed {
  return {
    id: overrides.id ?? "chore-1",
    title: overrides.title ?? "食器洗い",
    icon: overrides.icon ?? "sparkles",
    iconColor: overrides.iconColor ?? "#202124",
    bgColor: overrides.bgColor ?? "#EAF5FF",
    intervalDays: overrides.intervalDays ?? 1,
    dailyTargetCount: overrides.dailyTargetCount ?? 1,
    isBigTask: overrides.isBigTask ?? false,
    archived: overrides.archived ?? false,
    defaultAssigneeId: overrides.defaultAssigneeId ?? null,
    defaultAssigneeName: overrides.defaultAssigneeName ?? null,
    lastPerformedAt: overrides.lastPerformedAt ?? null,
    lastPerformerName: overrides.lastPerformerName ?? null,
    lastPerformerId: overrides.lastPerformerId ?? null,
    lastRecordId: overrides.lastRecordId ?? null,
    lastRecordIsInitial: overrides.lastRecordIsInitial ?? false,
    lastRecordSkipped: overrides.lastRecordSkipped ?? false,
    dueAt: overrides.dueAt ?? "2026-02-20T00:00:00.000Z",
    isDueToday: overrides.isDueToday ?? true,
    isDueTomorrow: overrides.isDueTomorrow ?? false,
    isOverdue: overrides.isOverdue ?? false,
    overdueDays: overrides.overdueDays ?? 0,
    daysSinceLast: overrides.daysSinceLast ?? 0,
    doneToday: overrides.doneToday ?? false,
  };
}

test("buildHomeRowsByDate keeps row pending while some occurrences remain", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({ id: "a" });
  const rows = buildHomeRowsByDate({
    chores: [chore],
    dateKey,
    scheduleOverridesByChore: new Map<string, ChoreScheduleOverride[]>(),
    homeProgressByDate: {
      [dateKey]: {
        a: {
          total: 5,
          completed: 2,
          skipped: 1,
          pending: 2,
          latestState: "done",
        },
      },
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "pending");
  assert.equal(rows[0].total, 5);
  assert.equal(rows[0].completed, 2);
  assert.equal(rows[0].skipped, 1);
  assert.equal(rows[0].pending, 2);
  assert.equal(rows[0].chore.doneToday, false);
  assert.equal(countDoneHomeOccurrences(rows), 3);
  assert.equal(countTotalHomeOccurrences(rows), 5);
});

test("buildHomeRowsByDate prioritizes done when done/skip mixed and pending=0", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({ id: "a" });
  const rows = buildHomeRowsByDate({
    chores: [chore],
    dateKey,
    scheduleOverridesByChore: new Map<string, ChoreScheduleOverride[]>(),
    homeProgressByDate: {
      [dateKey]: {
        a: {
          total: 3,
          completed: 1,
          skipped: 2,
          pending: 0,
          latestState: "skipped",
        },
      },
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "done");
  assert.equal(rows[0].chore.doneToday, true);
  assert.equal(rows[0].chore.lastRecordSkipped, false);
});

test("fallback recurrence uses dailyTargetCount occurrences", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({
    id: "c",
    dueAt: "2026-02-20T00:00:00.000Z",
    intervalDays: 2,
    dailyTargetCount: 3,
    doneToday: false,
    lastPerformedAt: null,
    lastRecordId: null,
  });

  const rows = buildHomeRowsByDate({
    chores: [chore],
    dateKey,
    scheduleOverridesByChore: new Map(),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "pending");
  assert.equal(rows[0].total, 3);
  assert.equal(rows[0].pending, 3);
});
