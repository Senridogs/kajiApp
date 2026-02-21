import assert from "node:assert/strict";
import test from "node:test";

import { dueInDaysLabel, homeProgressState, labelForDue, relativeLastPerformed } from "../../src/components/kaji/helpers.js";

test("relativeLastPerformed returns today/yesterday/NDays ago", () => {
  const now = new Date("2026-02-15T06:00:00.000Z");
  assert.equal(relativeLastPerformed("2026-02-15T01:00:00.000Z", now), "\u4eca\u65e5");
  assert.equal(relativeLastPerformed("2026-02-14T10:00:00.000Z", now), "\u6628\u65e5");
  assert.equal(relativeLastPerformed("2026-02-10T10:00:00.000Z", now), "5\u65e5\u524d");
  assert.equal(relativeLastPerformed(null, now), "\u672a\u5b9f\u65bd");
});

test("dueInDaysLabel returns future/today/overdue labels", () => {
  const now = new Date("2026-02-15T06:00:00.000Z");

  const base = {
    id: "c",
    title: "test",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastPerformerId: null,
    lastRecordId: null,
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
  };

  assert.equal(
    dueInDaysLabel({ ...base, dueAt: "2026-02-17T00:00:00.000Z" }, now),
    "\u671f\u9650\u307e\u30672\u65e5",
  );
  assert.equal(
    dueInDaysLabel({ ...base, dueAt: "2026-02-15T00:00:00.000Z" }, now),
    "\u671f\u9650\u306f\u4eca\u65e5",
  );
  assert.equal(
    dueInDaysLabel({ ...base, dueAt: "2026-02-13T00:00:00.000Z" }, now),
    "2\u65e5\u8d85\u904e",
  );
  assert.equal(dueInDaysLabel({ ...base, dueAt: null }, now), "\u671f\u9650\u672a\u8a2d\u5b9a");
});

test("homeProgressState resolves pending/done/skipped consistently", () => {
  assert.equal(homeProgressState(undefined), "pending");
  assert.equal(homeProgressState({ pending: 1, completed: 5, skipped: 10 }), "pending");
  assert.equal(homeProgressState({ pending: 0, completed: 1, skipped: 0 }), "done");
  assert.equal(homeProgressState({ pending: 0, completed: 0, skipped: 2 }), "skipped");
  assert.equal(homeProgressState({ pending: 0, completed: 0, skipped: 0 }), "pending");
});

test("labelForDue uses explicit state over doneToday", () => {
  const base = {
    id: "c",
    title: "test",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    dailyTargetCount: 1,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    archived: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastPerformerId: null,
    lastRecordId: null,
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    isDueToday: true,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: null,
    doneToday: false,
    dueAt: "2026-02-14T15:30:00.000Z",
  };

  assert.equal(labelForDue(base, { state: "done" }), "\u5b9f\u65bd\u6e08\u307f");
  assert.equal(labelForDue({ ...base, doneToday: true }, { state: "pending" }), "\u4eca\u65e5");
  assert.match(labelForDue({ ...base, isDueToday: false, dueAt: "2026-02-14T15:30:00.000Z" }, { state: "pending" }), /02\/15/);
});
