import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

export const LIMITS = {
  requestTargetBytes: 8 * 1024,
  aggregateHeaderBytes: 16 * 1024,
  headerCount: 64,
  defaultJsonBodyBytes: 64 * 1024,
  checkoutBodyBytes: 8 * 1024,
  provisionBodyBytes: 4 * 1024,
  deletionBodyBytes: 8 * 1024,
  contactBodyBytes: 32 * 1024,
  bodyReadDeadlineMs: 5_000,
  totalRequestDeadlineMs: 15_000,
  upstreamDeadlineMs: 8_000,
  upstreamResponseBytes: 1024 * 1024,
  authorizationHeaderBytes: 4096,
  idempotencyKeyBytes: 128,
} as const;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const DEFAULT_ALLOWED_HOSTS = [
  "boswelldigitalsolutions.com",
  "www.boswelldigitalsolutions.com",
  "127.0.0.1",
  "localhost",
  "[::1]",
  "::1",
];

const REPORT_TO = JSON.stringify({
  group: "bds-csp",
  max_age: 10886400,
  endpoints: [{ url: "/api/security/csp-report" }],
});

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' mailto:",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
  "report-to bds-csp",
].join("; ");

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly details: unknown;

  constructor(status: number, code: string, publicMessage: string, details: unknown = null) {
    super(publicMessage);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

export function errorPayload(
  code: string,
  message: string,
  correlationId: string,
  details: unknown = null
) {
  return { error: { code, message, correlation_id: correlationId, details } };
}

export function securityHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "content-security-policy-report-only": CSP_REPORT_ONLY,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), usb=(), payment=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "report-to": REPORT_TO,
    "reporting-endpoints": 'bds-csp="/api/security/csp-report"',
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };

  if (process.env.NODE_ENV === "production" || process.env.BDS_ENABLE_HSTS === "true") {
    headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    }),
    ...extraHeaders,
  });
  response.end(payload);
}

export function sendText(
  response: ServerResponse,
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {}
): void {
  response.writeHead(status, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    }),
    ...extraHeaders,
  });
  response.end(body);
}

export function correlationIdFrom(request: IncomingMessage): string {
  const inbound = singletonHeader(request.headers, "x-correlation-id");
  return inbound && /^[0-9a-fA-F-]{16,64}$/.test(inbound) ? inbound : randomUUID();
}

export function logSecurityEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function singletonHeader(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function validateRequestEnvelope(request: IncomingMessage): void {
  const target = request.url ?? "/";
  if (Buffer.byteLength(target, "utf8") > LIMITS.requestTargetBytes) {
    throw new HttpError(414, "REQUEST_TARGET_TOO_LARGE", "Request target is too large.");
  }

  const headerPairs = request.rawHeaders.length / 2;
  if (headerPairs > LIMITS.headerCount) {
    throw new HttpError(431, "TOO_MANY_HEADERS", "Too many request headers.");
  }

  let aggregateBytes = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    aggregateBytes += Buffer.byteLength(request.rawHeaders[index] ?? "", "utf8");
    aggregateBytes += Buffer.byteLength(request.rawHeaders[index + 1] ?? "", "utf8");
    aggregateBytes += 4;
  }
  if (aggregateBytes > LIMITS.aggregateHeaderBytes) {
    throw new HttpError(431, "HEADERS_TOO_LARGE", "Request headers are too large.");
  }
}

export function validateAllowedHost(request: IncomingMessage): void {
  const host = singletonHeader(request.headers, "host");
  if (!host || host.includes(",") || host.length > 255) {
    throw new HttpError(400, "INVALID_HOST", "Invalid Host header.");
  }

  if (!isAllowedHost(host)) {
    throw new HttpError(403, "HOST_NOT_ALLOWED", "This Host is not allowed.");
  }
}

export function validateEdgeToken(request: IncomingMessage): void {
  if (!edgeTokenRequired()) {
    return;
  }

  const expected = process.env.BDS_EDGE_TOKEN;
  if (!expected) {
    throw new HttpError(503, "EDGE_TOKEN_UNCONFIGURED", "Edge authentication is not configured.");
  }

  const headerName = (process.env.BDS_EDGE_TOKEN_HEADER ?? "x-bds-edge-token").toLowerCase();
  const actual = singletonHeader(request.headers, headerName);
  if (!actual || !constantTimeEqual(actual, expected)) {
    throw new HttpError(403, "EDGE_TOKEN_INVALID", "Edge authentication failed.");
  }
}

export function edgeTokenRequired(): boolean {
  const explicit = process.env.BDS_REQUIRE_EDGE_TOKEN;
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  return Boolean(process.env.BDS_EDGE_TOKEN);
}

export function readinessStatus(): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (edgeTokenRequired() && !process.env.BDS_EDGE_TOKEN) {
    missing.push("edge_authentication");
  }
  if (!process.env.FORGECUSTOMER_API_BASE) {
    missing.push("forgecustomer");
  }
  if (!process.env.BDS_INTAKE_URL) {
    missing.push("intake");
  }
  return { ready: missing.length === 0, missing };
}

export function validateSameOrigin(request: IncomingMessage): void {
  const origin = singletonHeader(request.headers, "origin");
  if (origin) {
    if (origin === "null" || !isAllowedOrigin(origin, request)) {
      throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
    }
    return;
  }

  const referer = singletonHeader(request.headers, "referer");
  if (!referer || !isAllowedReferer(referer, request)) {
    throw new HttpError(403, "ORIGIN_REQUIRED", "A same-origin request is required.");
  }
}

export function validateJsonContentType(request: IncomingMessage): void {
  const contentType = singletonHeader(request.headers, "content-type");
  if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  }
}

export function ensureNoRequestBody(request: IncomingMessage): void {
  const contentLength = singletonHeader(request.headers, "content-length");
  const transferEncoding = singletonHeader(request.headers, "transfer-encoding");
  if ((contentLength && contentLength !== "0") || transferEncoding) {
    throw new HttpError(400, "BODY_NOT_ALLOWED", "This route does not accept a request body.");
  }
}

export async function readLimitedBody(
  request: IncomingMessage,
  maxBytes: number,
  deadlineMs = LIMITS.bodyReadDeadlineMs
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      request.destroy();
      settle(() => reject(new HttpError(408, "BODY_READ_TIMEOUT", "Request body timed out.")));
    }, deadlineMs);

    request.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buffer.length;
      if (total > maxBytes) {
        request.destroy();
        settle(() => reject(new HttpError(413, "BODY_TOO_LARGE", "Request body is too large.")));
        return;
      }
      chunks.push(buffer);
    });

    request.on("end", () => settle(() => resolve(Buffer.concat(chunks))));
    request.on("error", (cause) => {
      if (settled) {
        return;
      }
      settle(() => reject(cause));
    });
  });
}

export function parseJsonObject(body: Buffer): Record<string, unknown> {
  if (body.length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "INVALID_JSON_OBJECT", "Request body must be a JSON object.");
  }
  const object = parsed as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new HttpError(400, "INVALID_JSON_KEY", "Request body contains an invalid key.");
    }
  }
  return object;
}

export function validateNoDuplicateQuery(url: URL, allowedKeys: Set<string> = new Set()): void {
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams.entries()) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(400, "QUERY_NOT_ALLOWED", "This route does not accept that query parameter.");
    }
    if (seen.has(key)) {
      throw new HttpError(400, "DUPLICATE_QUERY", "Duplicate query parameters are not allowed.");
    }
    if (key.length > 128 || value.length > 2048) {
      throw new HttpError(400, "QUERY_TOO_LARGE", "Query parameter is too large.");
    }
    seen.add(key);
  }
}

export function normalizeBearerAuthorization(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") > LIMITS.authorizationHeaderBytes) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  if (!/^Bearer [A-Za-z0-9\-._~+/]+=*$/.test(value)) {
    throw new HttpError(401, "INVALID_AUTHORIZATION", "Authorization must be a Bearer token.");
  }
  return value;
}

export function normalizeIdempotencyKey(
  value: string | undefined,
  mode: "forbidden" | "optional" | "required"
): string | undefined {
  if (mode === "forbidden") {
    if (value) {
      throw new HttpError(400, "IDEMPOTENCY_FORBIDDEN", "Idempotency-Key is not allowed for this route.");
    }
    return undefined;
  }

  if (!value) {
    if (mode === "required") {
      throw new HttpError(400, "IDEMPOTENCY_REQUIRED", "Idempotency-Key is required for this route.");
    }
    return undefined;
  }

  if (
    Buffer.byteLength(value, "utf8") > LIMITS.idempotencyKeyBytes ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(value)
  ) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is malformed.");
  }
  return value;
}

export async function readCappedResponseText(
  response: Response,
  maxBytes = LIMITS.upstreamResponseBytes
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const buffer = Buffer.from(value);
    total += buffer.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(502, "UPSTREAM_RESPONSE_TOO_LARGE", "Upstream response is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function validateUpstreamContentType(response: Response): void {
  if (response.status === 204) {
    return;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:json|problem\+json)(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(502, "UPSTREAM_CONTENT_TYPE_INVALID", "Upstream returned an unexpected content type.");
  }
}

export function parseConfiguredBaseUrl(
  value: string | undefined,
  envName: string,
  allowedHostsEnvName?: string
): URL | undefined {
  if (!value) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(503, `${envName}_INVALID`, `${envName} is invalid.`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new HttpError(503, `${envName}_INVALID`, `${envName} must not contain credentials, query, or fragment.`);
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new HttpError(503, `${envName}_INSECURE`, `${envName} must use HTTPS in production.`);
  }

  const allowedHosts = splitCsv(process.env[allowedHostsEnvName ?? ""]);
  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new HttpError(503, `${envName}_HOST_NOT_ALLOWED`, `${envName} host is not approved.`);
  }

  return parsed;
}

export function joinBaseUrl(base: URL, path: string, search = ""): string {
  const root = base.toString().replace(/\/+$/, "");
  return `${root}${path}${search}`;
}

export function handleHttpError(
  response: ServerResponse,
  error: unknown,
  correlationId: string
): boolean {
  if (!(error instanceof HttpError)) {
    return false;
  }
  sendJson(response, error.status, errorPayload(error.code, error.publicMessage, correlationId, error.details));
  return true;
}

function isAllowedHost(hostHeader: string): boolean {
  const host = hostHeader.trim().toLowerCase();
  const hostname = hostnameFromHostHeader(host);
  const allowed = splitCsv(process.env.BDS_ALLOWED_HOSTS);
  const allowedHosts = new Set((allowed.length > 0 ? allowed : DEFAULT_ALLOWED_HOSTS).map((item) => item.toLowerCase()));

  if (allowedHosts.has(host) || allowedHosts.has(hostname)) {
    return true;
  }

  return LOCAL_HOSTS.has(hostname) && /^\[?::1\]?(?::\d+)?$|^(localhost|127\.0\.0\.1):\d+$/.test(host);
}

function isAllowedOrigin(origin: string, request: IncomingMessage): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const configured = splitCsv(process.env.BDS_ALLOWED_ORIGINS);
  if (configured.length > 0) {
    return configured.includes(parsed.origin.toLowerCase());
  }

  const host = singletonHeader(request.headers, "host")?.toLowerCase();
  if (host && parsed.host.toLowerCase() === host) {
    return parsed.protocol === "https:" || LOCAL_HOSTS.has(hostnameFromHostHeader(host));
  }

  const hostname = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) {
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }

  return (
    parsed.protocol === "https:" &&
    (hostname === "boswelldigitalsolutions.com" || hostname === "www.boswelldigitalsolutions.com")
  );
}

function isAllowedReferer(referer: string, request: IncomingMessage): boolean {
  try {
    const parsed = new URL(referer);
    return isAllowedOrigin(parsed.origin, request);
  } catch {
    return false;
  }
}

function hostnameFromHostHeader(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    const end = hostHeader.indexOf("]");
    return end > 0 ? hostHeader.slice(0, end + 1) : hostHeader;
  }
  return hostHeader.split(":")[0] ?? hostHeader;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
