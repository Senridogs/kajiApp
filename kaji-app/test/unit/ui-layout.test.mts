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
  assert.match(app, /fixed inset-0 z-\[75\] bg-\[var\(--app-canvas\)\][\s\S]*mx-auto h-full w-full max-w-\[430px\] overflow-y-auto px-5 pb-24 pt-5/);
  assert.match(app, /openAddChore[\s\S]*lastPerformedAt:\s*defaultLastPerformedAt\(\)/);
  assert.match(app, /const createPayload = \{[\s\S]*startDate:\s*editingChore\.lastPerformedAt \?\? undefined/);
  const onboardingAddBlock =
    app.match(/const handleOnboardingAddPreset = useCallback\([\s\S]*?\n  \}, \[onboardingPresetSelections, onboardingSubmitting, refreshAll\]\);/)?.[0] ?? "";
  assert.match(onboardingAddBlock, /startDate/);
  assert.doesNotMatch(onboardingAddBlock, /lastPerformedAt/);
  assert.match(app, /toJstDateKey\(date\)/);
  assert.doesNotMatch(app, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(app, /open=\{choreEditorOpen && !customIconOpen\}/);
});

test("Stats header account icon toggles settings and keeps single my-report CTA transition", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  const myReportFromStats = app.match(/openStandaloneScreen\("my-report", "stats"\)/g) ?? [];

  assert.equal(myReportFromStats.length, 1);
  assert.doesNotMatch(app, /aria-label="\u79C1\u306E\u30EC\u30DD\u30FC\u30C8\u3092\u958B\u304F"/);
  assert.match(app, /const toggleSettingsFromHeader = useCallback\([\s\S]*if \(settingsOpen\) \{[\s\S]*closeSettings\(\);[\s\S]*openSettings\(\);/);
  assert.match(app, /onClick=\{toggleSettingsFromHeader\}[\s\S]*aria-label=\{settingsOpen \? "\u8A2D\u5B9A\u3092\u9589\u3058\u308B" : "\u8A2D\u5B9A\u3092\u958B\u304F"\}/);
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
  assert.match(app, /HOME_ORDER_RETENTION_DAYS = 7/);
  assert.match(app, /rollingWindowDays:\s*HOME_ORDER_RETENTION_DAYS/);
  assert.match(app, /calendarSelectedWeekEntries[\s\S]*applyHomeStoredOrder/);
});

test("Calendar week navigation and swipe scope are wired to calendar mode", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /const shiftCalendarWeek = useCallback/);
  assert.match(app, /focusCalendarDate\(toJstDateKey\(addDays\(calendarWeekStart,\s*direction \* CALENDAR_WEEK_DAYS\)\)\)/);
  assert.match(app, /if \(calendarExpanded\) \{[\s\S]*shiftCalendarMonth\(-1\);[\s\S]*shiftCalendarWeek\(-1\);/);
  assert.match(app, /if \(calendarExpanded\) \{[\s\S]*shiftCalendarMonth\(1\);[\s\S]*shiftCalendarWeek\(1\);/);
  assert.match(app, /aria-label=\{calendarExpanded \? "前月へ" : "前週へ"\}/);
  assert.match(app, /aria-label=\{calendarExpanded \? "次月へ" : "次週へ"\}/);
  assert.match(app, /className="space-y-1 rounded-\[16px\][\s\S]*onTouchStart=\{handleCalendarTouchStart\}[\s\S]*onTouchEnd=\{handleCalendarTouchEnd\}/);
  assert.match(app, /className="rounded-\[14px\][\s\S]*onTouchStart=\{handleCalendarTouchStart\}[\s\S]*onTouchEnd=\{handleCalendarTouchEnd\}/);
  assert.doesNotMatch(app, /style=\{\{ paddingTop: listHeaderHeight \}\} onTouchStart=\{handleCalendarTouchStart\}/);
});

test("Section-level swipe defers to calendar and pull-to-refresh gestures", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /const sectionSwipeSuppressedRef = useRef\(false\)/);
  assert.match(app, /const isCalendarSurface =[\s\S]*closest\("\[data-calendar-swipe-surface='true'\]"\)/);
  assert.match(app, /if \(sectionSwipeSuppressedRef\.current\) return;/);
  assert.match(app, /if \(pullEligibleRef\.current && isDownwardPull\) \{[\s\S]*sectionSwipeSuppressedRef\.current = true;[\s\S]*swipe\.onTouchCancel\(\);/);
  assert.match(app, /data-calendar-swipe-surface="true"/);
});



test("Optimistic completion marks initial flag false to avoid temporary disappearance", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /submitMemoAction[\s\S]*lastRecordIsInitial:\s*false/);
});

test("Calendar blank tap opens action sheet and quick record buttons", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /handleCalendarSurfaceTap[\s\S]*setCalendarBlankActionOpen\(true\)/);
  assert.match(app, /calendarBlankActionMode === "record"/);
  assert.match(app, /完了にする/);
  assert.match(app, /予定を登録/);
  assert.match(app, /memoFlowMode === "calendar-quick"/);
  assert.match(app, /submitCalendarQuickCompletion[\s\S]*sourceDate = dateKey/);
});

test("Editor interaction keeps interval controls", () => {
  const editor = read("src/components/kaji/chore-editor.tsx");
  assert.match(editor, /updateIntervalDays\(-7\)/);
  assert.match(editor, /updateIntervalDays\(7\)/);
  assert.match(editor, /updateDailyTargetCount\(-1\)/);
  assert.match(editor, /updateDailyTargetCount\(1\)/);
  assert.match(editor, /aria-label="daily-target-count"/);
  assert.match(editor, /aria-label="(interval-days|リマインド間隔（日数）)"/);
  assert.match(editor, /disabled=\{mode === "edit"\}/);
});

test("Skip count dialog wiring exists on memo flow", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /skipCountDialogOpen/);
  assert.match(app, /memoPendingCount/);
  assert.match(app, /confirmSkipWithCount/);
  assert.match(app, /skipCount/);
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

test("Completion date choice dialog is wired for non-today record only", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /pendingRecordDateChoice/);
  assert.match(app, /recordDateChoiceDialogCopy/);
  assert.match(app, /if \(memoTarget && memoBaseDateKey && memoBaseDateKey !== todayDateKey\)[\s\S]*setPendingRecordDateChoice/);
  assert.match(app, /submitRecordWithCountChoice\("source"\)/);
  assert.match(app, /submitRecordWithCountChoice\("today"\)/);
  assert.match(app, /submitSkip[\s\S]*setSkipCountDialogOpen\(true\)/);
});

test("Reschedule confirmation is centralized for drag and sheet flows", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /const resolveSourceRecordIdForDate = useCallback/);
  assert.match(app, /applyReschedule[\s\S]*sourceRecordId[\s\S]*openRescheduleConfirmWithCollisionCheck/);
  assert.match(app, /dropDraggedChoreToDate[\s\S]*sourceRecordId[\s\S]*openRescheduleConfirmWithCollisionCheck/);
  const dropDraggedChoreToDateBlock = app.match(/const dropDraggedChoreToDate = useCallback[\s\S]*?\n  \}, \[/)?.[0] ?? "";
  assert.match(dropDraggedChoreToDateBlock, /openRescheduleConfirmWithCollisionCheck/);
  assert.doesNotMatch(dropDraggedChoreToDateBlock, /await rescheduleChoreToDate\(/);
});

test("Reschedule sheet header exposes chore edit action", () => {
  const app = read("src/components/kaji/kaji-app.tsx");
  assert.match(app, /const openRescheduleEditChore = \(\) => \{/);
  assert.match(app, /if \(!rescheduleTarget\) return;[\s\S]*const target = rescheduleTarget;/);
  assert.match(app, /setRescheduleOpen\(false\);[\s\S]*setRescheduleTarget\(null\);[\s\S]*openEditChore\(target/);
  assert.match(app, /aria-label="家事を編集"/);
  assert.match(app, /家事を編集/);
});


