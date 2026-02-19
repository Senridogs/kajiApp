import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("kaji-app uses shared confirm dialog copy for confirmation flows", () => {
  const app = read("src/components/kaji/kaji-app.tsx");

  assert.match(app, /<ConfirmDialog/);
  assert.match(app, /mergeDuplicateDialogCopy/);
  assert.match(app, /rescheduleConfirmDialogCopy/);
  assert.match(app, /undoRecordDialogCopy/);
  assert.match(app, /deleteChoreDialogCopy/);
  assert.doesNotMatch(app, />\s*OK\s*</);
});

test("primary editor and bottom-sheet actions use ActionButton", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  const editor = read("src/components/kaji/chore-editor.tsx");

  assert.match(app, /ActionButton[\s\S]*やったよ！/);
  assert.match(app, /ActionButton[\s\S]*スキップ/);
  assert.match(app, /ActionButton[\s\S]*この日に変更/);
  assert.match(editor, /ActionButton[\s\S]*家事を追加/);
  assert.match(editor, /ActionButton[\s\S]*家事を削除/);
});
