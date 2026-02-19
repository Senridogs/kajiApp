import assert from "node:assert/strict";
import test from "node:test";

import { dueInDaysLabel, labelForDue, relativeLastPerformed } from "../../src/components/kaji/helpers.js";

test("relativeLastPerformed returns today/yesterday/NDays ago", () => {
  const now = new Date("2026-02-15T06:00:00.000Z");
  assert.equal(relativeLastPerformed("2026-02-15T01:00:00.000Z", now), "今日");
  assert.equal(relativeLastPerformed("2026-02-14T10:00:00.000Z", now), "昨日");
  assert.equal(relativeLastPerformed("2026-02-10T10:00:00.000Z", now), "5日前");
  assert.equal(relativeLastPerformed(null, now), "未実施");
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
    isBigTask: false,
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
    "期限まで2日",
  );
  assert.equal(
    dueInDaysLabel({ ...base, dueAt: "2026-02-15T00:00:00.000Z" }, now),
    "期限は今日",
  );
  assert.equal(
    dueInDaysLabel({ ...base, dueAt: "2026-02-13T00:00:00.000Z" }, now),
    "2日超過",
  );
  assert.equal(dueInDaysLabel({ ...base, dueAt: null }, now), "期限未設定");
});

test("labelForDue formats due date in JST", () => {
  const base = {
    id: "c",
    title: "test",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    isBigTask: false,
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

  const label = labelForDue({ ...base, dueAt: "2026-02-14T15:30:00.000Z" });
  assert.match(label, /02\/15/);
});
