/**
 * ForgeCustomer BFF (backend-for-frontend) proxy.
 *
 * The website is a customer-surface client. ForgeCustomer owns commercial
 * truth, and this server is the only browser-reachable bridge to that surface.
 * Every route below is an explicit policy with bounded input, same-origin
 * rules, idempotency rules, and CSSA shadow egress evidence.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { governedFetchText } from "./security/egress.ts";
import {
  HttpError,
  LIMITS,
  correlationIdFrom,
  errorPayload,
  handleHttpError,
  joinBaseUrl,
  normalizeBearerAuthorization,
  normalizeIdempotencyKey,
  parseConfiguredBaseUrl,
  parseJsonObject,
  readLimitedBody,
  securityHeaders,
  sendJson,
  singletonHeader,
  validateJsonContentType,
  validateNoDuplicateQuery,
  validateSameOrigin,
} from "./security/http.ts";

const API_PREFIX = "/api/forge";

interface RoutePolicy {
  auth: "public" | "customer";
  cssaAction: string;
  dataClass: "R0" | "R1" | "R2" | "R3";
  id: string;
  idempotency: "forbidden" | "optional" | "required";
  maxBodyBytes: number;
  method: string;
  originRequired: boolean;
  regex: RegExp;
  surface: string;
  template: string;
  validateBody?: (input: Record<string, unknown>) => Record<string, unknown>;
}

function compile(template: string): RegExp {
  const pattern = template
    .split("/")
    .map((segment) => {
      if (segment === ":id") {
        return "([A-Za-z0-9._:-]{1,128})";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${pattern}$`);
}

function policy(
  method: string,
  template: string,
  options: Omit<RoutePolicy, "method" | "template" | "regex">
): RoutePolicy {
  return { method, template, regex: compile(template), ...options };
}

const ROUTES: RoutePolicy[] = [
  policy("POST", "/v1/account/provision", {
    auth: "customer",
    cssaAction: "account.provision",
    dataClass: "R2",
    id: "forge.account.provision",
    idempotency: "optional",
    maxBodyBytes: LIMITS.provisionBodyBytes,
    originRequired: true,
    surface: "forgecustomer.account",
    validateBody: validateProvision,
  }),

  policy("GET", "/v1/products", {
    auth: "public",
    cssaAction: "catalog.products.read",
    dataClass: "R0",
    id: "forge.catalog.products",
    idempotency: "forbidden",
    maxBodyBytes: 0,
    originRequired: false,
    surface: "forgecustomer.catalog",
  }),
  policy("GET", "/v1/plans", {
    auth: "public",
    cssaAction: "catalog.plans.read",
    dataClass: "R0",
    id: "forge.catalog.plans",
    idempotency: "forbidden",
    maxBodyBytes: 0,
    originRequired: false,
    surface: "forgecustomer.catalog",
  }),
  policy("GET", "/v1/entitlements/keys", {
    auth: "public",
    cssaAction: "catalog.entitlement_keys.read",
    dataClass: "R0",
    id: "forge.catalog.entitlement_keys",
    idempotency: "forbidden",
    maxBodyBytes: 0,
    originRequired: false,
    surface: "forgecustomer.catalog",
  }),

  policy("POST", "/v1/checkout", {
    auth: "customer",
    cssaAction: "checkout.create",
    dataClass: "R2",
    id: "forge.checkout.create",
    idempotency: "required",
    maxBodyBytes: LIMITS.checkoutBodyBytes,
    originRequired: true,
    surface: "forgecustomer.checkout",
    validateBody: validateCheckout,
  }),

  policy("GET", "/v1/account", readPolicy("account.read", "forge.account.read", "forgecustomer.account")),
  policy(
    "GET",
    "/v1/subscriptions",
    readPolicy("subscription.read", "forge.subscription.read", "forgecustomer.account")
  ),
  policy("GET", "/v1/licenses", readPolicy("license.read", "forge.license.read", "forgecustomer.account")),
  policy(
    "GET",
    "/v1/installations",
    readPolicy("installation.read", "forge.installation.read", "forgecustomer.devices")
  ),
  policy("GET", "/v1/devices", readPolicy("installation.read", "forge.device.read", "forgecustomer.devices")),
  policy("GET", "/v1/usage/current", readPolicy("usage.read", "forge.usage.current", "forgecustomer.usage")),
  policy(
    "GET",
    "/v1/entitlements/current",
    readPolicy("entitlement.read", "forge.entitlement.current", "forgecustomer.account")
  ),

  policy("POST", "/v1/installations/:id/deactivate", {
    auth: "customer",
    cssaAction: "installation.deactivate",
    dataClass: "R2",
    id: "forge.installation.deactivate",
    idempotency: "required",
    maxBodyBytes: 0,
    originRequired: true,
    surface: "forgecustomer.devices",
  }),

  policy("POST", "/v1/account/deletion-request", {
    auth: "customer",
    cssaAction: "deletion.request",
    dataClass: "R3",
    id: "forge.deletion.request",
    idempotency: "required",
    maxBodyBytes: LIMITS.deletionBodyBytes,
    originRequired: true,
    surface: "forgecustomer.deletion",
    validateBody: validateDeletionRequest,
  }),
  policy(
    "GET",
    "/v1/account/deletion-request",
    readPolicy("deletion.read", "forge.deletion.read", "forgecustomer.deletion")
  ),
  policy("POST", "/v1/account/deletion-request/cancel", {
    auth: "customer",
    cssaAction: "deletion.cancel",
    dataClass: "R3",
    id: "forge.deletion.cancel",
    idempotency: "required",
    maxBodyBytes: 0,
    originRequired: true,
    surface: "forgecustomer.deletion",
  }),
];

function readPolicy(
  cssaAction: string,
  id: string,
  surface: string
): Omit<RoutePolicy, "method" | "template" | "regex"> {
  return {
    auth: "customer",
    cssaAction,
    dataClass: "R2",
    id,
    idempotency: "forbidden",
    maxBodyBytes: 0,
    originRequired: false,
    surface,
  };
}

function findPolicy(method: string, path: string): RoutePolicy | undefined {
  return ROUTES.find((item) => item.method === method && item.regex.test(path));
}

/** Public, browser-safe configuration. Contains no secrets. */
function publicConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    forgeConfigured: Boolean(process.env.FORGECUSTOMER_API_BASE),
  };
}

export async function handleForgeApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;

  if (pathname === "/api/public-config") {
    return handlePublicConfig(request, response);
  }

  if (!pathname.startsWith(`${API_PREFIX}/`)) {
    return false;
  }

  const correlationId = correlationIdFrom(request);
  const method = (request.method ?? "GET").toUpperCase();
  const forgePath = pathname.slice(API_PREFIX.length);

  try {
    if (/%2f|%5c/i.test(forgePath) || forgePath.includes("\\") || forgePath.includes("..")) {
      throw new HttpError(404, "NOT_FOUND", "This endpoint is not available through the website.");
    }

    const route = findPolicy(method, forgePath);
    if (!route) {
      throw new HttpError(404, "NOT_FOUND", "This endpoint is not available through the website.");
    }

    validateNoDuplicateQuery(url);
    if (route.originRequired) {
      validateSameOrigin(request);
    }

    const idempotencyKey = normalizeIdempotencyKey(
      singletonHeader(request.headers, "idempotency-key"),
      route.idempotency
    );

    const upstreamHeaders: Record<string, string> = {
      accept: "application/json",
      "x-correlation-id": correlationId,
    };

    const authHeader = singletonHeader(request.headers, "authorization");
    if (route.auth === "customer") {
      upstreamHeaders.authorization = normalizeBearerAuthorization(authHeader);
    } else if (authHeader) {
      throw new HttpError(400, "AUTHORIZATION_FORBIDDEN", "Authorization is not allowed for this route.");
    }

    if (idempotencyKey) {
      upstreamHeaders["idempotency-key"] = idempotencyKey;
    }

    const body = await readAndValidateRouteBody(request, route);
    if (body) {
      upstreamHeaders["content-type"] = "application/json";
    }

    const apiBase = parseConfiguredBaseUrl(
      process.env.FORGECUSTOMER_API_BASE,
      "FORGECUSTOMER_API_BASE",
      "FORGECUSTOMER_ALLOWED_HOSTS"
    );
    if (!apiBase) {
      throw new HttpError(503, "INTEGRATION_UNCONFIGURED", "The customer service is not configured.");
    }
    if (apiBase.pathname !== "/" && apiBase.pathname !== "") {
      throw new HttpError(503, "FORGECUSTOMER_API_BASE_INVALID", "FORGECUSTOMER_API_BASE must not include a path.");
    }

    const target = joinBaseUrl(apiBase, forgePath, url.search);
    const upstream = await governedFetchText({
      action: route.cssaAction,
      body,
      correlationId,
      dataClass: route.dataClass,
      destination: target,
      headers: upstreamHeaders,
      maxResponseBytes: LIMITS.upstreamResponseBytes,
      method,
      surface: route.surface,
      timeoutMs: LIMITS.upstreamDeadlineMs,
    });

    writeUpstreamResponse(response, upstream.response, upstream.text, correlationId);
    return true;
  } catch (error) {
    if (!handleHttpError(response, error, correlationId)) {
      sendJson(
        response,
        500,
        errorPayload("FORGE_PROXY_FAILED", "The customer request could not be processed.", correlationId)
      );
    }
    return true;
  }
}

function handlePublicConfig(request: IncomingMessage, response: ServerResponse): boolean {
  const correlationId = correlationIdFrom(request);
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    sendJson(
      response,
      405,
      errorPayload("METHOD_NOT_ALLOWED", "Method not allowed.", correlationId),
      { allow: "GET" }
    );
    return true;
  }
  sendJson(response, 200, publicConfig());
  return true;
}

async function readAndValidateRouteBody(
  request: IncomingMessage,
  route: RoutePolicy
): Promise<string | undefined> {
  if (route.maxBodyBytes === 0) {
    const contentLength = singletonHeader(request.headers, "content-length");
    const transferEncoding = singletonHeader(request.headers, "transfer-encoding");
    if ((contentLength && contentLength !== "0") || transferEncoding) {
      throw new HttpError(400, "BODY_NOT_ALLOWED", "This route does not accept a request body.");
    }
    return undefined;
  }

  validateJsonContentType(request);
  const rawBody = await readLimitedBody(request, route.maxBodyBytes);
  const parsed = parseJsonObject(rawBody);
  const validated = route.validateBody ? route.validateBody(parsed) : parsed;
  return JSON.stringify(validated);
}

function writeUpstreamResponse(
  response: ServerResponse,
  upstream: Response,
  text: string,
  correlationId: string
): void {
  if (!upstream.ok) {
    let upstreamCorrelation = "";
    let upstreamCode = "";
    try {
      const parsed = JSON.parse(text);
      upstreamCorrelation = parsed?.error?.correlation_id ?? "";
      upstreamCode = parsed?.error?.code ?? "";
    } catch {
      // Normalize non-JSON errors below.
    }
    console.error(
      `[forge] upstream error status=${upstream.status} code=${upstreamCode || "?"} ` +
        `correlation_id=${upstreamCorrelation || correlationId}`
    );
  }

  let body = text;
  if (text) {
    try {
      JSON.parse(text);
    } catch {
      body = JSON.stringify(
        errorPayload("UPSTREAM_RESPONSE_INVALID", "The customer service returned an invalid response.", correlationId)
      );
      response.writeHead(502, {
        ...securityHeaders({
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        }),
      });
      response.end(body);
      return;
    }
  }

  response.writeHead(upstream.status, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      "x-correlation-id": correlationId,
    }),
  });
  response.end(body);
}

function validateProvision(input: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(input, new Set(["timezone"]));
  const output: Record<string, unknown> = {};
  if (input.timezone !== undefined) {
    if (
      typeof input.timezone !== "string" ||
      input.timezone.length > 64 ||
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(input.timezone)
    ) {
      throw new HttpError(400, "INVALID_TIMEZONE", "timezone is invalid.");
    }
    output.timezone = input.timezone;
  }
  return output;
}

function validateCheckout(input: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(input, new Set(["plan_key", "success_url", "cancel_url"]));
  const planKey = requiredString(input.plan_key, "plan_key", 1, 128, /^[A-Za-z0-9._:-]+$/);
  const successUrl = validateSameOriginRedirect(input.success_url, "success_url", "/checkout/success.html");
  const cancelUrl = validateSameOriginRedirect(input.cancel_url, "cancel_url", "/checkout/cancel.html");
  return { plan_key: planKey, success_url: successUrl, cancel_url: cancelUrl };
}

function validateDeletionRequest(input: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(input, new Set(["reason"]));
  if (input.reason === undefined || input.reason === "") {
    return {};
  }
  const reason = requiredString(input.reason, "reason", 1, 5000);
  return { reason };
}

function rejectUnknown(input: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, "UNKNOWN_FIELD", "Request body contains an unknown field.");
    }
  }
}

function requiredString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
  pattern?: RegExp
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} is required.`);
  }
  const normalized = value.trim();
  if (
    normalized.length < minLength ||
    normalized.length > maxLength ||
    /[\u0000-\u001f]/.test(normalized) ||
    (pattern && !pattern.test(normalized))
  ) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is invalid.`);
  }
  return normalized;
}

function validateSameOriginRedirect(value: unknown, field: string, expectedPath: string): string {
  const raw = requiredString(value, field, 1, 512);
  if (raw.startsWith("//")) {
    throw new HttpError(400, "INVALID_REDIRECT", `${field} is invalid.`);
  }

  let parsed: URL;
  try {
    parsed = raw.startsWith("/") ? new URL(raw, "https://boswelldigitalsolutions.com") : new URL(raw);
  } catch {
    throw new HttpError(400, "INVALID_REDIRECT", `${field} is invalid.`);
  }

  const allowedOrigin = new Set([
    "https://boswelldigitalsolutions.com",
    "https://www.boswelldigitalsolutions.com",
    "http://127.0.0.1",
    "http://localhost",
  ]);
  const isLocalOrigin =
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    (parsed.protocol === "http:" || parsed.protocol === "https:");

  if ((!allowedOrigin.has(parsed.origin) && !isLocalOrigin) || parsed.pathname !== expectedPath) {
    throw new HttpError(400, "INVALID_REDIRECT", `${field} is not an approved redirect.`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new HttpError(400, "INVALID_REDIRECT", `${field} is invalid.`);
  }
  return raw;
}
