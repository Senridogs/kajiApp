import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeThemeColor,
  THEME_COLOR_STORAGE_KEY,
} from "../../src/lib/theme-color.js";

test("theme color storage key is stable", () => {
  assert.equal(THEME_COLOR_STORAGE_KEY, "kaji_theme_color");
});

test("normalizeThemeColor accepts only supported values", () => {
  assert.equal(normalizeThemeColor("orange"), "orange");
  assert.equal(normalizeThemeColor("blue"), "blue");
  assert.equal(normalizeThemeColor("emerald"), "emerald");
  assert.equal(normalizeThemeColor("rose"), "rose");
  assert.equal(normalizeThemeColor("purple"), "orange");
  assert.equal(normalizeThemeColor(null), "orange");
  assert.equal(normalizeThemeColor(undefined), "orange");
});
