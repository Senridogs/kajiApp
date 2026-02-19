import assert from "node:assert/strict";
import test from "node:test";

import {
  rebuildScheduleDateKeys,
  resolveCurrentScheduleDateKeys,
} from "../../src/lib/schedule-policy.js";

const windowRange = {
  fromDateKey: "2026-03-01",
  toDateKey: "2026-03-31",
} as const;

test("resolveCurrentScheduleDateKeys keeps duplicate override entries", () => {
  const result = resolveCurrentScheduleDateKeys({
    overrideDateKeys: [
      "2026-03-10",
      "2026-03-10",
      "2026-03-12",
    ],
    dueDateKey: "2026-03-05",
    intervalDays: 7,
    window: windowRange,
  });

  assert.deepEqual(result, ["2026-03-10", "2026-03-10", "2026-03-12"]);
});

test("rebuildScheduleDateKeys merges only target date when mergeIfDuplicate=true", () => {
  const result = rebuildScheduleDateKeys({
    currentDateKeys: ["2026-03-10", "2026-03-12"],
    sourceDateKey: "2026-03-10",
    targetDateKey: "2026-03-12",
    recalculateFuture: false,
    mergeIfDuplicate: true,
    intervalDays: 7,
    window: windowRange,
  });

  assert.deepEqual(result, ["2026-03-12"]);
});

test("rebuildScheduleDateKeys keeps duplicates when mergeIfDuplicate=false", () => {
  const result = rebuildScheduleDateKeys({
    currentDateKeys: ["2026-03-10", "2026-03-12"],
    sourceDateKey: "2026-03-10",
    targetDateKey: "2026-03-12",
    recalculateFuture: false,
    mergeIfDuplicate: false,
    intervalDays: 7,
    window: windowRange,
  });

  assert.deepEqual(result, ["2026-03-12", "2026-03-12"]);
});

test("rebuildScheduleDateKeys removes exactly one source occurrence", () => {
  const result = rebuildScheduleDateKeys({
    currentDateKeys: ["2026-03-10", "2026-03-10", "2026-03-12"],
    sourceDateKey: "2026-03-10",
    targetDateKey: "2026-03-12",
    recalculateFuture: false,
    mergeIfDuplicate: false,
    intervalDays: 7,
    window: windowRange,
  });

  assert.deepEqual(result, ["2026-03-10", "2026-03-12", "2026-03-12"]);
});
