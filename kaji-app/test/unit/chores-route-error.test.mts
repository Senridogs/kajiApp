import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("create/update chore routes expose DB_SCHEMA_MISSING for schema mismatch", () => {
  const createRoute = read("src/app/api/chores/route.ts");
  const updateRoute = read("src/app/api/chores/[id]/route.ts");

  assert.match(createRoute, /DB_SCHEMA_MISSING/);
  assert.match(updateRoute, /DB_SCHEMA_MISSING/);
  assert.match(createRoute, /P2021|P2022/);
  assert.match(updateRoute, /P2021|P2022/);
  assert.match(createRoute, /db:init:current-env/);
  assert.match(updateRoute, /db:init:current-env/);
});
