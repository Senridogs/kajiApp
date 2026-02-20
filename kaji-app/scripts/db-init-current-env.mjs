import { spawnSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL ?? "";

if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const isLocal =
  dbUrl.includes("localhost") ||
  dbUrl.includes("127.0.0.1") ||
  dbUrl.includes("host.docker.internal");

if (!isLocal && process.env.ALLOW_NON_LOCAL_DB_INIT !== "1") {
  console.error("Refusing to run db:init:current-env against non-local DATABASE_URL.");
  console.error("If this is intentional, set ALLOW_NON_LOCAL_DB_INIT=1 and rerun.");
  process.exit(1);
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const run = (args) => {
  const result = spawnSync(npxCommand, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(["prisma", "generate"]);
run(["prisma", "db", "push", "--skip-generate"]);
run([
  "prisma",
  "db",
  "execute",
  "--file",
  "scripts/apply-schedule-override-duplicate-support.sql",
  "--schema",
  "prisma/schema.prisma",
]);
