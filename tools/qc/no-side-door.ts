import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const allowedFetch = new Set(["server/security/egress.ts"]);
const serverRoot = join(root, "server");
const violations: string[] = [];

for (const file of walk(serverRoot)) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  if (/\bfetch\s*\(/.test(text) && !allowedFetch.has(rel)) {
    violations.push(`${rel}: fetch() is only allowed in server/security/egress.ts`);
  }
  if (/from\s+["'](?:node:)?https["']|from\s+["']undici["']|\bWebSocket\s*\(/.test(text)) {
    violations.push(`${rel}: outbound network primitive outside governed egress`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("No server-side network side doors found.");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      yield* walk(path);
    } else if (path.endsWith(".ts")) {
      yield path;
    }
  }
}
