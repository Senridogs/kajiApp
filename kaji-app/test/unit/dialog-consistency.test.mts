import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("confirm flows are routed through shared ConfirmDialog", () => {
  const app = read("src/components/kaji/kaji-app.tsx");

  assert.match(app, /<ConfirmDialog/);
  assert.match(app, /recordDateChoiceDialogCopy/);
  assert.match(app, /rescheduleConfirmDialogCopy/);
  assert.match(app, /undoRecordDialogCopy/);
  assert.match(app, /deleteChoreDialogCopy/);
  assert.match(app, /infoDialogCopy/);

  assert.doesNotMatch(app, />\s*OK\s*</i);
  assert.doesNotMatch(app, />\s*NO\s*</i);
});

test("dialog copy avoids vague English labels and keeps explicit Japanese actions", () => {
  const copy = read("src/components/kaji/dialog-copy.ts");

  assert.doesNotMatch(copy, /\bMerge\b|\bDelete\b|\bCancel\b|\bClose\b|\bUndo\b/i);
  assert.match(copy, /confirmLabel:\s*".*\\u524a\\u9664\\u3059\\u308b"/);
  assert.match(copy, /confirmLabel:\s*".*\\u53d6\\u308a\\u6d88\\u3059"/);
  assert.match(copy, /confirmLabel:\s*".*\\u5f8c\\u7d9a\\u3082\\u5909\\u66f4"/);
  assert.match(copy, /confirmLabel:\s*".*\\u5bfe\\u8c61\\u65e5\\u3067\\u8a18\\u9332"/);
  assert.match(copy, /cancelLabel:\s*".*\\u3053\\u306e\\u65e5\\u3060\\u3051\\u5909\\u66f4"/);
});

test("bottom-sheet primary actions use ActionButton", () => {
  const app = read("src/components/kaji/kaji-app.tsx");

  assert.match(app, /<ActionButton[\s\S]*onClick=\{submitRecord\}/);
  assert.match(app, /<ActionButton[\s\S]*onClick=\{submitSkip\}/);
  assert.match(app, /<ActionButton[\s\S]*void applyReschedule\(\)/);
});
