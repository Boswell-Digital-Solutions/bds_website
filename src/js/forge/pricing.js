// Pricing controller. Renders the public catalog (products + plans) and starts
// Stripe Checkout for the paid plan.
//
// The free baseline plan (authorforge_included) is NOT checkout-able. To buy
// the paid plan we POST /v1/checkout and redirect the browser to checkout_url.
// Activation is confirmed later on the success page by polling — never by the
// redirect itself.

import { forge } from "./api.js";
import { getSession } from "./supabase.js";
import { describeForgeError, ForgeError } from "./errors.js";

const FREE_PLAN_KEY = "authorforge_included";
const container = document.querySelector("[data-plans]");
const statusEl = document.querySelector("[data-plans-status]");

function setStatus(state, message) {
  if (statusEl instanceof HTMLElement) {
    statusEl.dataset.state = state;
    statusEl.textContent = message;
  }
}

function formatPrice(plan) {
  const price = plan.price ?? plan.pricing ?? null;
  if (!price) {
    return plan.plan_key === FREE_PLAN_KEY ? "Included" : "";
  }
  const amount = typeof price.amount === "number" ? price.amount : null;
  const currency = (price.currency || "USD").toUpperCase();
  const interval = price.interval || price.recurring_interval;
  if (amount === null) {
    return "";
  }
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount / 100);
  return interval ? `${formatted} / ${interval}` : formatted;
}

function isPurchasable(plan) {
  return plan.plan_key !== FREE_PLAN_KEY;
}

function planCard(plan) {
  const card = document.createElement("article");
  card.className = "page-card forge-plan";
  if (isPurchasable(plan)) {
    card.classList.add("page-card--accent");
  }

  const name = plan.display_name || plan.name || plan.plan_key;
  const price = formatPrice(plan);

  card.innerHTML = `
    <div class="page-card__eyebrow">${isPurchasable(plan) ? "Pro" : "Included"}</div>
    <h3>${escapeHtml(name)}</h3>
    ${price ? `<p class="forge-plan__price">${escapeHtml(price)}</p>` : ""}
    ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ""}
  `;

  const actions = document.createElement("div");
  actions.className = "page-actions";

  if (isPurchasable(plan)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = "Upgrade to Pro";
    button.addEventListener("click", () => startCheckout(plan.plan_key, button));
    actions.appendChild(button);
  } else {
    const note = document.createElement("p");
    note.className = "page-note";
    note.textContent = "Free baseline — no checkout required.";
    card.appendChild(note);
  }

  card.appendChild(actions);
  return card;
}

async function startCheckout(planKey, button) {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent("/pricing.html");
    window.location.assign(`/login.html?next=${next}`);
    return;
  }

  button.disabled = true;
  setStatus("pending", "Starting secure checkout…");

  const origin = window.location.origin;
  try {
    const result = await forge.checkout({
      planKey,
      successUrl: `${origin}/checkout/success.html`,
      cancelUrl: `${origin}/checkout/cancel.html`,
      // Idempotency-Key guards against a double-submit creating two sessions.
      idempotencyKey: `checkout-${session.user.id}-${planKey}-${Date.now()}`,
    });

    const checkoutUrl = result?.checkout_url;
    if (!checkoutUrl) {
      throw new ForgeError({
        status: 502,
        code: "NO_CHECKOUT_URL",
        message: "Checkout could not be started.",
      });
    }
    // Hand the browser to Stripe-hosted checkout.
    window.location.assign(checkoutUrl);
  } catch (error) {
    const descriptor = describeForgeError(error);
    if (descriptor.redirect) {
      window.location.replace(descriptor.redirect);
      return;
    }
    setStatus("error", descriptor.message);
    button.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

async function render() {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  setStatus("pending", "Loading plans…");
  try {
    const plans = await forge.plans();
    const list = Array.isArray(plans) ? plans : plans?.plans ?? [];
    const authorforgePlans = list.filter(
      (plan) => !plan.product_key || plan.product_key === "authorforge"
    );

    container.innerHTML = "";
    if (authorforgePlans.length === 0) {
      setStatus("error", "No plans are available right now.");
      return;
    }
    for (const plan of authorforgePlans) {
      container.appendChild(planCard(plan));
    }
    setStatus("", "");
  } catch (error) {
    const descriptor = describeForgeError(error);
    setStatus("error", descriptor.message);
  }
}

render();
