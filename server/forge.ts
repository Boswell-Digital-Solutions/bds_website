/**
 * ForgeCustomer BFF (backend-for-frontend) proxy.
 *
 * The public website is a pure *customer-surface client*: it renders state that
 * ForgeCustomer owns and never holds commercial truth itself. ForgeCustomer
 * currently exposes no CORS layer, so the browser must never call it directly.
 * Every ForgeCustomer call is routed through this server, which forwards the
 * signed-in user's own Supabase access token (`Authorization: Bearer <jwt>`)
 * per request.
 *
 * Hard rules enforced here:
 *   1. Only the public *customer* endpoints below are reachable. `/v1/admin/*`
 *      (Forge Command's surface) and anything not on the allowlist is rejected.
 *      No service-role key, Stripe secret, or operator credential is ever read
 *      or forwarded by this proxy.
 *   2. Responses are returned with `Cache-Control: no-store` so one user's
 *      response is never cached for another.
 *
 * Configuration (server-side only):
 *   FORGECUSTOMER_API_BASE   e.g. https://api.forgecustomer.example
 *   SUPABASE_URL             reused for login (public)
 *   SUPABASE_ANON_KEY        reused for login (public)
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const API_PREFIX = "/api/forge";

interface AllowEntry {
  method: string;
  /** ForgeCustomer path template, e.g. "/v1/installations/:id/deactivate". */
  template: string;
  /** Public catalog endpoints do not require the user's token. */
  isPublic?: boolean;
  /** Honour an inbound Idempotency-Key header (checkout). */
  forwardIdempotencyKey?: boolean;
  regex: RegExp;
}

function compile(template: string): RegExp {
  // Convert ":id" segments into a constrained path-segment match.
  const pattern = template
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "([^/]+)" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("/");
  return new RegExp(`^${pattern}$`);
}

function entry(
  method: string,
  template: string,
  options: { isPublic?: boolean; forwardIdempotencyKey?: boolean } = {}
): AllowEntry {
  return { method, template, regex: compile(template), ...options };
}

/**
 * The complete set of ForgeCustomer endpoints the website is permitted to reach.
 * Anything not listed here (notably `/v1/admin/*`) is refused before any
 * upstream request is made.
 */
const ALLOWLIST: AllowEntry[] = [
  // --- Session bootstrap -------------------------------------------------
  entry("POST", "/v1/account/provision"),

  // --- Public catalog (no token required) --------------------------------
  entry("GET", "/v1/products", { isPublic: true }),
  entry("GET", "/v1/plans", { isPublic: true }),
  entry("GET", "/v1/entitlements/keys", { isPublic: true }),

  // --- Checkout ----------------------------------------------------------
  entry("POST", "/v1/checkout", { forwardIdempotencyKey: true }),

  // --- Account dashboard (reads) -----------------------------------------
  entry("GET", "/v1/account"),
  entry("GET", "/v1/subscriptions"),
  entry("GET", "/v1/licenses"),
  entry("GET", "/v1/installations"),
  entry("GET", "/v1/devices"),
  entry("GET", "/v1/usage/current"),
  entry("GET", "/v1/entitlements/current"),

  // --- Installation / device management ----------------------------------
  entry("POST", "/v1/installations/:id/deactivate"),

  // --- Account deletion lifecycle ----------------------------------------
  entry("POST", "/v1/account/deletion-request"),
  entry("GET", "/v1/account/deletion-request"),
  entry("POST", "/v1/account/deletion-request/cancel"),
];

function findEntry(method: string, path: string): AllowEntry | undefined {
  return ALLOWLIST.find((item) => item.method === method && item.regex.test(path));
}

/** ForgeCustomer's error contract shape: { error: { code, message, correlation_id, details } }. */
function errorPayload(
  code: string,
  message: string,
  correlationId: string,
  details: unknown = null
) {
  return { error: { code, message, correlation_id: correlationId, details } };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    // Never cache one user's response for another (hard rule 2).
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/** Public, browser-safe configuration. Contains no secrets. */
function publicConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    forgeConfigured: Boolean(process.env.FORGECUSTOMER_API_BASE),
  };
}

/**
 * Handle a request if it targets the BFF surface. Returns true when handled so
 * the static file server can ignore it.
 */
export async function handleForgeApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;

  // Public, non-secret config for the browser (Supabase login uses this).
  if (pathname === "/api/public-config") {
    if (request.method !== "GET") {
      sendJson(response, 405, errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", randomUUID()));
      return true;
    }
    sendJson(response, 200, publicConfig());
    return true;
  }

  if (!pathname.startsWith(`${API_PREFIX}/`)) {
    return false;
  }

  const correlationId = randomUUID();
  const method = (request.method ?? "GET").toUpperCase();
  const forgePath = pathname.slice(API_PREFIX.length); // e.g. "/v1/subscriptions"

  const matched = findEntry(method, forgePath);
  if (!matched) {
    // Not on the allowlist (covers /v1/admin/* and every operator surface).
    sendJson(
      response,
      404,
      errorPayload(
        "NOT_FOUND",
        "This endpoint is not available through the website.",
        correlationId
      )
    );
    return true;
  }

  const apiBase = process.env.FORGECUSTOMER_API_BASE;
  if (!apiBase) {
    console.error(
      `[forge] FORGECUSTOMER_API_BASE is not configured. correlation_id=${correlationId} path=${forgePath}`
    );
    sendJson(
      response,
      503,
      errorPayload(
        "INTEGRATION_UNCONFIGURED",
        "The customer service is not configured for this environment.",
        correlationId
      )
    );
    return true;
  }

  // Authorization: forward the user's own Supabase access token. Required for
  // every endpoint except the public catalog.
  const authHeader = request.headers["authorization"];
  if (!matched.isPublic && !authHeader) {
    sendJson(
      response,
      401,
      errorPayload("UNAUTHENTICATED", "Sign in to continue.", correlationId)
    );
    return true;
  }

  const upstreamHeaders: Record<string, string> = {
    accept: "application/json",
  };
  if (authHeader) {
    upstreamHeaders["authorization"] = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  }
  if (matched.forwardIdempotencyKey) {
    const key = request.headers["idempotency-key"];
    if (typeof key === "string" && key) {
      upstreamHeaders["idempotency-key"] = key;
    }
  }

  let body: Buffer | undefined;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    body = await readBody(request);
    if (body.length > 0) {
      upstreamHeaders["content-type"] = "application/json";
    }
  }

  const target = `${apiBase.replace(/\/+$/, "")}${forgePath}${url.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: upstreamHeaders,
      body: body && body.length > 0 ? body : undefined,
    });
  } catch (cause) {
    console.error(
      `[forge] upstream request failed. correlation_id=${correlationId} path=${forgePath}`,
      cause
    );
    sendJson(
      response,
      502,
      errorPayload(
        "UPSTREAM_UNAVAILABLE",
        "The customer service could not be reached. Please try again.",
        correlationId
      )
    );
    return true;
  }

  const text = await upstream.text();

  // Log the correlation_id of every upstream error so support can trace it.
  if (!upstream.ok) {
    let upstreamCorrelation = "";
    let upstreamCode = "";
    try {
      const parsed = JSON.parse(text);
      upstreamCorrelation = parsed?.error?.correlation_id ?? "";
      upstreamCode = parsed?.error?.code ?? "";
    } catch {
      // Non-JSON error body; fall through with what we have.
    }
    console.error(
      `[forge] upstream error status=${upstream.status} code=${upstreamCode || "?"} ` +
        `correlation_id=${upstreamCorrelation || correlationId} path=${forgePath}`
    );
  }

  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
  return true;
}
