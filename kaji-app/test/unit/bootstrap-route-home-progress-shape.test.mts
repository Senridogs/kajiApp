import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("bootstrap route homeProgressByDate entry shape matches HomeProgressEntry", () => {
  const bootstrapRoute = read("src/app/api/bootstrap/route.ts");
  const typesFile = read("src/lib/types.ts");

  assert.match(typesFile, /export type HomeProgressEntry = \{[\s\S]*scheduledTotal: number;[\s\S]*pendingTotal: number;[\s\S]*completed: number;[\s\S]*skipped: number;[\s\S]*pending: number;[\s\S]*latestState: HomeProgressState;[\s\S]*\};/);

  assert.match(bootstrapRoute, /scheduledTotal:\s*entry\.scheduled/);
  assert.match(bootstrapRoute, /pendingTotal:\s*entry\.pending/);
  assert.match(bootstrapRoute, /completed:\s*entry\.completed/);
  assert.match(bootstrapRoute, /skipped:\s*entry\.skipped/);
  assert.match(bootstrapRoute, /pending:\s*entry\.pending/);
  assert.match(bootstrapRoute, /latestState:/);
  assert.doesNotMatch(bootstrapRoute, /\btotal:\s*entry\.scheduled/);
});
