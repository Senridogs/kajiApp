import assert from "node:assert/strict";
import test from "node:test";

import {
    buildRecurrenceDateKeys,
    dateKeyToJstDate,
    resolveScheduleWindow,
    uniqueSortedDateKeys,
} from "../../src/lib/schedule-policy.js";

test("buildRecurrenceDateKeys returns empty if interval <= 0", () => {
    const result = buildRecurrenceDateKeys({
        dueDateKey: "2026-02-01",
        intervalDays: 0,
        fromDateKey: "2026-02-01",
        toDateKey: "2026-02-28",
    });
    assert.deepEqual(result, []);
});

test("buildRecurrenceDateKeys returns empty if dates invalid", () => {
    const result = buildRecurrenceDateKeys({
        dueDateKey: "invalid",
        intervalDays: 1,
        fromDateKey: "2026-02-01",
        toDateKey: "2026-02-28",
    });
    assert.deepEqual(result, []);
});

test("buildRecurrenceDateKeys generates recurrence", () => {
    const result = buildRecurrenceDateKeys({
        dueDateKey: "2026-02-01",
        intervalDays: 7,
        fromDateKey: "2026-02-01",
        toDateKey: "2026-02-20",
    });
    // 2/1, 2/8, 2/15
    assert.deepEqual(result, ["2026-02-01", "2026-02-08", "2026-02-15"]);
});

test("resolveScheduleWindow ensures valid range", () => {
    const window = resolveScheduleWindow("2026-02-01", "2026-02-10");
    assert.ok(window.fromDateKey <= "2026-02-01");
    assert.ok(window.toDateKey >= "2026-02-10");
});

test("dateKeyToJstDate parses correctly", () => {
    const date = dateKeyToJstDate("2026-02-20");
    assert.equal(date.toISOString(), "2026-02-19T15:00:00.000Z"); // JST 00:00 is UTC prev day 15:00
});

test("uniqueSortedDateKeys removes duplicates and sorts", () => {
    const result = uniqueSortedDateKeys(["2026-02-05", "2026-02-01", "2026-02-05"]);
    assert.deepEqual(result, ["2026-02-01", "2026-02-05"]);
});
