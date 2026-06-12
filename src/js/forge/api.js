// Client for the website's ForgeCustomer BFF proxy (`/api/forge/*`).
//
// All ForgeCustomer calls go through our own server, which forwards the user's
// Supabase access token. This module attaches that token, parses the error
// contract centrally, and on a 401 transparently refreshes the session once and
// retries before surfacing the error.

import { getAccessToken } from "./supabase.js";
import { toForgeError } from "./errors.js";

const BASE = "/api/forge";

/**
 * @param {string} path  ForgeCustomer path, e.g. "/v1/subscriptions".
 * @param {object} opts
 * @param {string} [opts.method="GET"]
 * @param {unknown} [opts.body]            JSON-serialisable request body.
 * @param {boolean} [opts.requireAuth=true]
 * @param {string} [opts.idempotencyKey]   Forwarded as the Idempotency-Key header.
 */
export async function forgeFetch(path, opts = {}) {
  const { method = "GET", body, requireAuth = true, idempotencyKey } = opts;

  const doRequest = async (forceRefresh) => {
    const headers = { accept: "application/json" };

    if (requireAuth) {
      const token = await getAccessToken({ forceRefresh });
      if (!token) {
        // No session at all — synthesise a 401 so callers handle it uniformly.
        return new Response(
          JSON.stringify({
            error: { code: "UNAUTHENTICATED", message: "Sign in to continue.", correlation_id: null, details: null },
          }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }
      headers.authorization = `Bearer ${token}`;
    }

    if (idempotencyKey) {
      headers["idempotency-key"] = idempotencyKey;
    }

    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    return fetch(`${BASE}${path}`, { method, headers, body: payload });
  };

  let response = await doRequest(false);

  // One transparent refresh-and-retry on an expired token.
  if (response.status === 401 && requireAuth) {
    response = await doRequest(true);
  }

  if (!response.ok) {
    throw await toForgeError(response);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function idempotencyKey(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Typed convenience wrappers for each customer endpoint the website uses.
// ---------------------------------------------------------------------------

export const forge = {
  // Session bootstrap
  provision: (profile) =>
    forgeFetch("/v1/account/provision", { method: "POST", body: profile ?? {} }),

  // Public catalog (no auth)
  products: () => forgeFetch("/v1/products", { requireAuth: false }),
  plans: () => forgeFetch("/v1/plans", { requireAuth: false }),
  entitlementKeys: () => forgeFetch("/v1/entitlements/keys", { requireAuth: false }),

  // Checkout
  checkout: ({ planKey, successUrl, cancelUrl, idempotencyKey }) =>
    forgeFetch("/v1/checkout", {
      method: "POST",
      body: { plan_key: planKey, success_url: successUrl, cancel_url: cancelUrl },
      idempotencyKey,
    }),

  // Dashboard reads
  account: () => forgeFetch("/v1/account"),
  subscriptions: () => forgeFetch("/v1/subscriptions"),
  licenses: () => forgeFetch("/v1/licenses"),
  installations: () => forgeFetch("/v1/installations"),
  devices: () => forgeFetch("/v1/devices"),
  usageCurrent: () => forgeFetch("/v1/usage/current"),
  entitlementsCurrent: () => forgeFetch("/v1/entitlements/current"),

  // Installation management
  deactivateInstallation: (id) =>
    forgeFetch(`/v1/installations/${encodeURIComponent(id)}/deactivate`, {
      method: "POST",
      idempotencyKey: idempotencyKey("installation-deactivate"),
    }),

  // Account deletion lifecycle
  requestDeletion: (reason) =>
    forgeFetch("/v1/account/deletion-request", {
      method: "POST",
      body: reason ? { reason } : {},
      idempotencyKey: idempotencyKey("deletion-request"),
    }),
  getDeletionRequest: () => forgeFetch("/v1/account/deletion-request"),
  cancelDeletion: () =>
    forgeFetch("/v1/account/deletion-request/cancel", {
      method: "POST",
      idempotencyKey: idempotencyKey("deletion-cancel"),
    }),
};
