// Checkout success controller.
//
// HARD RULE: a browser redirect never activates an entitlement. This page only
// says "payment received, activating…" and polls GET /v1/subscriptions until
// the webhook-driven projection shows grants_cloud: true. On timeout we show a
// "this can take a minute" message with a manual refresh. The UI is NEVER
// flipped to "active" based on the redirect alone.

import { forge } from "./api.js";
import { bootstrapSession, handleForgeError } from "./session.js";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 60000;

const statusEl = document.querySelector("[data-checkout-status]");
const detailEl = document.querySelector("[data-checkout-detail]");
const actionsEl = document.querySelector("[data-checkout-actions]");

function setStatus(state, headline, detail) {
  if (statusEl instanceof HTMLElement) {
    statusEl.dataset.state = state;
    statusEl.textContent = headline;
  }
  if (detailEl instanceof HTMLElement) {
    detailEl.textContent = detail ?? "";
  }
}

function grantsCloud(subscriptions) {
  if (!subscriptions) {
    return false;
  }
  const list = Array.isArray(subscriptions)
    ? subscriptions
    : subscriptions.subscriptions ?? [subscriptions];
  return list.some((sub) => sub && sub.grants_cloud === true);
}

function showAccountLink() {
  if (actionsEl instanceof HTMLElement) {
    actionsEl.hidden = false;
  }
}

async function run() {
  // Bootstrap (and provision) before reading subscriptions.
  const { session } = await bootstrapSession({ requireAuth: true });
  if (!session) {
    return;
  }

  setStatus("pending", "Payment received, activating…", "Confirming your subscription with our customer service.");

  const deadline = Date.now() + TIMEOUT_MS;

  const poll = async () => {
    try {
      const subscriptions = await forge.subscriptions();
      if (grantsCloud(subscriptions)) {
        setStatus("success", "Your subscription is active.", "Cloud features are now enabled on your account.");
        showAccountLink();
        return;
      }
    } catch (error) {
      // Auth/suspended/closed errors redirect; transient errors keep polling.
      const descriptor = await handleForgeError(error);
      if (descriptor.redirect) {
        return;
      }
    }

    if (Date.now() < deadline) {
      window.setTimeout(poll, POLL_INTERVAL_MS);
    } else {
      setStatus(
        "pending",
        "This can take a minute…",
        "Activation is still processing. You can refresh this page, or check your account in a moment."
      );
      showAccountLink();
    }
  };

  poll();
}

run();
