import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

// Versioned asset URLs (KI-BDS-20261102-001).
//
// Pages load scripts and style sheets from /v/<ASSET_VERSION>/src/{js,styles}/...
// The browser resolves relative module imports and CSS @import against the
// importing file's URL, so every nested file inherits the same prefix without a
// change to the JS or CSS source. A deploy that changes any script or style sheet
// changes the prefix, so no browser or CDN can serve a stale copy.
//
//   bun run tools/assets/version.ts --check   fail if any page carries a stale or missing stamp
//   bun run tools/assets/version.ts --write   rewrite the stamps in place

const ASSET_ROOTS = ["src/js", "src/styles"];
const SKIP_DIRS = new Set([".git", "node_modules", "docs", "doc", "out", "dist", "tests", "tools"]);
// href="src/js/..", href="../src/styles/..", src="/src/js/..", or an already
// stamped "/v/<hash>/src/..". Every form becomes the absolute stamped form.
const ASSET_REF = /(href|src)="(?:\.\.\/|\/)?(?:v\/[0-9a-f]{12}\/)?src\/(js|styles)\//g;

function* walk(dir: string, accept: (path: string) => boolean): Generator<string> {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path, accept);
    } else if (accept(path)) {
      yield path;
    }
  }
}

/** sha256 over every script and style sheet, path and bytes, in a stable order. */
export function computeAssetVersion(root: string): string {
  const hash = createHash("sha256");
  for (const assetRoot of ASSET_ROOTS) {
    for (const file of walk(join(root, assetRoot), (path) => /\.(js|css)$/.test(path))) {
      hash.update(relative(root, file));
      hash.update("\0");
      hash.update(readFileSync(file));
      hash.update("\0");
    }
  }
  return hash.digest("hex").slice(0, 12);
}

export function stampAssetRefs(text: string, version: string): string {
  return text.replace(ASSET_REF, (_match, attr: string, kind: string) => `${attr}="/v/${version}/src/${kind}/`);
}

/** Every file whose asset references carry a stamp: the public pages and the /apps renderer. */
export function stampedFiles(root: string): string[] {
  const pages = [...walk(root, (path) => path.endsWith(".html"))];
  return [...pages, join(root, "server/apps.ts")];
}

if (import.meta.main) {
  const root = process.cwd();
  const write = process.argv.includes("--write");
  const version = computeAssetVersion(root);
  const stale: string[] = [];
  for (const file of stampedFiles(root)) {
    const text = readFileSync(file, "utf8");
    const stamped = stampAssetRefs(text, version);
    if (stamped !== text) {
      stale.push(relative(root, file));
      if (write) writeFileSync(file, stamped);
    }
  }
  if (stale.length > 0 && !write) {
    console.error(`Asset stamps are stale (expected /v/${version}/). Run: bun run tools/assets/version.ts --write`);
    console.error(stale.map((file) => `  ${file}`).join("\n"));
    process.exit(1);
  }
  console.log(
    write
      ? `Asset version ${version}: stamped ${stale.length} file(s).`
      : `Asset version ${version}: every page carries the current stamp.`
  );
}
