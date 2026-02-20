import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("settings sidebar links to theme color screen", () => {
  const app = read("src/components/kaji/kaji-app.tsx");

  assert.match(app, /type SettingsViewKey =[\s\S]*"theme"/);
  assert.match(app, /openSettingsView\("theme"\)/);
  assert.match(app, /if \(settingsView === "theme"\)/);
  assert.match(app, /テーマカラー/);
  assert.match(app, /handleThemeColorChange/);
});

test("layout initialization applies stored theme color before hydration", () => {
  const layout = read("src/app/layout.tsx");

  assert.match(layout, /THEME_COLOR_STORAGE_KEY/);
  assert.match(layout, /root\.dataset\.themeColor = themeColor/);
});
