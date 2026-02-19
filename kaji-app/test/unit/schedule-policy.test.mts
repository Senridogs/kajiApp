import assert from "node:assert/strict";
import test from "node:test";

import {
  rebuildScheduleDateKeys,
  resolveCurrentScheduleDateKeys,
  resolveScheduleWindow,
} from "../../src/lib/schedule-policy.js";

test("rebuildScheduleDateKeys keeps later cadence when recalculateFuture is false", () => {
  const sourceDateKey = "2026-02-20";
  const targetDateKey = "2026-02-19";
  const window = resolveScheduleWindow(sourceDateKey, targetDateKey);
  const currentDateKeys = resolveCurrentScheduleDateKeys({
    overrideDateKeys: [],
    dueDateKey: sourceDateKey,
    intervalDays: 2,
    window,
  });

  const moved = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey,
    targetDateKey,
    recalculateFuture: false,
    intervalDays: 2,
    window,
  });

  assert.equal(moved.includes("2026-02-19"), true);
  assert.equal(moved.includes("2026-02-20"), false);
  assert.equal(moved.includes("2026-02-22"), true);
});

test("rebuildScheduleDateKeys recalculates cadence from target date when recalculateFuture is true", () => {
  const sourceDateKey = "2026-02-20";
  const targetDateKey = "2026-02-19";
  const window = resolveScheduleWindow(sourceDateKey, targetDateKey);
  const currentDateKeys = resolveCurrentScheduleDateKeys({
    overrideDateKeys: [],
    dueDateKey: sourceDateKey,
    intervalDays: 2,
    window,
  });

  const moved = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey,
    targetDateKey,
    recalculateFuture: true,
    intervalDays: 2,
    window,
  });

  assert.equal(moved.includes("2026-02-19"), true);
  assert.equal(moved.includes("2026-02-21"), true);
  assert.equal(moved.includes("2026-02-22"), false);
});

test("future-date completion can consume target date while preserving selected schedule policy", () => {
  const sourceDateKey = "2026-02-20";
  const targetDateKey = "2026-02-19";
  const window = resolveScheduleWindow(sourceDateKey, targetDateKey);
  const currentDateKeys = resolveCurrentScheduleDateKeys({
    overrideDateKeys: [],
    dueDateKey: sourceDateKey,
    intervalDays: 2,
    window,
  });

  const noRecalc = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey,
    targetDateKey,
    recalculateFuture: false,
    intervalDays: 2,
    window,
  }).filter((dateKey) => dateKey !== targetDateKey);
  const recalc = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey,
    targetDateKey,
    recalculateFuture: true,
    intervalDays: 2,
    window,
  }).filter((dateKey) => dateKey !== targetDateKey);

  assert.equal(noRecalc[0], "2026-02-22");
  assert.equal(recalc[0], "2026-02-21");
});
