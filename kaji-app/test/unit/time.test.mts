import assert from "node:assert/strict";
import test from "node:test";

import {
  addDateKeyDays,
  addDays,
  compareDateKey,
  diffDaysFloor,
  formatDateKey,
  nowJstHourMinute,
  parseDateKey,
  startOfJstDay,
  toJstDateKey,
} from "../../src/lib/time.js";

test("toJstDateKey converts UTC date to JST date key", () => {
  const date = new Date("2026-02-15T16:30:00.000Z");
  assert.equal(toJstDateKey(date), "2026-02-16");
});

test("startOfJstDay returns midnight of JST day as UTC time", () => {
  const date = new Date("2026-02-15T16:30:00.000Z");
  assert.equal(startOfJstDay(date).toISOString(), "2026-02-15T15:00:00.000Z");
});

test("diffDaysFloor counts full day differences", () => {
  const from = new Date("2026-02-10T00:00:00.000Z");
  const to = new Date("2026-02-12T23:59:59.999Z");
  assert.equal(diffDaysFloor(from, to), 2);
});

test("addDays moves dates by N days", () => {
  const base = new Date("2026-02-10T12:00:00.000Z");
  assert.equal(addDays(base, 5).toISOString(), "2026-02-15T12:00:00.000Z");
});

test("nowJstHourMinute formats with 24-hour HH:mm", () => {
  const date = new Date("2026-02-15T14:05:00.000Z");
  assert.equal(nowJstHourMinute(date), "23:05");
});

test("parseDateKey parses JST midnight and formatDateKey round-trips", () => {
  const parsed = parseDateKey("2026-03-01");
  assert.equal(parsed?.toISOString(), "2026-02-28T15:00:00.000Z");
  assert.equal(formatDateKey(parsed ?? new Date(Number.NaN)), "2026-03-01");
  assert.equal(parseDateKey("2026-02-30"), null);
});

test("addDateKeyDays and compareDateKey work for date keys", () => {
  assert.equal(addDateKeyDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDateKeyDays("invalid", 1), null);
  assert.ok(compareDateKey("2026-02-20", "2026-02-21") < 0);
  assert.equal(compareDateKey("2026-02-21", "2026-02-21"), 0);
});

test("JST day boundary: 23:59 and 00:00 map to adjacent date keys", () => {
  const justBeforeMidnight = new Date("2026-02-28T14:59:59.999Z");
  const midnight = new Date("2026-02-28T15:00:00.000Z");

  assert.equal(toJstDateKey(justBeforeMidnight), "2026-02-28");
  assert.equal(toJstDateKey(midnight), "2026-03-01");
  assert.equal(formatDateKey(justBeforeMidnight), "2026-02-28");
  assert.equal(formatDateKey(midnight), "2026-03-01");
});
