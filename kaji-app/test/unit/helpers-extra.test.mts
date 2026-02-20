import assert from "node:assert/strict";
import test from "node:test";
import { icons } from "lucide-react";

import {
    darkenColor,
    formatDateShort,
    formatMonthDay,
    iconByName,
    lightenColor,
    maxCount,
} from "../../src/components/kaji/helpers.js";

test("darkenColor handles hex correctly", () => {
    assert.equal(darkenColor("#ffffff", 0.5), "#808080");
    assert.equal(darkenColor("#000000", 0.5), "#000000");
    assert.equal(darkenColor("#ff0000", 0.2), "#cc0000");
});

test("darkenColor returns original if invalid hex", () => {
    assert.equal(darkenColor("invalid", 0.5), "invalid");
    assert.equal(darkenColor("#zzz", 0.5), "#zzz");
});

test("lightenColor handles hex correctly", () => {
    assert.equal(lightenColor("#000000", 0.5), "#808080");
    assert.equal(lightenColor("#ffffff", 0.5), "#ffffff");
    assert.equal(lightenColor("#ff0000", 0.5), "#ff8080");
});

test("maxCount returns 1 for empty array or 0 counts", () => {
    assert.equal(maxCount([]), 1);
    assert.equal(maxCount([{ count: 0 }, { count: 0 }]), 1);
});

test("maxCount returns actual max", () => {
    assert.equal(maxCount([{ count: 5 }, { count: 10 }, { count: 3 }]), 10);
});

test("formatMonthDay formats correctly", () => {
    const date = new Date("2026-02-20T10:00:00+09:00");
    assert.equal(formatMonthDay(date), "02/20");
});

test("formatDateShort formats correctly", () => {
    const date = new Date("2026-02-20T10:00:00+09:00");
    assert.match(formatDateShort(date), /2026\/02\/20 10:00/);
});

test("iconByName returns correct icon or default", () => {
    assert.equal(iconByName("Sparkles"), icons.Sparkles);
    assert.equal(iconByName("sparkles"), icons.Sparkles); // case insensitive check logic in helper? check implementation
    // Implementation: toPascalCaseIconName("sparkles") -> "Sparkles" -> icons["Sparkles"]

    assert.equal(iconByName("Trash2"), icons.Trash2);
    assert.equal(iconByName("trash-2"), icons.Trash2); // "trash-2" -> "Trash2"

    // Fallback
    assert.equal(iconByName("NonExistentIcon"), icons.Sparkles);
});
