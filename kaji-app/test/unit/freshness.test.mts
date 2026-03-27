import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFreshness,
  freshnessHue,
  plantStage,
  plantEmoji,
} from "../../src/lib/freshness.js";

// ---------------------------------------------------------------------------
// computeFreshness
// ---------------------------------------------------------------------------

test("computeFreshness: no last record uses intervalDays as elapsed time", () => {
  const result = computeFreshness(null, 3);
  // ratio = (3*24) / (3*24) = 1.0
  assert.equal(result.ratio, 1.0);
  assert.equal(result.level, "due");
});

test("computeFreshness: recent record yields low ratio (fresh)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const lastPerformed = new Date("2026-03-25T10:00:00.000Z"); // 2 hours ago
  const result = computeFreshness(lastPerformed, 7, now);
  // ratio = 2 / (7*24) = 2/168 ~ 0.0119
  assert.ok(result.ratio < 0.5);
  assert.equal(result.level, "fresh");
  assert.equal(result.label, "やったぜ");
});

test("computeFreshness: old record yields high ratio (stale)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const lastPerformed = new Date("2026-03-10T12:00:00.000Z"); // 15 days ago
  const result = computeFreshness(lastPerformed, 7, now);
  // ratio = (15*24) / (7*24) ~ 2.14
  assert.ok(result.ratio >= 1.5);
  assert.equal(result.level, "stale");
  assert.equal(result.label, "久しぶりだね");
});

test("computeFreshness: edge case intervalDays = 1 (daily task)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const lastPerformed = new Date("2026-03-25T00:00:00.000Z"); // 12 hours ago
  const result = computeFreshness(lastPerformed, 1, now);
  // ratio = 12 / 24 = 0.5
  assert.equal(result.ratio, 0.5);
  assert.equal(result.level, "upcoming");
});

test("computeFreshness: just performed (ratio ~ 0)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const result = computeFreshness(now, 3, now);
  assert.equal(result.ratio, 0);
  assert.equal(result.level, "fresh");
});

test("computeFreshness: upcoming level (0.5 <= ratio < 0.85)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  // For intervalDays=10, want ratio around 0.7 => hours = 0.7 * 240 = 168
  const lastPerformed = new Date(now.getTime() - 168 * 60 * 60 * 1000);
  const result = computeFreshness(lastPerformed, 10, now);
  assert.ok(result.ratio >= 0.5 && result.ratio < 0.85);
  assert.equal(result.level, "upcoming");
  assert.equal(result.label, "もう一回やっとく？");
});

test("computeFreshness: due level (0.85 <= ratio < 1.5)", () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  // For intervalDays=10, want ratio = 1.0 => hours = 240
  const lastPerformed = new Date(now.getTime() - 240 * 60 * 60 * 1000);
  const result = computeFreshness(lastPerformed, 10, now);
  const diff = Math.abs(result.ratio - 1.0);
  assert.ok(diff < 0.001);
  assert.equal(result.level, "due");
  assert.equal(result.label, "そろそろかな");
});

test("computeFreshness: intervalDays = 0 yields ratio 0", () => {
  const result = computeFreshness(null, 0);
  assert.equal(result.ratio, 0);
  assert.equal(result.level, "fresh");
});

// ---------------------------------------------------------------------------
// freshnessHue
// ---------------------------------------------------------------------------

test("freshnessHue: ratio 0 returns 140 (green)", () => {
  assert.equal(freshnessHue(0), 140);
});

test("freshnessHue: ratio 2.0 returns 25 (orange)", () => {
  assert.equal(freshnessHue(2.0), 25);
});

test("freshnessHue: ratio 1.0 returns midpoint", () => {
  // 140 - (1.0/2.0)*115 = 140 - 57.5 = 82.5 => 83
  assert.equal(freshnessHue(1.0), 83);
});

test("freshnessHue: ratio > 2.0 is clamped to 2.0", () => {
  assert.equal(freshnessHue(5.0), freshnessHue(2.0));
  assert.equal(freshnessHue(5.0), 25);
});

test("freshnessHue: negative ratio is clamped to 0", () => {
  assert.equal(freshnessHue(-1.0), freshnessHue(0));
  assert.equal(freshnessHue(-1.0), 140);
});

// ---------------------------------------------------------------------------
// plantStage
// ---------------------------------------------------------------------------

test("plantStage: ratio < 0.3 => sprout", () => {
  assert.equal(plantStage(0), "sprout");
  assert.equal(plantStage(0.29), "sprout");
});

test("plantStage: 0.3 <= ratio < 0.6 => growing", () => {
  assert.equal(plantStage(0.3), "growing");
  assert.equal(plantStage(0.59), "growing");
});

test("plantStage: 0.6 <= ratio < 0.85 => budding", () => {
  assert.equal(plantStage(0.6), "budding");
  assert.equal(plantStage(0.84), "budding");
});

test("plantStage: 0.85 <= ratio < 1.2 => bloom", () => {
  assert.equal(plantStage(0.85), "bloom");
  assert.equal(plantStage(1.19), "bloom");
});

test("plantStage: 1.2 <= ratio < 1.8 => wilting", () => {
  assert.equal(plantStage(1.2), "wilting");
  assert.equal(plantStage(1.79), "wilting");
});

test("plantStage: ratio >= 1.8 => withered", () => {
  assert.equal(plantStage(1.8), "withered");
  assert.equal(plantStage(10), "withered");
});

// ---------------------------------------------------------------------------
// plantEmoji
// ---------------------------------------------------------------------------

test("plantEmoji: each stage maps to correct emoji", () => {
  assert.equal(plantEmoji("sprout"), "\u{1F331}");   // 🌱
  assert.equal(plantEmoji("growing"), "\u{1F33F}");   // 🌿
  assert.equal(plantEmoji("budding"), "\u{1F337}");   // 🌷
  assert.equal(plantEmoji("bloom"), "\u{1F33A}");     // 🌺
  assert.equal(plantEmoji("wilting"), "\u{1F940}");   // 🥀
  assert.equal(plantEmoji("withered"), "\u{1F342}");  // 🍂
});
