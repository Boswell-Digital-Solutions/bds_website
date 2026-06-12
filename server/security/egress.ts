import { createHash, randomUUID } from "node:crypto";

import {
  HttpError,
  LIMITS,
  logSecurityEvent,
  readCappedResponseText,
  validateUpstreamContentType,
} from "./http.ts";

export interface GovernedEgressRequest {
  action: string;
  body?: BodyInit;
  correlationId: string;
  dataClass: "R0" | "R1" | "R2" | "R3";
  destination: string;
  headers: Record<string, string>;
  maxResponseBytes?: number;
  method: string;
  surface: string;
  timeoutMs?: number;
}

export interface GovernedEgressResponse {
  authorizationId: string;
  response: Response;
  text: string;
}

export async function governedFetchText(
  request: GovernedEgressRequest
): Promise<GovernedEgressResponse> {
  const authorizationId = `cssa_${cssaMode().toLowerCase()}_${randomUUID()}`;
  const destination = new URL(request.destination);
  const started = performance.now();
  const requestDigest = digestRequest(request.method, destination, request.body);

  logSecurityEvent("info", "bds.cssa.authorization.shadow", {
    authorization_id: authorizationId,
    correlation_id: request.correlationId,
    action: request.action,
    surface: request.surface,
    data_class: request.dataClass,
    destination_host: destination.hostname,
    method: request.method,
    request_digest: requestDigest,
    mode: cssaMode(),
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? LIMITS.upstreamDeadlineMs
  );

  let response: Response;
  let text = "";
  try {
    response = await fetch(destination, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      signal: controller.signal,
    });
    validateUpstreamContentType(response);
    text = await readCappedResponseText(response, request.maxResponseBytes);
  } catch (cause) {
    const durationMs = Math.round(performance.now() - started);
    logSecurityEvent("warn", "bds.cssa.outcome.shadow", {
      authorization_id: authorizationId,
      correlation_id: request.correlationId,
      action: request.action,
      surface: request.surface,
      duration_ms: durationMs,
      outcome: "failed",
      error: cause instanceof Error ? cause.name : "unknown",
      mode: cssaMode(),
    });
    if (cause instanceof HttpError) {
      throw cause;
    }
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new HttpError(504, "UPSTREAM_TIMEOUT", "Upstream request timed out.");
    }
    throw new HttpError(502, "UPSTREAM_UNAVAILABLE", "Upstream service could not be reached.");
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - started);
  logSecurityEvent("info", "bds.cssa.outcome.shadow", {
    authorization_id: authorizationId,
    correlation_id: request.correlationId,
    action: request.action,
    surface: request.surface,
    duration_ms: durationMs,
    outcome: response.ok ? "succeeded" : "upstream_error",
    status: response.status,
    response_bytes: Buffer.byteLength(text, "utf8"),
    response_digest: createHash("sha256").update(text).digest("hex"),
    mode: cssaMode(),
  });

  return { authorizationId, response, text };
}

function cssaMode(): "OFF" | "SHADOW" | "CANARY" | "ACTIVE" {
  const configured = (process.env.BDS_CSSA_MODE ?? "SHADOW").toUpperCase();
  return configured === "OFF" || configured === "CANARY" || configured === "ACTIVE"
    ? configured
    : "SHADOW";
}

function digestRequest(method: string, destination: URL, body: BodyInit | undefined): string {
  const hash = createHash("sha256");
  hash.update(method.toUpperCase());
  hash.update("\n");
  hash.update(destination.origin);
  hash.update(destination.pathname);
  hash.update(destination.search);
  hash.update("\n");
  if (typeof body === "string") {
    hash.update(body);
  } else if (body instanceof Uint8Array) {
    hash.update(body);
  } else if (body) {
    hash.update("[body]");
  }
  return hash.digest("hex");
}
