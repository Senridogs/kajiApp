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
        isBigTask: false,
        defaultAssigneeId: null,
        defaultAssigneeName: null,
        archived: false,
        createdAt: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-01"),
        householdId: "h1",
        records: [
            {
                id: "r-skip",
                householdId: "h1",
                choreId: "chore-skip",
                userId: "u1",
                memo: null,
                isInitial: false,
                isSkipped: true, // SKIPPED
                performedAt,
                createdAt: performedAt,
                user: { id: "u1", name: "A" },
            },
        ],
    };

    const computed = computeChore(chore, now);

    assert.equal(computed.lastRecordSkipped, true);
    assert.equal(computed.lastPerformerName, "スキップ");
    assert.equal(computed.doneToday, true);
    assert.equal(computed.isDueToday, false);
    assert.equal(computed.isDueTomorrow, true);
    assert.equal(computed.isOverdue, false);
});

test("getStatsRange handles ALL period", () => {
    const now = new Date("2026-02-15T10:00:00+09:00");
    const range = getStatsRange("all", now);

    assert.ok(range);
    // Implementation returns undefined start for "all" period
    assert.equal(range.start, undefined);
    // End should be end of today
    assert.ok(range.end.getTime() >= now.getTime());
    assert.equal(range.label, "全期間");
});
