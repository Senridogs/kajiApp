import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarMonthCountsByDate,
  isValidMonthKey,
} from "../../src/lib/calendar-month-summary.js";

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
