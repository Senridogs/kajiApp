import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const relative = specifier.slice(2);
  const base = path.join(projectRoot, "src", relative);

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];

  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(`Cannot resolve alias: ${specifier}`);
  }
  return pathToFileURL(file).href;
}

export async function resolve(specifier, context, nextResolve) {
  const resolvedAlias = resolveAlias(specifier);
  if (resolvedAlias) {
    return nextResolve(resolvedAlias, context);
  }

  // Rewrite .js → .ts/.tsx for relative/absolute file imports
  if (specifier.endsWith(".js")) {
    const parentURL = context.parentURL;
    if (parentURL) {
      const parentDir = path.dirname(fileURLToPath(parentURL));
      const resolved = path.resolve(parentDir, specifier);
      const base = resolved.slice(0, -3); // strip .js
      const tsCandidates = [`${base}.ts`, `${base}.tsx`];
      const tsFile = tsCandidates.find((c) => fs.existsSync(c));
      if (tsFile) {
        return nextResolve(pathToFileURL(tsFile).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
