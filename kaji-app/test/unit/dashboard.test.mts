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

test("splitChoresForHome splits today/tomorrow/big sections", () => {
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
      lastRecordId: null,
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
      isBigTask: false,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastRecordId: null,
      dueAt: "2026-02-16T15:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: true,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
    {
      id: "big",
      title: "big",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 30,
      isBigTask: true,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastRecordId: null,
      dueAt: "2026-02-20T15:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: false,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
  ];

  const split = splitChoresForHome(chores, now);
  assert.equal(split.todayChores.length, 1);
  // "today" chore (intervalDays=1, isDueToday) also appears in tomorrow
  assert.equal(split.tomorrowChores.length, 2);
  assert.equal(split.upcomingBigChores.length, 1);
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
    lastRecordId: "r",
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

test("splitChoresForHome excludes big chores already shown in today or tomorrow", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const chores = [
    {
      id: "big-today",
      title: "big-today",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 30,
      isBigTask: true,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastRecordId: null,
      dueAt: "2026-02-15T06:00:00.000Z",
      isDueToday: true,
      isDueTomorrow: false,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
    {
      id: "big-tomorrow",
      title: "big-tomorrow",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 30,
      isBigTask: true,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastRecordId: null,
      dueAt: "2026-02-16T06:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: true,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
    {
      id: "big-future",
      title: "big-future",
      icon: "",
      iconColor: "",
      bgColor: "",
      intervalDays: 30,
      isBigTask: true,
      archived: false,
      defaultAssigneeId: null,
      defaultAssigneeName: null,
      lastPerformedAt: null,
      lastPerformerName: null,
      lastRecordId: null,
      dueAt: "2026-02-20T06:00:00.000Z",
      isDueToday: false,
      isDueTomorrow: false,
      isOverdue: false,
      overdueDays: 0,
      daysSinceLast: null,
      doneToday: false,
    },
  ];

  const split = splitChoresForHome(chores, now);
  assert.deepEqual(split.todayChores.map((c) => c.id), ["big-today"]);
  assert.deepEqual(split.tomorrowChores.map((c) => c.id), ["big-tomorrow"]);
  assert.deepEqual(split.upcomingBigChores.map((c) => c.id), ["big-future"]);
});

test("splitChoresForHome keeps doneToday non-daily chore in both today and tomorrow", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const doneTodayWeekly = {
    id: "weekly-done",
    title: "weekly-done",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 7,
    isBigTask: false,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-14T15:30:00.000Z",
    lastPerformerName: "A",
    lastRecordId: "r",
    dueAt: "2026-02-16T15:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: true,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
    doneToday: true,
  };

  const split = splitChoresForHome([doneTodayWeekly], now);
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.todayChores[0]?.id, "weekly-done");
  assert.equal(split.tomorrowChores.length, 1);
  assert.equal(split.tomorrowChores[0]?.id, "weekly-done");
});

test("splitChoresForHome keeps big tasks only within 40 days", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const bigWithinWindow = {
    id: "big-within-window",
    title: "big-within-window",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 30,
    isBigTask: true,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastRecordId: null,
    dueAt: "2026-03-27T00:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
  };
  const bigOutsideWindow = {
    ...bigWithinWindow,
    id: "big-outside-window",
    title: "big-outside-window",
    dueAt: "2026-03-28T00:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
  };

  const split = splitChoresForHome([bigWithinWindow, bigOutsideWindow], now);
  assert.equal(split.upcomingBigChores.length, 1);
  assert.equal(split.upcomingBigChores[0]?.id, "big-within-window");
});

test("splitChoresForHome sorts upcoming big chores by nearest due date", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const bigLater = {
    id: "big-later",
    title: "big-later",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 30,
    isBigTask: true,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastRecordId: null,
    dueAt: "2026-02-25T00:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
  };
  const bigSooner = {
    ...bigLater,
    id: "big-sooner",
    title: "big-sooner",
    dueAt: "2026-02-20T00:00:00.000Z",
  };

  const split = splitChoresForHome([bigLater, bigSooner], now);
  assert.deepEqual(split.upcomingBigChores.map((c) => c.id), ["big-sooner", "big-later"]);
});

test("splitChoresForHome moves doneToday future big chore to today section", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const doneBigFuture = {
    id: "big-done-future",
    title: "big-done-future",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 30,
    isBigTask: true,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: "2026-02-15T02:30:00.000Z",
    lastPerformerName: "A",
    lastRecordId: "r-big",
    dueAt: "2026-02-20T00:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
    doneToday: true,
  };

  const split = splitChoresForHome([doneBigFuture], now);
  assert.equal(split.todayChores.length, 1);
  assert.equal(split.todayChores[0]?.id, "big-done-future");
  assert.equal(split.tomorrowChores.length, 0);
  assert.equal(split.upcomingBigChores.length, 0);
});

test("splitChoresForHome keeps unchecked future big chore in big section", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const uncheckedBigFuture = {
    id: "big-unchecked",
    title: "big-unchecked",
    icon: "",
    iconColor: "",
    bgColor: "",
    intervalDays: 30,
    isBigTask: true,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastRecordId: null,
    dueAt: "2026-02-20T00:00:00.000Z",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
  };

  const split = splitChoresForHome([uncheckedBigFuture], now);
  assert.equal(split.todayChores.length, 0);
  assert.equal(split.tomorrowChores.length, 0);
  assert.equal(split.upcomingBigChores.length, 1);
  assert.equal(split.upcomingBigChores[0]?.id, "big-unchecked");
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
