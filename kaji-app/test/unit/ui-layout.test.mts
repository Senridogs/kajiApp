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

test("Main app keeps mobile-first shell and editor sheet behavior", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /max-w-\[430px\]/);
  assert.match(app, /fixed bottom-4 left-0 right-0 z-\[76\]/);
  assert.match(app, /fixed bottom-0 left-0 right-0 z-\[74\]/);
  assert.match(app, /fixed inset-0 z-\[70\][\s\S]*h-full overflow-y-auto px-4 pb-24 pt-6/);
  assert.match(app, /fixed inset-0 z-\[75\] bg-\[#F8F9FA\][\s\S]*mx-auto h-full w-full max-w-\[430px\] overflow-y-auto px-5 pb-24 pt-5/);
  assert.match(app, /openAddChore[\s\S]*lastPerformedAt:\s*defaultLastPerformedAt\(\)/);
  assert.match(app, /toJstDateKey\(date\)/);
  assert.doesNotMatch(app, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(app, /open=\{choreEditorOpen && !customIconOpen\}/);
});

test("Stats header account icon opens settings and keeps single my-report CTA transition", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  const myReportFromStats = app.match(/openStandaloneScreen\("my-report", "stats"\)/g) ?? [];

  assert.equal(myReportFromStats.length, 1);
  assert.doesNotMatch(app, /aria-label="\u79C1\u306E\u30EC\u30DD\u30FC\u30C8\u3092\u958B\u304F"/);
  assert.match(app, /onClick=\{\(\) => \{[\s\S]*closeAssignment\(\);[\s\S]*openSettings\(\);[\s\S]*\}\}[\s\S]*aria-label="\u8A2D\u5B9A\u3092\u958B\u304F"/);
});

test("Records and settings include my-records standalone transitions", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  const myRecordsFromRecords = app.match(/openStandaloneScreen\("my-records", "records"\)/g) ?? [];
  const myRecordsFromSettings = app.match(/openStandaloneScreen\("my-records"\)/g) ?? [];

  assert.equal(myRecordsFromRecords.length, 1);
  assert.equal(myRecordsFromSettings.length, 1);
  assert.match(app, /if \(origin === "records"\)[\s\S]*setActiveTab\("records"\);/);
  assert.equal((app.match(/openStandaloneScreen\("my-report", "stats"\)/g) ?? []).length, 1);
});

test("Home order retention and calendar order wiring remain in place", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /HOME_ORDER_RETENTION_DAYS = 120/);
  assert.match(app, /rollingWindowDays:\s*HOME_ORDER_RETENTION_DAYS/);
  assert.match(app, /calendarSelectedWeekEntries[\s\S]*applyHomeStoredOrder/);
});

test("Optimistic completion marks initial flag false to avoid temporary disappearance", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /submitMemoAction[\s\S]*lastRecordIsInitial:\s*false/);
});

test("Editor interaction keeps interval controls", () => {
  const editor = read("src/components/kaji/chore-editor.tsx");
  assert.match(editor, /updateIntervalDays\(-7\)/);
  assert.match(editor, /updateIntervalDays\(7\)/);
  assert.match(editor, /aria-label="interval-days"/);
  assert.match(editor, /disabled=\{mode === "edit"\}/);
});

test("BottomSheet stays above standalone manage screen", () => {
  const sheet = read("src/components/kaji/bottom-sheet.tsx");
  assert.match(sheet, /z-\[80\]/);
  assert.match(sheet, /z-\[85\]/);
});

test("Manage screen has detail flow and upcoming schedule section", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /manageDetailChoreId/);
  assert.match(app, /openManageDetail/);
  assert.match(app, /manageUpcomingDateKeys/);
  assert.match(app, /formatDateKeyMonthDayWeekday/);
  assert.match(app, /manageUpcomingDateKeys\.map\(\(dateKey, index\) => \([\s\S]*openReschedule\(manageDetailTarget,\s*dateKey\)/);
  assert.match(app, /planned-\$\{dateKey\}-\$\{index\}/);
});
