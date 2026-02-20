import assert from "node:assert/strict";
import test from "node:test";

import { buildCompletionPayload, buildReminderPayload } from "../../src/lib/notifications.js";

test("buildReminderPayload formats top chores and suffix", () => {
  const payload = buildReminderPayload({
    chores: [
      { title: "トイレ掃除", icon: "toilet" },
      { title: "食器洗い", icon: "dishwasher" },
      { title: "換気扇掃除", icon: "wind" },
      { title: "洗濯", icon: "shirt" },
      { title: "風呂掃除", icon: "bath" },
      { title: "玄関掃除", icon: "sparkles" },
    ],
  });

  assert.equal(payload.type, "reminder");
  assert.equal(payload.title, "今日 6件");
  assert.match(payload.body, /トイレ掃除/);
  assert.match(payload.body, /食器洗い/);
  assert.match(payload.body, /ほか1件/);
});

test("buildCompletionPayload trims memo and formats body", () => {
  const payload = buildCompletionPayload({
    choreTitle: "食器洗い",
    choreIcon: "dishwasher",
    userName: "せんり",
    memo: "  夜ごはん後に実施  ",
  });

  assert.equal(payload.type, "completion");
  assert.equal(payload.title, "食器洗い");
  assert.equal(payload.body, "せんりさんがやってくれたよ\n夜ごはん後に実施");
});
