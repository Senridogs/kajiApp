import assert from "node:assert/strict";
import test from "node:test";

import { buildReactionPayload } from "../../src/lib/notifications.js";

test("buildReactionPayload formats correctly", () => {
    const payload = buildReactionPayload({
        reactorName: "Partner",
        emoji: "👍",
        choreTitle: "Laundry",
        choreIcon: "shirt",
    });

    assert.equal(payload.type, "reaction");
    assert.equal(payload.title, "Partnerがリアクション");
    assert.equal(payload.body, "Laundry にリアクションしました");
});

test("buildReactionPayload uses default emoji for null icon", () => {
    const payload = buildReactionPayload({
        reactorName: "Partner",
        emoji: "❤️",
        choreTitle: "Unknown",
        choreIcon: null,
    });

    assert.equal(payload.body, "Unknown にリアクションしました");
});
