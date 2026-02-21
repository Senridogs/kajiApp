import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("重複追加: addモード重複時は409でエラーを返す", () => {
  const route = read("src/app/api/schedule-override/route.ts");

  assert.match(route, /mode === "add"/);
  assert.match(route, /scheduledCount > 0 && !allowDuplicate/);
  assert.match(route, /DUPLICATE_SCHEDULE_MESSAGE/);
  assert.match(route, /return badRequest\(DUPLICATE_SCHEDULE_MESSAGE, 409\)/);
});

test("移動: sourceRecordId 指定時は元日へ pending を再生成しない", () => {
  const route = read("src/app/api/schedule-override/route.ts");

  assert.match(route, /if \(sourceRecordId\)/);
  assert.doesNotMatch(route, /dateKey: sourceRecordDateKey/);
});

test("override 読み取りAPIは legacy table にフォールバックしない", () => {
  const route = read("src/app/api/schedule-overrides/route.ts");

  assert.match(route, /prisma\.choreOccurrence\.findMany/);
  assert.doesNotMatch(route, /choreScheduleOverride/);
});
