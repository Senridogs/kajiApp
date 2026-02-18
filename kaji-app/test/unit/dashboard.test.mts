import assert from "node:assert/strict";
import test from "node:test";

import { computeChore, getStatsRange, splitChoresForHome } from "../../src/lib/dashboard.js";

test("computeChore marks due today and doneToday correctly", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const performedAt = new Date("2026-02-14T15:30:00.000Z"); // JST: 02/15 00:30

  const chore = {
    id: "chore-1",
    title: "食器洗い",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    isBigTask: false,
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
        performedAt,
        createdAt: performedAt,
        user: { id: "u1", name: "A" },
      },
    ],
  };

  const computed = computeChore(chore, now);
  assert.equal(computed.doneToday, true);
  assert.equal(computed.isDueToday, false);
  assert.equal(computed.isDueTomorrow, true);
  assert.equal(computed.isOverdue, false);
  assert.equal(computed.overdueDays, 0);
});

test("computeChore marks overdue items", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const performedAt = new Date("2026-02-10T00:00:00.000Z");

  const chore = {
    id: "chore-2",
    title: "換気扇掃除",
    icon: "wind",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 2,
    isBigTask: true,
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
      isBigTask: false,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastPerformerId: null,
      lastRecordId: null,
      lastRecordSkipped: false,
      dueAt: "2026-02-15T15:00:00.000Z",
      isDueToday: true,
      isDueTomorrow: false,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
    {
      id: "tomorrow",
      title: "tomorrow",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 1,
      isBigTask: true,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastPerformerId: null,
      lastRecordId: null,
      lastRecordSkipped: false,
      dueAt: "2026-02-16T15:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: true,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
  ];

  const split = splitChoresForHome(chores, now);
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.tomorrowChores.length, 2);
  assert.equal(split.upcomingBigChores.length, 0);
});

test("splitChoresForHome keeps doneToday daily chore in both today and tomorrow", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const doneTodayAndDueTomorrow = {
    id: "done",
    title: "done",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 1,
    isBigTask: false,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastPerformerId: "u1",
    lastRecordId: "r",
    lastRecordSkipped: false,
    dueAt: "2026-02-15T15:30:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
    doneToday: true,
  };

  const split = splitChoresForHome([doneTodayAndDueTomorrow], now);
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.todayChores[0]?.id, "done");
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "done");
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
