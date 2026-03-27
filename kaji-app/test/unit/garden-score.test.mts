import assert from "node:assert/strict";
import test from "node:test";

import { calcGardenScore } from "../../src/lib/garden-score.js";

test("calcGardenScore: empty array returns 100", () => {
  assert.equal(calcGardenScore([]), 100);
});

test("calcGardenScore: all ratios <= 1.0 returns 100", () => {
  assert.equal(calcGardenScore([0.1, 0.5, 0.8, 1.0]), 100);
});

test("calcGardenScore: all ratios > 1.0 returns 0", () => {
  assert.equal(calcGardenScore([1.1, 2.0, 3.5]), 0);
});

test("calcGardenScore: half within cycle returns 50", () => {
  assert.equal(calcGardenScore([0.5, 1.0, 1.5, 2.0]), 50);
});

test("calcGardenScore: mixed ratios rounds correctly", () => {
  // 2 out of 3 within cycle => 66.67 => round to 67
  assert.equal(calcGardenScore([0.3, 0.9, 1.5]), 67);
});

test("calcGardenScore: single ratio within cycle returns 100", () => {
  assert.equal(calcGardenScore([0.5]), 100);
});

test("calcGardenScore: single ratio over cycle returns 0", () => {
  assert.equal(calcGardenScore([1.1]), 0);
});

test("calcGardenScore: boundary ratio exactly 1.0 counts as within cycle", () => {
  assert.equal(calcGardenScore([1.0]), 100);
});

test("calcGardenScore: boundary ratio just above 1.0 counts as over cycle", () => {
  assert.equal(calcGardenScore([1.0001]), 0);
});

test("calcGardenScore: 1 out of 3 within cycle => 33", () => {
  assert.equal(calcGardenScore([0.5, 1.5, 2.0]), 33);
});
