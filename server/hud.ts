/**
 * HUD support-thread BFF (HUD Tier 2, phase 2a).
 *
 * Thin, governed proxy between the signed-in visitor and Supabase. The browser
 * forwards the user's Supabase access token; this server attaches the project
 * anon apikey and calls the SECURITY INVOKER RPCs (`hud_current_thread`,
 * `hud_post_message`) so Postgres RLS scopes every row to that user. The
 * service-role key never lives here — operator replies are written by
 * Forge_Command, not the marketing site.
 *
 * Fails closed: when Supabase is unconfigured the routes return 503 and the
 * client falls back to the Tier 1 intake composer.
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
  parseConfiguredBaseUrl,
  parseJsonObject,
  readLimitedBody,
  securityHeaders,
  sendJson,
  singletonHeader,
  validateJsonContentType,
  validateSameOrigin,
} from "./security/http.ts";

const API_PREFIX = "/api/hud";

export async function handleHudApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  if (!pathname.startsWith(`${API_PREFIX}/`)) {
    return false;
  }

  const correlationId = correlationIdFrom(request);
  const method = (request.method ?? "GET").toUpperCase();
  const route = pathname.slice(API_PREFIX.length);

  try {
    if (route === "/thread" && method === "GET") {
      const token = requireUserToken(request);
      await proxyRpc(response, correlationId, "hud_current_thread", {}, "hud.thread.read", token);
      return true;
    }

    if (route === "/messages" && method === "POST") {
      validateSameOrigin(request);
      validateJsonContentType(request);
      const token = requireUserToken(request);
      const raw = await readLimitedBody(request, LIMITS.contactBodyBytes);
      const { message } = validateMessage(parseJsonObject(raw));
      await proxyRpc(response, correlationId, "hud_post_message", { p_body: message }, "hud.message.create", token);
      return true;
    }

    throw new HttpError(404, "NOT_FOUND", "This endpoint is not available through the website.");
  } catch (error) {
    if (!handleHttpError(response, error, correlationId)) {
      sendJson(
        response,
        500,
        errorPayload("HUD_PROXY_FAILED", "The support request could not be processed.", correlationId)
      );
    }
    return true;
  }
}

function requireUserToken(request: IncomingMessage): string {
  const authHeader = singletonHeader(request.headers, "authorization");
  if (!authHeader) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to use support messages.");
  }
  return normalizeBearerAuthorization(authHeader);
}

async function proxyRpc(
  response: ServerResponse,
  correlationId: string,
  fn: "hud_current_thread" | "hud_post_message",
  payload: Record<string, unknown>,
  action: string,
  token: string
): Promise<void> {
  const base = parseConfiguredBaseUrl(process.env.SUPABASE_URL, "SUPABASE_URL", "SUPABASE_ALLOWED_HOSTS");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!base || !anonKey) {
    throw new HttpError(503, "INTEGRATION_UNCONFIGURED", "The support service is not configured.");
  }

  const target = joinBaseUrl(base, `/rest/v1/rpc/${fn}`);
  const upstream = await governedFetchText({
    action,
    body: JSON.stringify(payload),
    correlationId,
    dataClass: "R2",
    destination: target,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      apikey: anonKey,
      authorization: token,
      "x-correlation-id": correlationId,
    },
    maxResponseBytes: LIMITS.upstreamResponseBytes,
    method: "POST",
    surface: "bds.hud",
    timeoutMs: LIMITS.upstreamDeadlineMs,
  });

  writeUpstreamJson(response, upstream.response, upstream.text, correlationId);
}

function writeUpstreamJson(
  response: ServerResponse,
  upstream: Response,
  text: string,
  correlationId: string
): void {
  if (text) {
    try {
      JSON.parse(text);
    } catch {
      console.error(`[hud] non-JSON upstream status=${upstream.status} correlation_id=${correlationId}`);
      sendJson(
        response,
        502,
        errorPayload("UPSTREAM_RESPONSE_INVALID", "The support service returned an invalid response.", correlationId)
      );
      return;
    }
  }

  if (!upstream.ok) {
    console.error(`[hud] upstream error status=${upstream.status} correlation_id=${correlationId}`);
  }

  response.writeHead(upstream.status, {
    ...securityHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-correlation-id": correlationId,
    }),
  });
  response.end(text);
}

export function validateMessage(input: Record<string, unknown>): { message: string } {
  for (const key of Object.keys(input)) {
    if (key !== "message") {
      throw new HttpError(400, "UNKNOWN_FIELD", "Request body contains an unknown field.");
    }
  }
  const value = input.message;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", "message is required.");
  }
  const normalized = value.trim();
  // Allow tab/newline/CR in message bodies; reject other control characters.
  if (
    normalized.length < 1 ||
    normalized.length > 5000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)
  ) {
    throw new HttpError(400, "INVALID_FIELD", "message is invalid.");
  }
  return { message: normalized };
}
