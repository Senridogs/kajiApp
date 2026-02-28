import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarMonthCountsByDate,
  calendarGridDateKeys,
  isValidMonthKey,
} from "../../src/lib/calendar-month-summary.js";

test("calendarGridDateKeys returns 42 dates starting from Monday of first week", () => {
  // 2026-03-01 is a Sunday → grid starts on 2026-02-23 (Monday)
  const keys = calendarGridDateKeys("2026-03");
  assert.equal(keys.length, 42);
  assert.equal(keys[0], "2026-02-23");
  assert.equal(keys[41], "2026-04-05");
});

test("calendarGridDateKeys includes overflow days from previous and next months", () => {
  const keys = calendarGridDateKeys("2026-03");
  // Previous month overflow
  assert.ok(keys.includes("2026-02-23"));
  assert.ok(keys.includes("2026-02-28"));
  // Current month
  assert.ok(keys.includes("2026-03-01"));
  assert.ok(keys.includes("2026-03-31"));
  // Next month overflow
  assert.ok(keys.includes("2026-04-01"));
  assert.ok(keys.includes("2026-04-05"));
});

test("buildCalendarMonthCountsByDate includes task counts for overflow days from prev/next months", () => {
  const counts = buildCalendarMonthCountsByDate("2026-03", [
    {
      id: "c1",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: {
        // dueAt = 2026-02-26 → scheduled on 2026-02-26, 2026-03-05, ...
        performedAt: new Date("2026-02-19T09:00:00+09:00"),
        isSkipped: false,
      },
      scheduleOverrides: [],
    },
  ]);

  // 2026-02-26 is in the grid (prev month overflow) and should have a scheduled task
  assert.equal(counts["2026-02-26"], 1);
  // Current month dates still work
  assert.equal(counts["2026-03-05"], 1);
});

test("month key validation accepts YYYY-MM and rejects invalid formats", () => {
  assert.equal(isValidMonthKey("2026-03"), true);
  assert.equal(isValidMonthKey("2026-13"), false);
  assert.equal(isValidMonthKey("2026-3"), false);
  assert.equal(isValidMonthKey("2026/03"), false);
  assert.equal(isValidMonthKey(""), false);
});

test("7-day recurrence is expanded within month days", () => {
  const counts = buildCalendarMonthCountsByDate("2026-03", [
    {
      id: "c1",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: {
        // dueAt = 2026-03-05
        performedAt: new Date("2026-02-26T09:00:00+09:00"),
        isSkipped: false,
      },
      scheduleOverrides: [],
    },
  ]);

  assert.equal(counts["2026-03-05"], 1);
  assert.equal(counts["2026-03-12"], 1);
  assert.equal(counts["2026-03-19"], 1);
  assert.equal(counts["2026-03-26"], 1);
  assert.equal(counts["2026-03-04"], 0);
});

test("same month summary is deterministic regardless of selected week context", () => {
  const chores = [
    {
      id: "c1",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: {
        performedAt: new Date("2026-02-26T09:00:00+09:00"),
        isSkipped: false,
      },
      scheduleOverrides: [],
    },
    {
      id: "c2",
      intervalDays: 14,
      createdAt: new Date("2026-01-20T00:00:00+09:00"),
      latestRecord: null,
      scheduleOverrides: [],
    },
  ];

  const summaryA = buildCalendarMonthCountsByDate("2026-03", chores);
  const summaryB = buildCalendarMonthCountsByDate("2026-03", chores);

  assert.deepEqual(summaryA, summaryB);
});

test("duplicate override dates are counted as separate occurrences", () => {
  const counts = buildCalendarMonthCountsByDate("2026-03", [
    {
      id: "dup-override",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: {
        performedAt: new Date("2026-03-10T09:00:00+09:00"),
        isSkipped: false,
      },
      scheduleOverrides: [
        { date: "2026-03-10" },
        { date: "2026-03-10" },
      ],
    },
  ]);

  assert.equal(counts["2026-03-10"], 3);
});

import {
  OCCURRENCE_TEST_DATE_KEYS,
  OCCURRENCE_TEST_MONTH,
  calendarFixtureChores,
} from "./fixtures/occurrence-consistency.fixture.mts";

test("shared fixture count matches expected scheduled occurrences", () => {
  const counts = buildCalendarMonthCountsByDate(
    OCCURRENCE_TEST_MONTH,
    calendarFixtureChores,
  );
  const picked = Object.fromEntries(
    OCCURRENCE_TEST_DATE_KEYS.map((dateKey) => [dateKey, counts[dateKey] ?? 0]),
  );
  assert.deepEqual(picked, {
    "2026-03-05": 1,
    "2026-03-10": 1,
    "2026-03-12": 1,
  });
});

test("同じ日に複数タスクがある場合は日別件数に合算される", () => {
  const counts = buildCalendarMonthCountsByDate("2026-03", [
    {
      id: "c1",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: {
        performedAt: new Date("2026-03-10T09:00:00+09:00"),
        isSkipped: false,
      },
      scheduleOverrides: [{ date: "2026-03-10" }],
    },
    {
      id: "c2",
      intervalDays: 7,
      createdAt: new Date("2026-02-01T00:00:00+09:00"),
      latestRecord: null,
      scheduleOverrides: [{ date: "2026-03-10" }],
    },
  ]);

  assert.equal(counts["2026-03-10"], 3);
});
