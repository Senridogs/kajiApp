import assert from "node:assert/strict";
import test from "node:test";

import { generateHomeMessage } from "../../src/lib/home-message.js";

import type { HomeMessageContext } from "../../src/lib/home-message.js";

function baseCtx(overrides: Partial<HomeMessageContext> = {}): HomeMessageContext {
  return {
    streak: 0,
    gardenScore: 80,
    gardenScoreYesterday: null,
    staleCount: 0,
    totalChores: 5,
    recentFamilyRecords: [],
    lastOpenedAt: null,
    now: new Date("2026-03-25T12:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// welcome message
// ---------------------------------------------------------------------------

test("generateHomeMessage: no lastOpenedAt => welcome is null", () => {
  const result = generateHomeMessage(baseCtx());
  assert.equal(result.welcome, null);
});

test("generateHomeMessage: lastOpenedAt < 1 hour ago => welcome is null", () => {
  const result = generateHomeMessage(
    baseCtx({
      lastOpenedAt: new Date("2026-03-25T11:30:00.000Z"), // 30 min ago
    })
  );
  assert.equal(result.welcome, null);
});

test("generateHomeMessage: lastOpenedAt > 1 hour ago with no records => generic welcome", () => {
  const result = generateHomeMessage(
    baseCtx({
      lastOpenedAt: new Date("2026-03-25T08:00:00.000Z"), // 4 hours ago
    })
  );
  assert.equal(result.welcome, "おかえり！");
});

test("generateHomeMessage: welcome with single family record", () => {
  const result = generateHomeMessage(
    baseCtx({
      lastOpenedAt: new Date("2026-03-25T08:00:00.000Z"),
      recentFamilyRecords: [{ userName: "太郎", choreTitle: "掃除" }],
    })
  );
  assert.equal(result.welcome, "おかえり！太郎が掃除をやってくれた");
});

test("generateHomeMessage: welcome with multiple family records", () => {
  const result = generateHomeMessage(
    baseCtx({
      lastOpenedAt: new Date("2026-03-25T08:00:00.000Z"),
      recentFamilyRecords: [
        { userName: "太郎", choreTitle: "掃除" },
        { userName: "花子", choreTitle: "料理" },
        { userName: "太郎", choreTitle: "洗濯" },
      ],
    })
  );
  assert.equal(result.welcome, "おかえり！太郎が掃除など3件やってくれた");
});

// ---------------------------------------------------------------------------
// daily message: streak milestones
// ---------------------------------------------------------------------------

test("generateHomeMessage: streak >= 30 => milestone message", () => {
  const result = generateHomeMessage(baseCtx({ streak: 30 }));
  assert.equal(result.message, "30日連続！すごいチームワーク");
});

test("generateHomeMessage: streak >= 14 => milestone message", () => {
  const result = generateHomeMessage(baseCtx({ streak: 14 }));
  assert.equal(result.message, "14日連続！いい感じ");
});

test("generateHomeMessage: streak >= 7 => milestone message", () => {
  const result = generateHomeMessage(baseCtx({ streak: 7 }));
  assert.equal(result.message, "7日連続達成！家族の力がすごい");
});

test("generateHomeMessage: streak priority (30 > 14 > 7)", () => {
  const r30 = generateHomeMessage(baseCtx({ streak: 31 }));
  assert.ok(r30.message.includes("すごいチームワーク"));

  const r14 = generateHomeMessage(baseCtx({ streak: 15 }));
  assert.ok(r14.message.includes("いい感じ"));

  const r7 = generateHomeMessage(baseCtx({ streak: 8 }));
  assert.ok(r7.message.includes("家族の力がすごい"));
});

// ---------------------------------------------------------------------------
// daily message: garden score
// ---------------------------------------------------------------------------

test("generateHomeMessage: gardenScore 100 => perfect message", () => {
  const result = generateHomeMessage(baseCtx({ gardenScore: 100 }));
  assert.equal(result.message, "全部の家事が周期内。最高の状態");
});

test("generateHomeMessage: garden score improved => shows improvement", () => {
  const result = generateHomeMessage(
    baseCtx({ gardenScore: 80, gardenScoreYesterday: 60 })
  );
  assert.equal(result.message, "庭スコアが60→80にアップ");
});

test("generateHomeMessage: garden score same or decreased => no improvement message", () => {
  const result = generateHomeMessage(
    baseCtx({ gardenScore: 60, gardenScoreYesterday: 80, staleCount: 1 })
  );
  // Should NOT show improvement, falls through to staleCount message
  assert.ok(!result.message.includes("アップ"));
});

// ---------------------------------------------------------------------------
// daily message: stale chores
// ---------------------------------------------------------------------------

test("generateHomeMessage: staleCount > 3 => plural stale message", () => {
  const result = generateHomeMessage(baseCtx({ staleCount: 5 }));
  assert.equal(result.message, "5件が久しぶり。誰かよろしく");
});

test("generateHomeMessage: staleCount 1-3 => subtle stale message", () => {
  const result = generateHomeMessage(baseCtx({ staleCount: 2 }));
  assert.equal(result.message, "2件そろそろかも");
});

// ---------------------------------------------------------------------------
// daily message: no chores
// ---------------------------------------------------------------------------

test("generateHomeMessage: totalChores 0 => add chores message", () => {
  const result = generateHomeMessage(baseCtx({ totalChores: 0 }));
  assert.equal(result.message, "家事を追加して庭を育てよう");
});

// ---------------------------------------------------------------------------
// daily message: default
// ---------------------------------------------------------------------------

test("generateHomeMessage: no special conditions => default message", () => {
  const result = generateHomeMessage(
    baseCtx({ streak: 2, gardenScore: 80, staleCount: 0, totalChores: 5 })
  );
  assert.equal(result.message, "今日もいい一日に");
});

// ---------------------------------------------------------------------------
// priority ordering
// ---------------------------------------------------------------------------

test("generateHomeMessage: streak takes priority over gardenScore", () => {
  const result = generateHomeMessage(
    baseCtx({ streak: 30, gardenScore: 100 })
  );
  // streak 30 message, not garden 100 message
  assert.ok(result.message.includes("すごいチームワーク"));
});

test("generateHomeMessage: gardenScore 100 takes priority over score improvement", () => {
  const result = generateHomeMessage(
    baseCtx({ gardenScore: 100, gardenScoreYesterday: 80 })
  );
  assert.equal(result.message, "全部の家事が周期内。最高の状態");
});
