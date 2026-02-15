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
  assert.match(app, /BottomSheet open=\{choreEditorOpen && !customIconOpen\}/);
  assert.match(app, /type ListSortKey = "kana" \| "status" \| "due"/);
  assert.match(app, /const LIST_SORT_ITEMS:/);
});

test("Stats custom range keeps responsive layout classes", () => {
  const stats = read("src/components/kaji/stats-view.tsx");
  assert.match(stats, /sm:grid-cols-\[1fr_auto_1fr_auto\]/);
  assert.match(stats, /text-\[14px\] font-bold text-\[#202124\]\">カスタム期間/);
});
