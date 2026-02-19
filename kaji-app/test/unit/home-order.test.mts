import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHomeStoredOrder,
  isDateKey,
  isDateKeyWithinRollingWindow,
  moveAcrossDates,
  reorderWithinDate,
  sanitizeHomeOrderByDate,
} from "../../src/lib/home-order.js";

test("applyHomeStoredOrder keeps stored order and inserts unknown items by base index", () => {
  const baseIds = ["a", "b", "c", "d", "e"];
  const storedIds = ["d", "b", "x"];
  const ordered = applyHomeStoredOrder(baseIds, storedIds);

  assert.deepEqual(ordered, ["a", "c", "d", "b", "e"]);
});

test("reorderWithinDate supports before/after placement", () => {
  const ids = ["a", "b", "c", "d"];

  const before = reorderWithinDate(ids, "d", "b", "before");
  assert.deepEqual(before, ["a", "d", "b", "c"]);

  const after = reorderWithinDate(ids, "a", "c", "after");
  assert.deepEqual(after, ["b", "c", "a", "d"]);
});

test("moveAcrossDates removes from source and inserts into target at drop position", () => {
  const sourceIds = ["a", "b", "c"];
  const targetIds = ["x", "y", "z"];

  const movedBefore = moveAcrossDates(sourceIds, targetIds, "b", "y", "before");
  assert.deepEqual(movedBefore.sourceIds, ["a", "c"]);
  assert.deepEqual(movedBefore.targetIds, ["x", "b", "y", "z"]);

  const movedAfter = moveAcrossDates(sourceIds, targetIds, "a", "y", "after");
  assert.deepEqual(movedAfter.sourceIds, ["b", "c"]);
  assert.deepEqual(movedAfter.targetIds, ["x", "y", "a", "z"]);
});

test("isDateKey validates YYYY-MM-DD and rejects invalid dates", () => {
  assert.equal(isDateKey("2026-02-19"), true);
  assert.equal(isDateKey("2026-2-19"), false);
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey("invalid"), false);
});

test("isDateKeyWithinRollingWindow keeps only dates within 120-day window", () => {
  const today = "2026-02-19";
  assert.equal(isDateKeyWithinRollingWindow("2025-10-22", today, 120), true);
  assert.equal(isDateKeyWithinRollingWindow("2025-10-21", today, 120), false);
  assert.equal(isDateKeyWithinRollingWindow("2026-06-19", today, 120), true);
  assert.equal(isDateKeyWithinRollingWindow("2026-06-20", today, 120), false);
});

test("sanitizeHomeOrderByDate drops invalid/out-of-window keys and normalizes ids", () => {
  const sanitized = sanitizeHomeOrderByDate(
    {
      "2026-02-19": ["a", "a", "b", 1],
      "2025-10-22": ["x"],
      "2025-10-21": ["too-old"],
      "bad-date": ["invalid"],
      "2026-02-20": "not-array",
    },
    { todayDateKey: "2026-02-19", rollingWindowDays: 120 },
  );

  assert.deepEqual(sanitized, {
    "2026-02-19": ["a", "b"],
    "2025-10-22": ["x"],
  });
});
