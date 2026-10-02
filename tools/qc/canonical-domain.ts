import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// BDS-WEB-PR-v0.1 CP1: the canonical website host is bds-digitalsolutions.com.
// The former website host must not reappear as a web URL or allowlisted host.
// Email addresses on the former domain (charlesboswell@…, mailto: values) are
// still valid business mail and are exempt: a host preceded by "@" is a mailbox.
export const CANONICAL_HOST = "bds-digitalsolutions.com";
const FORMER_HOST = /(?<![@\w.-])(?:www\.)?boswelldigitalsolutions\.com/g;

// Never served and allowed to quote the former domain as history.
const SKIP_DIRS = new Set([".git", "node_modules", "docs", "out", "dist"]);
const SCANNED = /\.(html|ts|js|txt|yaml|yml|json|xml|css)$/;

export function findFormerDomainWebRefs(text: string): string[] {
  return text.match(FORMER_HOST) ?? [];
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (SCANNED.test(path) && !path.endsWith("canonical-domain.ts")) {
      yield path;
    }
  }
}

if (import.meta.main) {
  const root = process.cwd();
  const violations: string[] = [];
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (findFormerDomainWebRefs(line).length > 0) {
        violations.push(`${relative(root, file)}:${index + 1}: former website host; use ${CANONICAL_HOST}`);
      }
    });
  }
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log(`Canonical website host is ${CANONICAL_HOST}; no former-host web references.`);
}
