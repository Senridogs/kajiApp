import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  diffDaysFloor,
  nowJstHourMinute,
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
