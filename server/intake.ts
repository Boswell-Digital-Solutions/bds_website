import type { IncomingMessage, ServerResponse } from "node:http";

import { governedFetchText } from "./security/egress.ts";
import {
  HttpError,
  LIMITS,
  correlationIdFrom,
  errorPayload,
  handleHttpError,
  joinBaseUrl,
  normalizeIdempotencyKey,
  parseConfiguredBaseUrl,
  parseJsonObject,
  readLimitedBody,
  sendJson,
  singletonHeader,
  validateJsonContentType,
  validateSameOrigin,
} from "./security/http.ts";

const CONTACT_REASONS = new Set([
  "Services / consultation",
  "AuthorForge purchasing",
  "General support",
]);

// Pages permitted to submit through the intake lane. The HUD support messenger
// is a first-class source alongside the dedicated contact page.
const CONTACT_SOURCES = new Set(["contact.html", "hud"]);

export async function handleIntakeApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  if (url.pathname !== "/api/intake/consultation") {
    return false;
  }

  const correlationId = correlationIdFrom(request);
  const method = (request.method ?? "GET").toUpperCase();

  try {
    if (method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }

    validateSameOrigin(request);
    validateJsonContentType(request);
    const idempotencyKey = normalizeIdempotencyKey(
      singletonHeader(request.headers, "idempotency-key"),
      "required"
    );
    const body = await readLimitedBody(request, LIMITS.contactBodyBytes);
    const payload = validateContactPayload(parseJsonObject(body));

    const intakeBase = parseConfiguredBaseUrl(
      process.env.BDS_INTAKE_URL,
      "BDS_INTAKE_URL",
      "BDS_INTAKE_ALLOWED_HOSTS"
    );
    if (!intakeBase) {
      throw new HttpError(503, "INTAKE_UNCONFIGURED", "The intake service is not configured.");
    }

    const target = joinBaseUrl(intakeBase, "");
    const upstream = await governedFetchText({
      action: "intake.consultation.create",
      body: JSON.stringify(payload),
      correlationId,
      dataClass: "R3",
      destination: target,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-correlation-id": correlationId,
      },
      method: "POST",
      surface: "bds.intake",
      timeoutMs: LIMITS.upstreamDeadlineMs,
    });

    if (!upstream.response.ok) {
      sendJson(
        response,
        upstream.response.status >= 400 && upstream.response.status < 600
          ? upstream.response.status
          : 502,
        normalizeUpstreamError(upstream.text, correlationId)
      );
      return true;
    }

    sendJson(response, 202, { ok: true, correlation_id: correlationId });
    return true;
  } catch (error) {
    if (!handleHttpError(response, error, correlationId)) {
      sendJson(
        response,
        500,
        errorPayload("INTAKE_FAILED", "The intake request could not be processed.", correlationId)
      );
    }
    return true;
  }
}

export function validateContactPayload(input: Record<string, unknown>): Record<string, string> {
  const allowed = new Set(["name", "email", "reason", "message", "source_page", "turnstile_token"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, "UNKNOWN_FIELD", "Contact request contains an unknown field.");
    }
  }

  const name = boundedString(input.name, "name", 1, 120);
  const email = boundedString(input.email, "email", 3, 254).toLowerCase();
  const reason = boundedString(input.reason, "reason", 1, 80);
  const message = boundedString(input.message, "message", 1, 5000);
  const sourcePage = boundedString(input.source_page ?? "contact.html", "source_page", 1, 80);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "INVALID_EMAIL", "Email address is invalid.");
  }
  if (!CONTACT_REASONS.has(reason)) {
    throw new HttpError(400, "INVALID_REASON", "Contact reason is invalid.");
  }
  if (!CONTACT_SOURCES.has(sourcePage)) {
    throw new HttpError(400, "INVALID_SOURCE", "Contact source is invalid.");
  }

  const payload: Record<string, string> = { name, email, reason, message, source_page: sourcePage };
  if (typeof input.turnstile_token === "string" && input.turnstile_token.trim()) {
    payload.turnstile_token = input.turnstile_token.trim();
  }
  return payload;
}

function boundedString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is invalid.`);
  }
  return normalized;
}

function normalizeUpstreamError(text: string, correlationId: string): unknown {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Fall through to local error shape.
  }
  return errorPayload("INTAKE_UPSTREAM_ERROR", "The intake service rejected the request.", correlationId);
}
