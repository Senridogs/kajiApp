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
    assert.equal(payload.title, "👍 Partnerがリアクション");
    assert.match(payload.body, /👕 Laundry に👍を送りました/);
});

test("buildReactionPayload uses default emoji for null icon", () => {
    const payload = buildReactionPayload({
        reactorName: "Partner",
        emoji: "❤️",
        choreTitle: "Unknown",
        choreIcon: null,
    });

    assert.match(payload.body, /✅ Unknown に❤️を送りました/);
});
