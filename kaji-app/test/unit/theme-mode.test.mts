import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeThemeMode,
  resolveTheme,
  THEME_MODE_STORAGE_KEY,
} from "../../src/lib/theme-mode.js";

test("theme mode storage key is stable", () => {
  assert.equal(THEME_MODE_STORAGE_KEY, "kaji_theme_mode");
});

test("normalizeThemeMode accepts only supported values", () => {
  assert.equal(normalizeThemeMode("system"), "system");
  assert.equal(normalizeThemeMode("light"), "light");
  assert.equal(normalizeThemeMode("dark"), "dark");
  assert.equal(normalizeThemeMode("unknown"), "system");
  assert.equal(normalizeThemeMode(null), "system");
  assert.equal(normalizeThemeMode(undefined), "system");
});

test("resolveTheme resolves system mode from OS preference", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
});

test("resolveTheme keeps explicit light or dark", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("dark", true), "dark");
});
