import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("schedule override route supports add mode with duplicate guard", () => {
  const route = read("src/app/api/schedule-override/route.ts");
  assert.match(route, /mode === "add"/);
  assert.match(route, /allowDuplicate/);
  assert.match(route, /deleteMany\(\{ where: \{ choreId \} \}\)/);
  assert.match(route, /createMany\(\{/);
  assert.match(route, /DUPLICATE_INDEX_MISMATCH_CODE/);
  assert.match(route, /Cannot add planned occurrence to a past date|過去の日付には予定を追加できません。/);
  assert.match(route, /A matching chore already exists on that date|その日には同じ家事がすでに登録されています。/);
});
