import { spawnSync } from "node:child_process";

const LOCAL_DATABASE_URL = "postgresql://ieApp:ieApp@localhost:5432/kaji_app?schema=public";
const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";

const env = {
  ...process.env,
  DATABASE_URL: LOCAL_DATABASE_URL,
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(NPX_COMMAND, ["prisma", "generate"]);
run(NPX_COMMAND, [
  "prisma",
  "db",
  "execute",
  "--file",
  "scripts/drop-is-big-task-column.sql",
  "--schema",
  "prisma/schema.prisma",
]);
run(NPX_COMMAND, ["prisma", "db", "push", "--skip-generate"]);
run(NPX_COMMAND, [
  "prisma",
  "db",
  "execute",
  "--file",
  "scripts/apply-schedule-override-duplicate-support.sql",
  "--schema",
  "prisma/schema.prisma",
]);
