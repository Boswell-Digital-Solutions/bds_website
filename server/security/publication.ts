import { join, normalize } from "node:path";

import { HttpError } from "./http.ts";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const PUBLIC_ROUTES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/about.html", "about.html"],
  ["/account.html", "account.html"],
  ["/account/closed.html", "account/closed.html"],
  ["/account/suspended.html", "account/suspended.html"],
  ["/architecture.html", "architecture.html"],
  ["/authorforge.html", "authorforge.html"],
  ["/authorforge-cost-comparison.html", "authorforge-cost-comparison.html"],
  ["/authorforge-founder.html", "authorforge-founder.html"],
  ["/checkout/cancel.html", "checkout/cancel.html"],
  ["/checkout/success.html", "checkout/success.html"],
  ["/contact.html", "contact.html"],
  ["/favicon.svg", "favicon.svg"],
  ["/forge.html", "forge.html"],
  ["/founder.html", "founder.html"],
  ["/legal/ecosystem.html", "legal/ecosystem.html"],
  ["/legal/eula.html", "legal/eula.html"],
  ["/legal/privacy.html", "legal/privacy.html"],
  ["/legal/refund.html", "legal/refund.html"],
  ["/legal/terms.html", "legal/terms.html"],
  ["/login.html", "login.html"],
  ["/meet-smith.html", "meet-smith.html"],
  ["/pricing.html", "pricing.html"],
  ["/products.html", "products.html"],
  ["/security.html", "security.html"],
  ["/services.html", "services.html"],
  ["/store.html", "store.html"],
  ["/white-papers", "white-papers/index.html"],
  ["/white-papers/", "white-papers/index.html"],
  ["/white-papers/index.html", "white-papers/index.html"],
  ["/.well-known/security.txt", ".well-known/security.txt"],
]);

const PUBLIC_WHITE_PAPERS = new Map([
  [
    "/white-papers/Forge_White_Paper_AI_Accountability.docx",
    "white-papers/Forge_White_Paper_AI_Accountability.docx",
  ],
  [
    "/white-papers/Forge_White_Paper_Academic_v2.docx",
    "white-papers/Forge_White_Paper_Academic_v2.docx",
  ],
  [
    "/white-papers/Leopold Ecology Stack - Source-locked Research Justification.docx",
    "white-papers/Leopold Ecology Stack — Source-locked Research Justification.docx",
  ],
  [
    "/white-papers/Leopold Ecology Stack — Source-locked Research Justification.docx",
    "white-papers/Leopold Ecology Stack — Source-locked Research Justification.docx",
  ],
  [
    "/white-papers/Leopold_Complete_Technical_Specification.docx",
    "white-papers/Leopold_Complete_Technical_Specification.docx",
  ],
  [
    "/white-papers/Leopold_Research_Validation_Analysis.docx",
    "white-papers/Leopold_Research_Validation_Analysis.docx",
  ],
  [
    "/white-papers/Leopold_Strategic_Positioning.docx",
    "white-papers/Leopold_Strategic_Positioning.docx",
  ],
  ["/white-papers/RIT_IEEE_White_Paper.docx", "white-papers/RIT_IEEE_White_Paper.docx"],
]);

const PUBLIC_ASSET_PREFIXES = ["/src/assets/", "/src/js/", "/src/styles/"];

export interface PublicFile {
  absolutePath: string;
  cacheControl: string;
  contentType: string;
  relativePath: string;
}

export function resolvePublicFile(rootDir: string, pathname: string): PublicFile {
  const decoded = decodePath(pathname);
  const relativePath =
    PUBLIC_ROUTES.get(decoded) ?? PUBLIC_WHITE_PAPERS.get(decoded) ?? assetPath(decoded);

  if (!relativePath) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }

  const normalizedRelative = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = join(rootDir, normalizedRelative);
  const normalizedRoot = normalize(rootDir);
  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }

  return {
    absolutePath,
    cacheControl: cacheControlFor(decoded),
    contentType: contentTypeFor(relativePath),
    relativePath: normalizedRelative,
  };
}

export function contentTypeFor(path: string): string {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  const contentType = CONTENT_TYPES.get(extension);
  if (!contentType) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported file type.");
  }
  return contentType;
}

function assetPath(pathname: string): string | undefined {
  if (!PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return undefined;
  }
  if (pathname.includes("\\") || pathname.includes("..") || pathname.endsWith("/")) {
    return undefined;
  }
  const extension = pathname.includes(".") ? pathname.slice(pathname.lastIndexOf(".")).toLowerCase() : "";
  if (!CONTENT_TYPES.has(extension)) {
    return undefined;
  }
  return pathname.replace(/^\/+/, "");
}

function cacheControlFor(pathname: string): string {
  if (pathname.startsWith("/src/assets/")) {
    return "public, max-age=86400";
  }
  if (pathname.endsWith(".html") || pathname === "/" || pathname === "/.well-known/security.txt") {
    return "no-store";
  }
  return "public, max-age=300";
}

function decodePath(pathname: string): string {
  if (/%2f|%5c/i.test(pathname) || pathname.includes("\\")) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "INVALID_PATH", "Invalid request path.");
  }
}
