import assert from "node:assert/strict";
import test from "node:test";

import { buildCompletionPayload, buildReminderPayload } from "../../src/lib/notifications.ts";

test("buildReminderPayload formats top chores and suffix", () => {
  const payload = buildReminderPayload({
    chores: [
      { title: "トイレ掃除", dueAt: new Date("2026-02-15T00:00:00.000Z") },
      { title: "食器洗い", dueAt: null },
      { title: "換気扇掃除", dueAt: null },
    ],
  });

  assert.equal(payload.type, "reminder");
  assert.equal(payload.title, "家事リマインド");
  assert.match(payload.body, /トイレ掃除/);
  assert.match(payload.body, /食器洗い/);
  assert.match(payload.body, /ほか1件/);
});

test("buildCompletionPayload trims memo and formats body", () => {
  const payload = buildCompletionPayload({
    choreTitle: "食器洗い",
    userName: "せんり",
    memo: "  夜ごはん後に実施  ",
  });

  assert.equal(payload.type, "completion");
  assert.equal(payload.title, "完了: 食器洗い");
  assert.equal(payload.body, "せんり が記録しました。 メモ: 夜ごはん後に実施");
});
