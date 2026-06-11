import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { join, normalize, sep } from "node:path";

import { handleForgeApi } from "./server/forge.ts";

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
  [".md", "text/markdown; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

// Only these paths are servable. The repo also contains the server code,
// internal system docs, QC tooling, and .git — none of which may ever be
// exposed, so anything not listed here is refused (fail-closed).
const PUBLIC_DIRS = new Set(["src", "legal", "account", "checkout", "white-papers"]);
const PUBLIC_ROOT_FILES = new Set(["favicon.svg", "robots.txt"]);

// Assets are not content-hashed, so keep their cache lifetime short enough
// that a deploy propagates within the hour. HTML always revalidates.
const ASSET_CACHE_CONTROL = "public, max-age=3600";
const HTML_CACHE_CONTROL = "no-cache";

const rootDir = process.cwd();
// Render injects PORT and requires binding 0.0.0.0; both default to sensible
// values for local dev. Set HOST=127.0.0.1 to keep a local run off the LAN.
const port = Number.parseInt(process.env.PORT ?? "", 10) || 3000;
const host = process.env.HOST ?? "0.0.0.0";

/** Maps a request path to a servable file, or null when it is not public. */
function resolvePath(pathname: string): string | null {
  // Directory-style URLs (/, /white-papers/) serve their index.html.
  const indexedPath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const decodedPath = decodeURIComponent(indexedPath);
  const safePath = normalize(decodedPath)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");

  const segments = safePath.split(/[/\\]/);
  const isPublic =
    segments.length === 1
      ? segments[0].endsWith(".html") || PUBLIC_ROOT_FILES.has(segments[0])
      : PUBLIC_DIRS.has(segments[0]);
  if (!isPublic) {
    return null;
  }

  const candidate = join(rootDir, safePath);
  if (!candidate.startsWith(rootDir + sep)) {
    return null;
  }

  return candidate;
}

function contentTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES.get(extension) ?? "application/octet-stream";
}

function baseHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
}

function sendNotFound(response: ServerResponse): void {
  response.writeHead(404, baseHeaders("text/plain; charset=utf-8"));
  response.end("Not found");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    // Liveness probe for Render health checks and uptime monitors.
    if (url.pathname === "/healthz") {
      response.writeHead(200, baseHeaders("text/plain; charset=utf-8"));
      response.end("ok");
      return;
    }

    // Route ForgeCustomer (BFF) and public-config calls server-side before
    // falling back to static file serving.
    if (await handleForgeApi(request, response, url)) {
      return;
    }

    const method = (request.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, {
        ...baseHeaders("text/plain; charset=utf-8"),
        allow: "GET, HEAD",
      });
      response.end("Method not allowed");
      return;
    }

    const filePath = resolvePath(url.pathname);
    if (filePath === null) {
      sendNotFound(response);
      return;
    }

    try {
      await access(filePath, constants.F_OK);
    } catch {
      sendNotFound(response);
      return;
    }

    const body = await readFile(filePath);
    const contentType = contentTypeFor(filePath);
    response.writeHead(200, {
      ...baseHeaders(contentType),
      "cache-control": contentType.startsWith("text/html")
        ? HTML_CACHE_CONTROL
        : ASSET_CACHE_CONTROL,
      "content-length": String(body.byteLength),
    });
    response.end(method === "HEAD" ? undefined : body);
  } catch {
    sendNotFound(response);
  }
});

server.listen(port, host, () => {
  console.log(`BDS website server listening on http://${host}:${port}`);
});
