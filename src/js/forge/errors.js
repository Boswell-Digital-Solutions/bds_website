// Central handling of the ForgeCustomer error contract.
//
// Every non-2xx response carries:
//   { "error": { "code", "message", "correlation_id", "details" } }
//
// This module turns that into a typed ForgeError and maps the (status, code)
// pair to a consistent UX treatment. The correlation_id is always preserved and
// logged so it can be quoted to support.

export class ForgeError extends Error {
  constructor({ status, code, message, correlationId, details }) {
    super(message || code || `Request failed (${status})`);
    this.name = "ForgeError";
    this.status = status;
    this.code = code || "";
    this.correlationId = correlationId || "";
    this.details = details ?? null;
  }
}

/**
 * Parse a fetch Response into a ForgeError, tolerating non-JSON bodies.
 */
export async function toForgeError(response) {
  let code = "";
  let message = "";
  let correlationId = "";
  let details = null;
  try {
    const payload = await response.json();
    const err = payload?.error ?? {};
    code = err.code ?? "";
    message = err.message ?? "";
    correlationId = err.correlation_id ?? "";
    details = err.details ?? null;
  } catch {
    // Non-JSON error (proxy outage, gateway HTML, etc.).
  }
  const error = new ForgeError({
    status: response.status,
    code,
    message,
    correlationId,
    details,
  });
  // Always log the correlation id with the error for support.
  console.error(
    `[forge] error status=${error.status} code=${error.code || "?"} ` +
      `correlation_id=${error.correlationId || "(none)"}`,
    error.details ?? ""
  );
  return error;
}

// Pages a suspended / closed account is redirected to instead of seeing a raw
// error. These are root-absolute so they resolve from any nesting depth.
export const SUSPENDED_PAGE = "/account/suspended.html";
export const CLOSED_PAGE = "/account/closed.html";
export const LOGIN_PAGE = "/login.html";

/**
 * Map a ForgeError to a UX descriptor:
 *   { title, message, action, redirect, signOut }
 *
 * `redirect` (when set) is a URL the controller should navigate to.
 * `signOut` requests the session be cleared before any redirect.
 */
export function describeForgeError(error) {
  if (!(error instanceof ForgeError)) {
    return {
      title: "Something went wrong",
      message: "An unexpected error occurred. Please try again.",
    };
  }

  const { status, code, details } = error;
  const correlation = error.correlationId
    ? ` (reference: ${error.correlationId})`
    : "";

  switch (status) {
    case 401:
      // UNAUTHENTICATED / TOKEN_EXPIRED — refresh session or re-login.
      return {
        title: "Please sign in again",
        message: "Your session has expired. Sign in to continue.",
        redirect: LOGIN_PAGE,
        signOut: true,
      };

    case 403:
      if (code === "CUSTOMER_SUSPENDED") {
        return {
          title: "Account suspended",
          message: "This account is currently suspended.",
          redirect: SUSPENDED_PAGE,
        };
      }
      if (code === "REVOKED") {
        // Revocation is operator-driven and never self-serviceable. Surface it
        // distinctly with a support path instead of redirecting.
        return {
          title: "Access revoked",
          message:
            "This license or device was revoked and can't be restored from here. Contact support for help.",
          action: { label: "Contact support", href: "/contact.html" },
        };
      }
      // FORBIDDEN — account closed (post-deletion) or unprovisioned.
      return {
        title: "Account unavailable",
        message: "This account is closed or not provisioned.",
        redirect: CLOSED_PAGE,
        signOut: true,
      };

    case 402: {
      const limit = details?.limit;
      const used = details?.used;
      const counts =
        Number.isFinite(limit) && Number.isFinite(used) ? ` (${used} of ${limit} used)` : "";
      if (code === "DEVICE_LIMIT_REACHED") {
        return {
          title: "Device limit reached",
          message: `You've reached your device limit${counts}. Remove a device to free a slot.`,
        };
      }
      // QUOTA_EXCEEDED — upsell.
      return {
        title: "Plan limit reached",
        message: `You've reached a limit on your current plan${counts}. Upgrade to continue.`,
        action: { label: "View plans", href: "/pricing.html" },
      };
    }

    case 422: {
      // VALIDATION_FAILED — details.field names the offending input.
      const field = details?.field;
      return {
        title: "Check your input",
        message: field
          ? `The "${field}" value isn't valid. Please correct it and try again.`
          : error.message || "Some of the information provided isn't valid.",
        field,
      };
    }

    case 409:
      return {
        title: "Conflict",
        message:
          error.message || "This request conflicts with the current state. Refresh and try again.",
      };

    default:
      return {
        title: "Something went wrong",
        message: `${error.message || "An unexpected error occurred."}${correlation}`,
      };
  }
}
