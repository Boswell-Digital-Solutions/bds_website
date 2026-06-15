import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { handleAppsRoute } from "./server/apps.ts";
import { handleForgeApi } from "./server/forge.ts";
import { handleIntakeApi } from "./server/intake.ts";
import { resolvePublicFile } from "./server/security/publication.ts";
import {
  HttpError,
  LIMITS,
  correlationIdFrom,
  errorPayload,
  handleHttpError,
  logSecurityEvent,
  readLimitedBody,
  readinessStatus,
  securityHeaders,
  sendJson,
  sendText,
  validateAllowedHost,
  validateEdgeToken,
  validateRequestEnvelope,
} from "./server/security/http.ts";

const rootDir = process.cwd();
// Render injects PORT and requires binding 0.0.0.0. Set HOST=127.0.0.1 for
// local-only development runs.
const port = Number.parseInt(process.env.PORT ?? "", 10) || 3000;
const listenHost = process.env.HOST ?? "0.0.0.0";

const server = createServer(async (request, response) => {
  const correlationId = correlationIdFrom(request);

  try {
    validateRequestEnvelope(request);
    validateAllowedHost(request);
    validateEdgeToken(request);

    const requestHost = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "/", `http://${requestHost}`);

    if (url.pathname === "/healthz" || url.pathname === "/readyz") {
      handleHealth(request.method ?? "GET", response, url.pathname, correlationId);
      return;
    }

    if (url.pathname === "/api/security/csp-report") {
      await handleCspReport(request, response, correlationId);
      return;
    }

    // Route BFF calls server-side before falling back to static file serving.
    if (await handleForgeApi(request, response, url)) {
      return;
    }
    if (await handleIntakeApi(request, response, url)) {
      return;
    }
    if (await handleAppsRoute(request, response, url, rootDir, correlationId)) {
      return;
    }

    const method = (request.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      sendJson(
        response,
        405,
        errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", correlationId),
        { allow: "GET, HEAD" }
      );
      return;
    }

    const file = resolvePublicFile(rootDir, url.pathname);

    try {
      await access(file.absolutePath);
    } catch {
      sendText(response, 404, "Not found");
      return;
    }

    const body = await readFile(file.absolutePath);
    response.writeHead(200, {
      ...securityHeaders({
        "cache-control": file.cacheControl,
        "content-type": file.contentType,
        "content-length": String(body.byteLength),
      }),
    });
    response.end(method === "HEAD" ? undefined : body);
  } catch (error) {
    if (!handleHttpError(response, error, correlationId)) {
      sendJson(
        response,
        500,
        errorPayload("INTERNAL_ERROR", "The request could not be processed.", correlationId)
      );
    }
  }
});

server.requestTimeout = LIMITS.totalRequestDeadlineMs;
server.headersTimeout = Math.min(10_000, LIMITS.totalRequestDeadlineMs);
server.maxHeadersCount = LIMITS.headerCount;

server.listen(port, listenHost, () => {
  console.log(`BDS website server listening on http://${listenHost}:${port}`);
});

function handleHealth(
  method: string,
  response: import("node:http").ServerResponse,
  pathname: string,
  correlationId: string
): void {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    sendJson(
      response,
      405,
      errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", correlationId),
      { allow: "GET, HEAD" }
    );
    return;
  }

  if (pathname === "/healthz") {
    sendJson(response, 200, { status: "ok", correlation_id: correlationId });
    return;
  }

  const readiness = readinessStatus();
  sendJson(
    response,
    readiness.ready ? 200 : 503,
    {
      status: readiness.ready ? "ready" : "degraded",
      checks: readiness.missing.length === 0 ? ["configured"] : ["configuration_required"],
      correlation_id: correlationId,
    }
  );
}

async function handleCspReport(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  correlationId: string
): Promise<void> {
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "POST") {
    sendJson(
      response,
      405,
      errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", correlationId),
      { allow: "POST" }
    );
    return;
  }

  try {
    const body = await readLimitedBody(request, LIMITS.defaultJsonBodyBytes);
    logSecurityEvent("info", "bds.csp.report.received", {
      correlation_id: correlationId,
      bytes: body.length,
    });
    response.writeHead(204, securityHeaders({ "cache-control": "no-store" }));
    response.end();
  } catch (error) {
    if (!handleHttpError(response, error, correlationId)) {
      throw new HttpError(400, "CSP_REPORT_INVALID", "CSP report could not be read.");
    }
  }
}
