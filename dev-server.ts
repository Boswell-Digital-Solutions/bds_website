import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize } from "node:path";

import { handleForgeApi } from "./server/forge.ts";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const rootDir = process.cwd();
const requestedPort = Number.parseInt(process.env.PORT ?? "", 10) || 0;

function resolvePath(pathname: string): string {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(normalizedPath);
  const safePath = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = join(rootDir, safePath.replace(/^[/\\]+/, ""));

  if (!candidate.startsWith(rootDir)) {
    throw new Error("Path traversal rejected");
  }

  return candidate;
}

function contentTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES.get(extension) ?? "application/octet-stream";
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    // Route ForgeCustomer (BFF) and public-config calls server-side before
    // falling back to static file serving.
    if (await handleForgeApi(request, response, url)) {
      return;
    }

    const filePath = resolvePath(url.pathname);

    try {
      await access(filePath, constants.F_OK);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : requestedPort;

  console.log(`Static server running at http://127.0.0.1:${port}`);
});
