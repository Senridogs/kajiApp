// PostToolUse hook: .ts/.tsx 編集後に tsc --noEmit を実行
import { execSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = input.tool_input?.file_path || "";

    if (!/\.tsx?$/.test(filePath)) {
      process.exit(0);
    }

    const normalized = filePath.replace(/\\/g, "/");

    // tsconfig.json を上方向に探索してプロジェクトルートを特定
    let dir = dirname(normalized);
    let tsconfigDir = null;
    while (dir !== dirname(dir)) {
      if (existsSync(join(dir, "tsconfig.json"))) {
        tsconfigDir = dir;
        break;
      }
      dir = dirname(dir);
    }

    if (!tsconfigDir) {
      process.exit(0);
    }

    try {
      execSync("npx tsc --noEmit --pretty 2>&1", {
        cwd: tsconfigDir,
        timeout: 30000,
      });
      process.stdout.write("tsc: OK\n");
    } catch (e) {
      const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
      const lines = output.split("\n").slice(0, 20).join("\n");
      process.stdout.write(lines + "\n");
    }
  } catch (err) {
    process.stdout.write("[tsc-hook] parse error: " + err.message + "\n");
  }
});
