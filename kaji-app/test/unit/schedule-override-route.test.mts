import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("重複追加: addモードの重複登録は統一した409コード/メッセージを返す", () => {
  const route = read("src/app/api/schedule-override/route.ts");

  assert.match(route, /mode === "add"/);
  assert.match(route, /scheduledCount > 0/);
  assert.match(route, /duplicateScheduleConflictResponse\(\)/);
  assert.match(route, /SCHEDULE_OVERRIDE_DUPLICATE/);
  assert.match(route, /その日には同じ家事がすでに登録されています。/);
});

test("重複禁止: Prisma schemaで choreId\+date の一意制約を持つ", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /model ChoreScheduleOverride[\s\S]*@@unique\(\[choreId, date\]\)/);
});

test("並行追加: DBの一意制約衝突\(P2002\)でも統一した409コード/メッセージを返す", () => {
  const route = read("src/app/api/schedule-override/route.ts");

  assert.match(route, /isDuplicateScheduleOverrideError/);
  assert.match(route, /error\.code !== "P2002"/);
  assert.match(route, /if \(isDuplicateScheduleOverrideError\(error\)\) \{\s*return duplicateScheduleConflictResponse\(\);\s*\}/);
});
