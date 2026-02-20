import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeOccurrencesByDate,
  countDoneHomeOccurrences,
} from "../../src/lib/home-occurrence.js";
import type { ChoreScheduleOverride, ChoreWithComputed } from "../../src/lib/types.js";

function makeChore(overrides: Partial<ChoreWithComputed> = {}): ChoreWithComputed {
  return {
    id: overrides.id ?? "chore-1",
    title: overrides.title ?? "洗濯",
    icon: overrides.icon ?? "sparkles",
    iconColor: overrides.iconColor ?? "#202124",
    bgColor: overrides.bgColor ?? "#EAF5FF",
    intervalDays: overrides.intervalDays ?? 1,
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

test("buildHomeOccurrencesByDate keeps done+pending for duplicate schedule", () => {
  const dateKey = "2026-02-20";
  const completed = makeChore({
    id: "a",
    title: "洗濯",
    lastPerformedAt: "2026-02-20T01:00:00.000Z",
    lastPerformerName: "のぞみ",
    lastPerformerId: "u1",
    lastRecordId: "r1",
    doneToday: true,
  });
  const skipped = makeChore({
    id: "b",
    title: "ゴミ出し",
    lastPerformedAt: "2026-02-20T02:00:00.000Z",
    lastPerformerName: "スキップ",
    lastPerformerId: "u1",
    lastRecordId: "r2",
    lastRecordSkipped: true,
    doneToday: true,
  });
  const scheduleOverridesByChore = new Map<string, ChoreScheduleOverride[]>([
    [
      "a",
      [
        { id: "ov-a1", choreId: "a", date: dateKey, createdAt: "2026-02-20T00:00:00.000Z" },
        { id: "ov-a2", choreId: "a", date: dateKey, createdAt: "2026-02-20T00:00:01.000Z" },
      ],
    ],
    [
      "b",
      [{ id: "ov-b1", choreId: "b", date: dateKey, createdAt: "2026-02-20T00:00:00.000Z" }],
    ],
  ]);

  const occurrences = buildHomeOccurrencesByDate({
    chores: [completed, skipped],
    dateKey,
    scheduleOverridesByChore,
  });

  assert.equal(occurrences.length, 3);
  assert.deepEqual(
    occurrences.map((item) => ({ id: item.chore.id, state: item.state })),
    [
      { id: "b", state: "skipped" },
      { id: "a", state: "done" },
      { id: "a", state: "pending" },
    ],
  );
  assert.equal(countDoneHomeOccurrences(occurrences), 2);
});

test("pending occurrence clone resets done/record flags", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({
    id: "a",
    title: "食器洗い",
    lastPerformedAt: "2026-02-20T05:00:00.000Z",
    lastPerformerName: "せんり",
    lastPerformerId: "u1",
    lastRecordId: "record-a",
    doneToday: true,
  });
  const scheduleOverridesByChore = new Map<string, ChoreScheduleOverride[]>([
    [
      "a",
      [
        { id: "ov-a1", choreId: "a", date: dateKey, createdAt: "2026-02-20T00:00:00.000Z" },
        { id: "ov-a2", choreId: "a", date: dateKey, createdAt: "2026-02-20T00:00:01.000Z" },
      ],
    ],
  ]);

  const occurrences = buildHomeOccurrencesByDate({
    chores: [chore],
    dateKey,
    scheduleOverridesByChore,
  });
  const pending = occurrences.find((item) => item.state === "pending");

  assert.ok(pending);
  assert.equal(pending!.chore.doneToday, false);
  assert.equal(pending!.chore.lastPerformedAt, null);
  assert.equal(pending!.chore.lastRecordId, null);
  assert.equal(pending!.chore.lastRecordSkipped, false);
});

test("when no overrides, recurrence contributes one pending occurrence", () => {
  const dateKey = "2026-02-20";
  const chore = makeChore({
    id: "c",
    title: "床掃除",
    dueAt: "2026-02-20T00:00:00.000Z",
    intervalDays: 2,
    doneToday: false,
    lastPerformedAt: null,
    lastRecordId: null,
  });

  const occurrences = buildHomeOccurrencesByDate({
    chores: [chore],
    dateKey,
    scheduleOverridesByChore: new Map(),
  });

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].state, "pending");
  assert.equal(occurrences[0].chore.id, "c");
});
