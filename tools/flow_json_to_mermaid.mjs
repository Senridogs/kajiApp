import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "screen_flow_ai.json";
const outputPath = process.argv[3] ?? "screen_flow_ai_diagram.md";
const outputMmdPath = process.argv[4] ?? "screen_flow_ai_diagram.mmd";

const absInput = path.resolve(inputPath);
const absOutput = path.resolve(outputPath);
const absOutputMmd = path.resolve(outputMmdPath);

const raw = fs.readFileSync(absInput, "utf8");
const data = JSON.parse(raw);

const nodes = Array.isArray(data.nodes) ? data.nodes : [];
const edges = Array.isArray(data.edges_explicit) ? data.edges_explicit : [];

const groupOrder = [
  "main",
  "settings",
  "calendar_detail",
  "actions",
  "detail"
];

const groups = new Map();
for (const n of nodes) {
  const g = n.group ?? "other";
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(n);
}

function safeId(input) {
  return String(input).replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeLabel(input) {
  return String(input).replace(/"/g, '\\"');
}

const keyToMermaidId = new Map();
const usedIds = new Set();

for (const n of nodes) {
  const base = safeId(n.key ?? n.id);
  let candidate = base || `node_${safeId(n.id)}`;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  usedIds.add(candidate);
  keyToMermaidId.set(n.key, candidate);
}

const lines = [];
lines.push("# 画面遷移図（Mermaid）");
lines.push("");
lines.push("```mermaid");
lines.push("flowchart LR");

const mmdLines = [];
mmdLines.push("flowchart LR");

const orderedGroups = [
  ...groupOrder.filter((g) => groups.has(g)),
  ...[...groups.keys()].filter((g) => !groupOrder.includes(g))
];

for (const group of orderedGroups) {
  const items = groups.get(group) ?? [];
  const title = escapeLabel(group);
  lines.push(`  subgraph ${safeId(group)}["${title}"]`);
  mmdLines.push(`  subgraph ${safeId(group)}["${title}"]`);
  for (const n of items) {
    const mid = keyToMermaidId.get(n.key);
    const label = escapeLabel(`${n.label} (${n.id})`);
    lines.push(`    ${mid}["${label}"]`);
    mmdLines.push(`    ${mid}["${label}"]`);
  }
  lines.push("  end");
  mmdLines.push("  end");
}

for (const e of edges) {
  const from = keyToMermaidId.get(e.from);
  const to = keyToMermaidId.get(e.to);
  if (!from || !to) continue;
  const conf = typeof e.confidence === "number" ? `|${e.confidence}|` : "";
  lines.push(`  ${from} -->${conf} ${to}`);
  mmdLines.push(`  ${from} -->${conf} ${to}`);
}

lines.push("```");
lines.push("");
lines.push("## 補足");
lines.push("");
lines.push("- 元データ: `screen_flow_ai.json`");
lines.push("- 自動生成: `node tools/flow_json_to_mermaid.mjs`");

fs.writeFileSync(absOutput, `${lines.join("\n")}\n`, "utf8");
fs.writeFileSync(absOutputMmd, `${mmdLines.join("\n")}\n`, "utf8");
console.log(`Generated: ${absOutput}`);
console.log(`Generated: ${absOutputMmd}`);
