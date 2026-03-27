import assert from "node:assert/strict";
import test from "node:test";

import { calcHouseholdStreak } from "../../src/lib/streak.js";

test("calcHouseholdStreak: empty dates returns 0", () => {
  assert.equal(calcHouseholdStreak([], "2026-03-25"), 0);
});

test("calcHouseholdStreak: today only returns 1", () => {
  assert.equal(calcHouseholdStreak(["2026-03-25"], "2026-03-25"), 1);
});

test("calcHouseholdStreak: today + yesterday returns 2", () => {
  const dates = ["2026-03-25", "2026-03-24"];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 2);
});

test("calcHouseholdStreak: 5 consecutive days ending today returns 5", () => {
  const dates = [
    "2026-03-25",
    "2026-03-24",
    "2026-03-23",
    "2026-03-22",
    "2026-03-21",
  ];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 5);
});

test("calcHouseholdStreak: gap in dates breaks streak", () => {
  // today + yesterday, then gap, then 3 days before
  const dates = [
    "2026-03-25",
    "2026-03-24",
    // gap: 2026-03-23 missing
    "2026-03-22",
    "2026-03-21",
  ];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 2);
});

test("calcHouseholdStreak: no today but yesterday exists counts from yesterday", () => {
  // Today (2026-03-25) not present, but yesterday and before are
  const dates = ["2026-03-24", "2026-03-23", "2026-03-22"];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 3);
});

test("calcHouseholdStreak: no today and no yesterday returns 0", () => {
  const dates = ["2026-03-20", "2026-03-19"];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 0);
});

test("calcHouseholdStreak: month boundary (March to February)", () => {
  const dates = ["2026-03-02", "2026-03-01", "2026-02-28"];
  assert.equal(calcHouseholdStreak(dates, "2026-03-02"), 3);
});

test("calcHouseholdStreak: year boundary (January to December)", () => {
  const dates = ["2026-01-02", "2026-01-01", "2025-12-31", "2025-12-30"];
  assert.equal(calcHouseholdStreak(dates, "2026-01-02"), 4);
});

test("calcHouseholdStreak: duplicate dates do not double count", () => {
  const dates = ["2026-03-25", "2026-03-25", "2026-03-24", "2026-03-24"];
  assert.equal(calcHouseholdStreak(dates, "2026-03-25"), 2);
});

test("calcHouseholdStreak: single old date with no today returns 0", () => {
  assert.equal(calcHouseholdStreak(["2026-01-01"], "2026-03-25"), 0);
});
