import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("UI typography follows pencil baseline title sizes", () => {
  const uiParts = read("src/components/kaji/ui-parts.tsx");
  assert.match(uiParts, /ScreenTitle[\s\S]*text-\[26px\]/);
  assert.match(uiParts, /HomeSectionTitle[\s\S]*text-\[22px\]/);
});

test("Main app keeps mobile-first max width shell and fixed bottom navigation", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /max-w-\[430px\]/);
  assert.match(app, /fixed bottom-4 left-0 right-0/);
  assert.match(app, /openAddChore[\s\S]*lastPerformedAt:\s*defaultLastPerformedAt\(\)/);
  assert.match(app, /toJstDateKey\(date\)/);
  assert.doesNotMatch(app, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(app, /open=\{choreEditorOpen && !customIconOpen\}/);
  assert.match(app, /ホーム<\/span>/);
  assert.match(app, /きろく<\/span>/);
  assert.match(app, /カレンダー<\/span>/);
  assert.match(app, /レポート<\/span>/);
  assert.match(app, /「\{undoConfirmTarget.title\}」の完了を/);
});

test("Editor and record sheet follow v2 interaction copy", () => {
  const editor = read("src/components/kaji/chore-editor.tsx");
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(editor, /updateIntervalDays\(-7\)/);
  assert.match(editor, /updateIntervalDays\(7\)/);
  assert.match(editor, /aria-label="interval-days"/);
  assert.match(editor, /開始日 \*/);
  assert.match(editor, /disabled=\{mode === "edit"\}/);
  assert.match(app, /ひとこと（任意）/);
  assert.match(app, /いつやった？/);
  assert.match(app, /やったよ！/);
});
