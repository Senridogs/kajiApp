import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "screen_flow_ai.drawio";
const outputPath = process.argv[3] ?? "screen_flow_ai_diagram.mmd";

const absInput = path.resolve(inputPath);
const absOutput = path.resolve(outputPath);

const xml = fs.readFileSync(absInput, "utf8");

function decodeXml(str = "") {
  return str
    .replace(/&#xa;/gi, "\n")
    .replace(/&#10;/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(tagText) {
  const attrs = {};
  const re = /([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tagText)) !== null) {
    attrs[m[1]] = decodeXml(m[2]);
  }
  return attrs;
}

const cells = [];
const cellRe = /<mxCell\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
let m;
while ((m = cellRe.exec(xml)) !== null) {
  const attrs = parseAttrs(m[1] ?? "");
  if (!attrs.id) continue;
  cells.push(attrs);
}

const nodes = cells.filter((c) => c.vertex === "1" && c.id !== "0" && c.id !== "1");
const nodeIdSet = new Set(nodes.map((n) => n.id));
const edges = cells.filter(
  (c) =>
    c.edge === "1" &&
    typeof c.source === "string" &&
    typeof c.target === "string" &&
    nodeIdSet.has(c.source) &&
    nodeIdSet.has(c.target)
);

function escLabel(s = "") {
  return String(s).replace(/"/g, '\\"').replace(/\n/g, "<br/>");
}

function fallbackLabel(id) {
  // n_main_register -> main register
  return id
    .replace(/^n_/, "")
    .replace(/^e_/, "")
    .replace(/_/g, " ")
    .trim();
}

function cleanId(id) {
  let out = String(id).replace(/[^A-Za-z0-9_]/g, "_");
  if (!out) out = "node";
  if (!/^[A-Za-z_]/.test(out)) out = `n_${out}`;
  return out;
}

const idMap = new Map();
const used = new Set();
for (const n of nodes) {
  const base = cleanId(n.id) || "node";
  let next = base;
  let idx = 2;
  while (used.has(next)) {
    next = `${base}_${idx++}`;
  }
  used.add(next);
  idMap.set(n.id, next);
}

const lines = [];
lines.push("flowchart LR");

for (const n of nodes) {
  const id = idMap.get(n.id);
  const raw = (n.value ?? "").trim();
  const label = raw.length > 0 ? raw : fallbackLabel(n.id);
  lines.push(`  ${id}["${escLabel(label)}"]`);
}

for (const e of edges) {
  const from = idMap.get(e.source);
  const to = idMap.get(e.target);
  if (!from || !to) continue;
  const edgeLabel = (e.value ?? "").trim();
  if (edgeLabel) {
    lines.push(`  ${from} -->|${escLabel(edgeLabel)}| ${to}`);
  } else {
    lines.push(`  ${from} --> ${to}`);
  }
}

fs.writeFileSync(absOutput, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated: ${absOutput}`);
console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`);
