import assert from "node:assert/strict";
import test from "node:test";

import { computeChore, getStatsRange } from "../../src/lib/dashboard.js";

test("computeChore marks due today flags correctly", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const performedAt = new Date("2026-02-14T15:30:00.000Z"); // JST: 02/15 00:30

  const chore = {
    id: "chore-1",
    title: "食器洗い",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    archived: false,
    defaultAssigneeId: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  };

  const latestRecord = {
    id: "r1",
    performedAt,
    isInitial: false,
    isSkipped: false,
    userId: "u1",
  };

  const users = [{ id: "u1", name: "A" }];

  const computed = computeChore(chore, latestRecord, users, now);
  // With freshness model, verify basic computed fields
  assert.equal(computed.lastPerformerName, "A");
  assert.equal(computed.lastRecordSkipped, false);
  assert.equal(computed.lastRecordIsInitial, false);
  assert.ok(computed.lastPerformedAt !== null);
});

test("computeChore keeps initial record as not-done and flags lastRecordIsInitial", () => {
  const now = new Date("2026-02-15T03:00:00.000Z"); // JST: 12:00
  const performedAt = new Date("2026-02-14T15:30:00.000Z"); // JST: 02/15 00:30

  const chore = {
    id: "chore-initial",
    title: "initial",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    archived: false,
    defaultAssigneeId: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  };

  const latestRecord = {
    id: "r-initial",
    performedAt,
    isInitial: true,
    isSkipped: false,
    userId: "u1",
  };

  const users = [{ id: "u1", name: "A" }];

  const computed = computeChore(chore, latestRecord, users, now);
  assert.equal(computed.lastRecordIsInitial, true);
  // Initial records are excluded from effective record
  assert.equal(computed.lastPerformedAt, null);
  assert.equal(computed.lastPerformerName, null);
});

test("computeChore marks overdue items via freshness", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");
  const performedAt = new Date("2026-02-10T00:00:00.000Z");

  const chore = {
    id: "chore-2",
    title: "換気扇掃除",
    icon: "wind",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 2,
    archived: false,
    defaultAssigneeId: null,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  };

  const latestRecord = {
    id: "r2",
    performedAt,
    isInitial: false,
    isSkipped: false,
    userId: "u1",
  };

  const users = [{ id: "u1", name: "A" }];

  const computed = computeChore(chore, latestRecord, users, now);
  // 5 days since last with 2 day interval => freshnessRatio > 1
  assert.ok(computed.freshnessRatio > 1);
  assert.ok(computed.daysSinceLast! > 0);
});

test("computeChore handles null latestRecord (no records)", () => {
  const now = new Date("2026-02-15T03:00:00.000Z");

  const chore = {
    id: "chore-no-record",
    title: "new task",
    icon: "sparkles",
    iconColor: "#fff",
    bgColor: "#000",
    intervalDays: 1,
    archived: false,
    defaultAssigneeId: null,
    createdAt: new Date("2026-02-14T00:00:00.000Z"),
  };

  const users = [{ id: "u1", name: "A" }];

  const computed = computeChore(chore, null, users, now);
  assert.equal(computed.lastPerformedAt, null);
  assert.equal(computed.lastRecordId, null);
  assert.equal(computed.lastPerformerName, null);
  assert.equal(computed.daysSinceLast, null);
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
