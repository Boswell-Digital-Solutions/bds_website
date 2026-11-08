import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServerResponse } from "node:http";

import { securityHeaders } from "./security/http.ts";
import { resolvePublicFile } from "./security/publication.ts";

// Sales launch switch (operator decision, 2026-11-08).
//
// While SALES_OPEN is false, every app-sales surface serves
// under-construction.html instead of its own page: the product and AuthorForge
// pages, the store and pricing pages, the /apps catalog, and the sign-in,
// account, and checkout pages. The rest of the site stays open. The original
// pages stay in the repository unchanged.
//
// To roll out: set SALES_OPEN to true, add the sales URLs back to sitemap.xml,
// and set PURCHASES_OPEN (src/js/forge/pricing.js) and CHECKOUT_OPEN
// (server/forge.ts) when checkout opens. See doc/system/05-page-inventory.md.
export const SALES_OPEN = false;

export const UNDER_CONSTRUCTION_PAGE = "under-construction.html";

/** Resolved files that belong to the app-sales surface. */
export const SALES_FILES = new Set([
  "account.html",
  "account/closed.html",
  "account/suspended.html",
  "authorforge.html",
  "authorforge-cost-comparison.html",
  "authorforge-founder.html",
  "checkout/cancel.html",
  "checkout/success.html",
  "login.html",
  "pricing.html",
  "products.html",
  "store.html",
]);

/** True when the request path belongs to the app-sales surface (open or not). */
export function isSalesPath(rootDir: string, pathname: string): boolean {
  if (pathname === "/apps" || pathname === "/apps/" || pathname.startsWith("/apps/")) {
    return true;
  }
  try {
    return SALES_FILES.has(resolvePublicFile(rootDir, pathname).relativePath);
  } catch {
    return false;
  }
}

/** True when the request must get the under-construction page instead. */
export function isUnderConstruction(rootDir: string, pathname: string): boolean {
  return !SALES_OPEN && isSalesPath(rootDir, pathname);
}

/**
 * Serve the under-construction page at the requested URL. Status 200 with
 * noindex, so links keep working and search engines do not index the
 * placeholder.
 */
export async function sendUnderConstruction(
  response: ServerResponse,
  method: string,
  rootDir: string
): Promise<void> {
  const body = await readFile(join(rootDir, UNDER_CONSTRUCTION_PAGE));
  response.writeHead(200, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "content-length": String(body.byteLength),
      "x-robots-tag": "noindex",
    }),
  });
  response.end(method === "HEAD" ? undefined : body);
}
