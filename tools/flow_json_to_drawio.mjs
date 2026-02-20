import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "screen_flow_ai.json";
const outputPath = process.argv[3] ?? "screen_flow_ai.drawio";

const absInput = path.resolve(inputPath);
const absOutput = path.resolve(outputPath);

const data = JSON.parse(fs.readFileSync(absInput, "utf8"));
const nodes = Array.isArray(data.nodes) ? data.nodes : [];
const edges = Array.isArray(data.edges_explicit) ? data.edges_explicit : [];

const offsetX = 24;
const offsetY = 24;
const boxW = 140;
const boxH = 48;
const xStep = 160;
const yStep = 104;

const groupStyle = {
  main: "rounded=1;whiteSpace=wrap;html=0;fillColor=#E1F0FF;strokeColor=#4F81BD;fontSize=11;",
  settings:
    "rounded=1;whiteSpace=wrap;html=0;fillColor=#E9F7E9;strokeColor=#82B366;fontSize=11;",
  calendar_detail:
    "rounded=1;whiteSpace=wrap;html=0;fillColor=#FFF2CC;strokeColor=#D6B656;fontSize=11;",
  actions:
    "rounded=1;whiteSpace=wrap;html=0;fillColor=#F8E8FF;strokeColor=#9673A6;fontSize=11;",
  detail:
    "rounded=1;whiteSpace=wrap;html=0;fillColor=#F5F5F5;strokeColor=#999999;fontSize=11;"
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normId(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, "_");
}

function splitByVisualLen(input, maxLen) {
  const chars = [...String(input)];
  const lines = [];
  let buf = "";
  let len = 0;
  for (const ch of chars) {
    const w = /[ -~]/.test(ch) ? 1 : 2;
    if (len + w > maxLen && buf.length > 0) {
      lines.push(buf);
      buf = ch;
      len = w;
      continue;
    }
    buf += ch;
    len += w;
  }
  if (buf.length > 0) lines.push(buf);
  return lines;
}

function compactWrappedLabel(label) {
  const text = String(label).trim().replace(/\s+/g, "");
  // Prefer natural split before parenthetical notes.
  const natural = text
    .replace(/（/g, "\n（")
    .replace(/\(/g, "\n(")
    .replace(/・/g, "・\n");
  if (natural.includes("\n")) return natural;
  return splitByVisualLen(text, 12).join("\n");
}

const xValues = [...new Set(nodes.map((n) => Number(n.x ?? 0)))].sort((a, b) => a - b);
const yValues = [...new Set(nodes.map((n) => Number(n.y ?? 0)))].sort((a, b) => a - b);
const xIndex = new Map(xValues.map((v, i) => [v, i]));
const yIndex = new Map(yValues.map((v, i) => [v, i]));
const collisionCount = new Map();

const nodeIdByKey = new Map();
const nodeCells = [];

for (const n of nodes) {
  const key = n.key ?? n.id;
  const cellId = `n_${normId(key)}`;
  nodeIdByKey.set(key, cellId);

  const col = xIndex.get(Number(n.x ?? 0)) ?? 0;
  const row = yIndex.get(Number(n.y ?? 0)) ?? 0;
  const collisionKey = `${col}_${row}`;
  const collision = collisionCount.get(collisionKey) ?? 0;
  collisionCount.set(collisionKey, collision + 1);

  const x = offsetX + col * xStep;
  const y = offsetY + row * yStep + collision * 54;
  const style = groupStyle[n.group] ?? groupStyle.detail;
  const label = compactWrappedLabel(n.label);
  const escapedLabel = esc(label).replace(/\n/g, "&#10;");

  nodeCells.push(
    `        <mxCell id="${esc(cellId)}" value="${escapedLabel}" style="${esc(
      style
    )}" vertex="1" parent="1">`,
    `          <mxGeometry x="${x}" y="${y}" width="${boxW}" height="${boxH}" as="geometry"/>`,
    "        </mxCell>"
  );
}

const edgeCells = [];
let edgeIndex = 1;
for (const e of edges) {
  const source = nodeIdByKey.get(e.from);
  const target = nodeIdByKey.get(e.to);
  if (!source || !target) continue;
  const edgeId = `e_${edgeIndex++}`;
  const style =
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=0;endArrow=block;strokeWidth=1.2;";

  edgeCells.push(
    `        <mxCell id="${esc(edgeId)}" value="" style="${esc(
      style
    )}" edge="1" parent="1" source="${esc(source)}" target="${esc(target)}">`,
    "          <mxGeometry relative=\"1\" as=\"geometry\"/>",
    "        </mxCell>"
  );
}

const xml = [
  "<mxfile host=\"app.diagrams.net\" modified=\"2026-02-18T00:00:00.000Z\" agent=\"codex\" version=\"24.7.0\" type=\"device\">",
  "  <diagram id=\"flow-ai\" name=\"Flow\">",
  "    <mxGraphModel dx=\"1920\" dy=\"1080\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"1920\" pageHeight=\"1080\" math=\"0\" shadow=\"0\">",
  "      <root>",
  "        <mxCell id=\"0\"/>",
  "        <mxCell id=\"1\" parent=\"0\"/>",
  ...nodeCells,
  ...edgeCells,
  "      </root>",
  "    </mxGraphModel>",
  "  </diagram>",
  "</mxfile>",
  ""
].join("\n");

fs.writeFileSync(absOutput, xml, "utf8");
console.log(`Generated: ${absOutput}`);
