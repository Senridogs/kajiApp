import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "test", "prisma"];
const TARGET_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".prisma",
  ".yml",
  ".yaml",
  ".svg",
]);

const replacementCharPattern = /\uFFFD/;
const mojibakePattern = /(?:縺|繧|髫|邵|驍|鬮|蟶|譛|險|貂|蜑|蜈|螟|遶)/;

function walk(dirPath, files) {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (!TARGET_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

const files = [];
for (const root of ROOTS) {
  walk(path.resolve(process.cwd(), root), files);
}

const findings = [];
for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!replacementCharPattern.test(line) && !mojibakePattern.test(line)) return;
    findings.push({
      file: path.relative(process.cwd(), filePath),
      line: index + 1,
      text: line.trim().slice(0, 160),
    });
  });
}

if (findings.length > 0) {
  console.error("Detected potential mojibake:");
  for (const finding of findings) {
    console.error(`${toPosixPath(finding.file)}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.log("No mojibake patterns detected.");
