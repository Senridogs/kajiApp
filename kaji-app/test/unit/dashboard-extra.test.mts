import assert from "node:assert/strict";
import test from "node:test";

import { computeChore, getStatsRange } from "../../src/lib/dashboard.js";

test("computeChore handles skipped status correctly", () => {
    const now = new Date("2026-02-15T03:00:00.000Z");
    const performedAt = new Date("2026-02-15T00:00:00.000Z");

    const chore = {
        id: "chore-skip",
        title: "skip task",
        icon: "sparkles",
        iconColor: "#fff",
        bgColor: "#000",
        intervalDays: 1,
        archived: false,
        defaultAssigneeId: null,
        createdAt: new Date("2026-02-01"),
    };

    const latestRecord = {
        id: "r-skip",
        performedAt,
        isInitial: false,
        isSkipped: true,
        userId: "u1",
    };

    const users = [{ id: "u1", name: "A" }];

    const computed = computeChore(chore, latestRecord, users, now);

    assert.equal(computed.lastRecordSkipped, true);
    assert.equal(computed.lastPerformerName, "\u30b9\u30ad\u30c3\u30d7");
});

test("getStatsRange handles ALL period", () => {
    const now = new Date("2026-02-15T10:00:00+09:00");
    const range = getStatsRange("all", now);

    assert.ok(range);
    // Implementation returns undefined start for "all" period
    assert.equal(range.start, undefined);
    // End should be end of today
    assert.ok(range.end.getTime() >= now.getTime());
    assert.equal(range.label, "\u5168\u671f\u9593");
});
