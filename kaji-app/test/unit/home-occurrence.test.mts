import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeProgressByDate,
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

test("buildHomeRowsByDate keeps fallback behind feature flag", () => {
  const original = process.env.NEXT_PUBLIC_ENABLE_HOME_PROGRESS_LAST_PERFORMED_FALLBACK;
  process.env.NEXT_PUBLIC_ENABLE_HOME_PROGRESS_LAST_PERFORMED_FALLBACK = "true";
  try {
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
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_HOME_PROGRESS_LAST_PERFORMED_FALLBACK;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_HOME_PROGRESS_LAST_PERFORMED_FALLBACK = original;
    }
  }
});

test("buildHomeProgressByDate keeps total fixed when duplicate pending is consumed", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({
    id: "dup",
    dueAt: "2026-02-20T00:00:00.000Z",
    intervalDays: 1,
    dailyTargetCount: 4,
  });

  const progressAfterFirstDone = buildHomeProgressByDate({
    chores: [chore],
    dateKeys: [dateKey],
    scheduleOverridesByChore: new Map<string, ChoreScheduleOverride[]>([
      [
        "dup",
        Array.from({ length: 3 }, (_, idx) => ({
          id: `ov-${idx}`,
          choreId: "dup",
          date: dateKey,
          createdAt: "2026-02-20T00:00:00.000Z",
        })),
      ],
    ]),
    records: [
      {
        choreId: "dup",
        scheduledDate: dateKey,
        performedAt: "2026-02-20T01:00:00.000Z",
        isSkipped: false,
      },
    ],
  });
  assert.deepEqual(progressAfterFirstDone[dateKey]?.dup, {
    total: 4,
    completed: 1,
    skipped: 0,
    pending: 3,
    latestState: "pending",
  });

  const progressAfterSecondDone = buildHomeProgressByDate({
    chores: [chore],
    dateKeys: [dateKey],
    scheduleOverridesByChore: new Map<string, ChoreScheduleOverride[]>([
      [
        "dup",
        Array.from({ length: 2 }, (_, idx) => ({
          id: `ov2-${idx}`,
          choreId: "dup",
          date: dateKey,
          createdAt: "2026-02-20T00:00:00.000Z",
        })),
      ],
    ]),
    records: [
      {
        choreId: "dup",
        scheduledDate: dateKey,
        performedAt: "2026-02-20T01:00:00.000Z",
        isSkipped: false,
      },
      {
        choreId: "dup",
        scheduledDate: dateKey,
        performedAt: "2026-02-20T02:00:00.000Z",
        isSkipped: false,
      },
    ],
  });
  assert.deepEqual(progressAfterSecondDone[dateKey]?.dup, {
    total: 4,
    completed: 2,
    skipped: 0,
    pending: 2,
    latestState: "pending",
  });
});

test("buildHomeProgressByDate keeps denominator fixed for mixed done/skip", () => {
  const dateKey = "2026-02-21";
  const chore = makeChore({
    id: "mix",
    dueAt: "2026-02-21T00:00:00.000Z",
    intervalDays: 1,
    dailyTargetCount: 4,
  });

  const progress = buildHomeProgressByDate({
    chores: [chore],
    dateKeys: [dateKey],
    scheduleOverridesByChore: new Map<string, ChoreScheduleOverride[]>([
      [
        "mix",
        Array.from({ length: 2 }, (_, idx) => ({
          id: `ovm-${idx}`,
          choreId: "mix",
          date: dateKey,
          createdAt: "2026-02-21T00:00:00.000Z",
        })),
      ],
    ]),
    records: [
      {
        choreId: "mix",
        scheduledDate: dateKey,
        performedAt: "2026-02-21T01:00:00.000Z",
        isSkipped: false,
      },
      {
        choreId: "mix",
        scheduledDate: dateKey,
        performedAt: "2026-02-21T02:00:00.000Z",
        isSkipped: true,
      },
    ],
  });

  assert.deepEqual(progress[dateKey]?.mix, {
    total: 4,
    completed: 1,
    skipped: 1,
    pending: 2,
    latestState: "pending",
  });
});


import {
  OCCURRENCE_TEST_DATE_KEYS,
  homeFixtureChores,
  homeFixtureOverrides,
} from "./fixtures/occurrence-consistency.fixture.mts";

test("shared fixture count matches calendar summary expectations", () => {
  const progress = buildHomeProgressByDate({
    chores: homeFixtureChores,
    dateKeys: OCCURRENCE_TEST_DATE_KEYS,
    scheduleOverridesByChore: homeFixtureOverrides,
    records: [],
  });

  const picked = Object.fromEntries(
    OCCURRENCE_TEST_DATE_KEYS.map((dateKey) => [
      dateKey,
      Object.values(progress[dateKey] ?? {}).reduce((sum, entry) => sum + entry.total, 0),
    ]),
  );

  assert.deepEqual(picked, {
    "2026-03-05": 1,
    "2026-03-10": 1,
    "2026-03-12": 1,
  });
test("buildHomeProgressByDate does not mix same chore completion across dates", () => {
  const yesterday = "2026-02-20";
  const today = "2026-02-21";
  const chore = makeChore({
    id: "same",
    dueAt: "2026-02-20T00:00:00.000Z",
    intervalDays: 1,
    dailyTargetCount: 1,
  });

  const progress = buildHomeProgressByDate({
    chores: [chore],
    dateKeys: [yesterday, today],
    scheduleOverridesByChore: new Map(),
    records: [
      {
        choreId: "same",
        scheduledDate: yesterday,
        performedAt: "2026-02-20T03:00:00.000Z",
        isSkipped: false,
      },
    ],
  });

  assert.equal(progress[yesterday]?.same?.completed, 1);
  assert.equal(progress[yesterday]?.same?.pending, 0);
  assert.equal(progress[today]?.same?.completed, 0);
  assert.equal(progress[today]?.same?.pending, 1);
});
