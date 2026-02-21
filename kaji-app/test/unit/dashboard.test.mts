import assert from "node:assert/strict";
import test from "node:test";

import { computeChore, getStatsRange, splitChoresForHome, splitChoresForHomeByProgress } from "../../src/lib/dashboard.js";

test("computeChore marks due today flags correctly", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const performedAt = new Date("2026-02-14T15:30:00.000Z"); // JST: 02/15 00:30

  const chore = {
    id: "chore-1",
    title: "食器洗い",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    householdId: "h1",
    records: [
      {
        id: "r1",
        householdId: "h1",
        choreId: "chore-1",
        userId: "u1",
        memo: null,
        isInitial: false,
        isSkipped: false,
        performedAt,
        createdAt: performedAt,
        user: { id: "u1", name: "A" },
      },
    ],
  };

  const computed = computeChore(chore, now);
  assert.equal(computed.isDueToday, false);
  assert.equal(computed.isDueTomorrow, true);
  assert.equal(computed.isOverdue, false);
  assert.equal(computed.overdueDays, 0);
});

test("computeChore keeps initial record as not-done and flags lastRecordIsInitial", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const performedAt = new Date("2026-02-14T15:30:00.000Z"); // JST: 02/15 00:30

  const chore = {
    id: "chore-initial",
    title: "initial",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    householdId: "h1",
    records: [
      {
        id: "r-initial",
        householdId: "h1",
        choreId: "chore-initial",
        userId: "u1",
        memo: null,
        isInitial: true,
        isSkipped: false,
        performedAt,
        createdAt: performedAt,
        user: { id: "u1", name: "A" },
      },
    ],
  };

  const computed = computeChore(chore, now);
  assert.equal(computed.lastRecordIsInitial, true);
  assert.equal(computed.isDueToday, false);
  assert.equal(computed.isDueTomorrow, true);
});

test("computeChore marks overdue items", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const performedAt = new Date("2026-02-10T00:00:00.000Z");

  const chore = {
    id: "chore-2",
    title: "換気扇掁E��",
    icon: "wind",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 2,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    householdId: "h1",
    records: [
      {
        id: "r2",
        householdId: "h1",
        choreId: "chore-2",
        userId: "u1",
        memo: null,
        isInitial: false,
        isSkipped: false,
        performedAt,
        createdAt: performedAt,
        user: { id: "u1", name: "A" },
      },
    ],
  };

  const computed = computeChore(chore, now);
  assert.equal(computed.isOverdue, true);
  assert.ok(computed.overdueDays > 0);
});

test("computeChore ignores future completion records and treats them as pending", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const futurePerformedAt = new Date("2026-02-16T01:00:00.000Z"); // JST: 02/16 10:00

  const chore = {
    id: "chore-future",
    title: "future",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    createdAt: new Date("2026-02-14T00:00:00.000Z"),
    updatedAt: new Date("2026-02-14T00:00:00.000Z"),
    householdId: "h1",
    records: [
      {
        id: "r-future",
        householdId: "h1",
        choreId: "chore-future",
        userId: "u1",
        memo: null,
        isInitial: false,
        isSkipped: false,
        performedAt: futurePerformedAt,
        createdAt: futurePerformedAt,
        user: { id: "u1", name: "A" },
      },
    ],
  };

  const computed = computeChore(chore, now);
  assert.equal(computed.lastPerformedAt, null);
  assert.equal(computed.lastRecordId, null);
  assert.equal(computed.isDueToday, true);
  assert.equal(computed.isOverdue, false);
});

test("splitChoresForHome returns today/tomorrow and drops big section grouping", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const chores = [
    {
      id: "today",
      title: "today",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 1,
      dailyTargetCount: 1,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastPerformerId: null,
      lastRecordId: null,
      lastRecordIsInitial: false,
      lastRecordSkipped: false,
      dueAt: "2026-02-15T15:00:00.000Z",
      isDueToday: true,
      isDueTomorrow: false,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      },
    {
      id: "tomorrow",
      title: "tomorrow",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 1,
      dailyTargetCount: 1,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastPerformerId: null,
      lastRecordId: null,
      lastRecordIsInitial: false,
      lastRecordSkipped: false,
      dueAt: "2026-02-16T15:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: true,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      },
  ];

  const split = splitChoresForHome(chores, now);
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "tomorrow");
});

test("splitChoresForHome no longer uses completion fallback without progress", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const dueTomorrowChore = {
    id: "done",
    title: "done",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastPerformerId: "u1",
    lastRecordId: "r",
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-02-15T15:30:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
  };

  const split = splitChoresForHome([dueTomorrowChore], now);
  assert.equal(split.todayChores.length, 0);
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "done");
});

test("splitChoresForHomeByProgress keeps completed daily chore in both today and tomorrow", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const dueTomorrowChore = {
    id: "done",
    title: "done",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastPerformerId: "u1",
    lastRecordId: "r",
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-02-15T15:30:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
  };

  const split = splitChoresForHomeByProgress(
    [dueTomorrowChore],
    {
      "2026-02-15": {
        done: { completed: 1, pending: 0, skipped: 0 },
      },
    },
    now,
  );
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.todayChores[0]?.id, "done");
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "done");
});

test("splitChoresForHomeByProgress uses tomorrow progress as source of truth", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const dueTomorrowChore = {
    id: "done",
    title: "done",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastPerformerId: "u1",
    lastRecordId: "r",
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-02-15T15:30:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
  };
  const anotherDueTomorrowChore = { ...dueTomorrowChore, id: "other", title: "other" };

  const split = splitChoresForHomeByProgress(
    [dueTomorrowChore, anotherDueTomorrowChore],
    {
      "2026-02-16": {
        done: { completed: 0, pending: 1, skipped: 0 },
      },
    },
    now,
  );
  assert.equal(split.todayChores.length, 0);
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "done");
});

test("splitChoresForHomeByProgress keeps pending future-due chore visible in today", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const pendingTodayAndDueTomorrow = {
    id: "pending",
    title: "pending",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastPerformerId: "u1",
    lastRecordId: "r",
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-02-15T15:30:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
    doneToday: false,
  };

  const split = splitChoresForHomeByProgress(
    [pendingTodayAndDueTomorrow],
    {
      "2026-02-15": {
        pending: { completed: 0, pending: 1, skipped: 0 },
      },
    },
    now,
  );

  assert.equal(split.todayChores.length, 1);
  assert.equal(split.todayChores[0]?.id, "pending");
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "pending");
});
test("getStatsRange validates custom range and returns end-of-day", () => {
  const now = new Date("2026-02-15T00:00:00.000Z");
  assert.equal(getStatsRange("custom", now), null);
  assert.equal(getStatsRange("custom", now, "bad", "2026-02-10"), null);
  assert.equal(getStatsRange("custom", now, "2026-02-20", "2026-02-10"), null);

  const valid = getStatsRange("custom", now, "2026-02-01", "2026-02-10");
  assert.ok(valid);
  assert.equal(valid?.start?.toISOString(), "2026-01-31T15:00:00.000Z");
  assert.equal(valid?.end.toISOString(), "2026-02-10T14:59:59.999Z");
});


