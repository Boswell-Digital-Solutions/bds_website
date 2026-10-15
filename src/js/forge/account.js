// Account dashboard controller. All sections are read-only renderings of state
// ForgeCustomer owns: account identifiers, subscription, licenses, installations
// and devices, and usage. The only write offered here is deactivating an
// installation to free a device slot.

import { forge } from "./api.js";
import { signOut } from "./supabase.js";
import { bootstrapSession, handleForgeError } from "./session.js";
import { describeForgeError } from "./errors.js";
import { listFactors, enroll, verifyCode, unenroll, describeMfaError } from "./mfa.js";

// --- small DOM/format helpers ---------------------------------------------

function el(id) {
  return document.querySelector(`[data-${id}]`);
}

function setSectionError(node, error) {
  const descriptor = describeForgeError(error);
  const support = error?.correlationId
    ? ` <span class="forge-ref">Reference: ${escapeHtml(error.correlationId)}</span>`
    : "";
  node.innerHTML =
    `<p class="forge-section__error" role="alert">${escapeHtml(descriptor.message)}${support}</p>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function badge(status) {
  const value = String(status ?? "unknown").toLowerCase();
  const tone =
    value.includes("active") || value === "ok"
      ? "ok"
      : value.includes("revok") || value.includes("suspend") || value.includes("expired")
        ? "bad"
        : "neutral";
  return `<span class="forge-badge forge-badge--${tone}">${escapeHtml(status ?? "unknown")}</span>`;
}

function asList(value, key) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && Array.isArray(value[key])) {
    return value[key];
  }
  return value ? [value] : [];
}

// --- sections --------------------------------------------------------------

async function renderAccount(session) {
  const node = el("account");
  if (!node) return;
  try {
    const account = await forge.account();
    node.innerHTML = `
      <dl class="forge-meta">
        <div><dt>Account ID</dt><dd>${escapeHtml(account.customer_id ?? account.id ?? account.account_id ?? "—")}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(session?.user?.email ?? "—")}</dd></div>
        ${account.display_name ? `<div><dt>Name</dt><dd>${escapeHtml(account.display_name)}</dd></div>` : ""}
        ${account.country_code ? `<div><dt>Country</dt><dd>${escapeHtml(account.country_code)}</dd></div>` : ""}
      </dl>`;
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
}

// --- two-factor authentication ---------------------------------------------
// Supabase owns the factor and its secret; this only enrolls, confirms, and
// removes it. See docs/plans/two-factor-authentication-plan.md.

function setMfaError(node, error, retry) {
  node.innerHTML = `
    <p class="forge-section__error" role="alert">${escapeHtml(describeMfaError(error))}</p>
    <button type="button" class="btn btn-ghost btn-small" data-mfa-retry>Try again</button>`;
  node.querySelector("[data-mfa-retry]").addEventListener("click", retry);
}

async function renderMfa() {
  const node = el("mfa");
  if (!node) return;
  try {
    const factors = await listFactors();
    // Fire-and-forget: self-heals ForgeCustomer's enforcement flag against Supabase's
    // real factor state (the source of truth) on every visit to this page, so a sync
    // that failed after a past enroll/unenroll — or was never attempted at all — gets
    // another chance here rather than drifting indefinitely. Never blocks rendering.
    reconcileMfaStatus(factors.length > 0);
    if (factors.length === 0) {
      renderMfaSetup(node);
    } else {
      renderMfaEnabled(node, factors);
    }
  } catch (error) {
    setMfaError(node, error, () => renderMfa());
  }
}

async function reconcileMfaStatus(actuallyEnabled) {
  let account;
  try {
    account = await forge.account();
  } catch {
    return; // Can't tell if it's out of sync; next render tries again.
  }
  if (account?.mfa_required === actuallyEnabled) {
    return;
  }
  try {
    await forge.setMfaStatus(actuallyEnabled);
  } catch (error) {
    console.warn("[account] mfa-status reconciliation deferred:", error);
  }
}

function renderMfaEnabled(node, factors) {
  const rows = factors
    .map(
      (factor, index) => `
      <div class="forge-row">
        <div class="forge-row__main">
          <strong>${escapeHtml(factor.friendly_name || `Authenticator ${index + 1}`)}</strong>
        </div>
        <div class="forge-row__side">
          <button type="button" class="btn btn-ghost btn-small" data-mfa-remove="${escapeHtml(factor.id)}">Remove</button>
        </div>
      </div>`
    )
    .join("");

  const backupIntro =
    factors.length === 1
      ? `<p class="forge-section__intro">Add a second authenticator as a backup in case you lose access to this one.</p>`
      : "";

  node.innerHTML = `
    ${rows}
    ${backupIntro}
    <button type="button" class="btn btn-ghost btn-small" data-mfa-enroll>Add backup authenticator</button>
    <p class="page-form__status" data-mfa-status role="status" aria-live="polite"></p>`;

  const status = node.querySelector("[data-mfa-status]");

  node.querySelectorAll("[data-mfa-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const factorId = button.getAttribute("data-mfa-remove");
      button.disabled = true;
      button.textContent = "Removing…";
      try {
        await unenroll(factorId);
        // renderMfa()'s reconciliation reports the new (possibly now-zero) factor
        // count to ForgeCustomer — no separate sync call needed here.
        await renderMfa();
      } catch {
        status.dataset.state = "error";
        status.textContent = "Couldn't remove this right now. Try again in a moment.";
        button.disabled = false;
        button.textContent = "Remove";
      }
    });
  });

  node.querySelector("[data-mfa-enroll]").addEventListener("click", () => startMfaEnrollment(node));
}

function renderMfaSetup(node) {
  node.innerHTML = `
    <p class="forge-empty">Not enabled.</p>
    <button type="button" class="btn btn-ghost btn-small" data-mfa-enroll>Set up two-factor authentication</button>`;
  node.querySelector("[data-mfa-enroll]").addEventListener("click", () => startMfaEnrollment(node));
}

async function startMfaEnrollment(node) {
  node.innerHTML = `<p class="forge-empty">Preparing setup…</p>`;
  let enrollment;
  try {
    enrollment = await enroll();
  } catch (error) {
    setMfaError(node, error, () => startMfaEnrollment(node));
    return;
  }

  node.innerHTML = `
    <p class="forge-section__intro">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
    <img class="forge-mfa__qr" data-mfa-qr alt="QR code for two-factor authentication setup" width="180" height="180">
    <p class="forge-mfa__secret">Can't scan it? Enter this key manually: <code>${escapeHtml(enrollment.secret)}</code></p>
    <div class="page-field">
      <label for="mfa-setup-code">6-digit code</label>
      <input id="mfa-setup-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6">
    </div>
    <p class="page-form__status" data-mfa-status role="status" aria-live="polite"></p>
    <button type="button" class="btn btn-primary btn-small" data-mfa-confirm>Confirm</button>
    <button type="button" class="btn btn-ghost btn-small" data-mfa-cancel>Cancel</button>`;

  // Set the URL as a DOM property; never parse the provider's SVG as markup.
  node.querySelector("[data-mfa-qr]").src = enrollment.qrCode;
  const status = node.querySelector("[data-mfa-status]");
  const codeInput = node.querySelector("#mfa-setup-code");

  node.querySelector("[data-mfa-cancel]").addEventListener("click", async () => {
    try {
      await unenroll(enrollment.factorId);
    } catch {
      // Best-effort cleanup; the next setup attempt retries unverified cleanup.
    }
    // Re-derive state rather than assuming "not enabled" — this may have been
    // an attempt to add a backup factor with one already active.
    renderMfa();
  });

  node.querySelector("[data-mfa-confirm]").addEventListener("click", async () => {
    const code = String(codeInput.value || "").trim();
    if (!code) {
      status.dataset.state = "error";
      status.textContent = "Enter the 6-digit code from your authenticator app.";
      return;
    }
    status.dataset.state = "pending";
    status.textContent = "Confirming…";
    try {
      await verifyCode(enrollment.factorId, code);
    } catch {
      status.dataset.state = "error";
      status.textContent = "That code didn't work. Try again.";
      codeInput.value = "";
      codeInput.focus();
      return;
    }
    // renderMfa()'s reconciliation reports the new factor count to ForgeCustomer —
    // no separate sync call needed here.
    await renderMfa();
  });
}

async function renderSubscriptions() {
  const node = el("subscriptions");
  if (!node) return;
  try {
    const subs = asList(await forge.subscriptions(), "subscriptions");
    if (subs.length === 0) {
      node.innerHTML = `<p class="forge-empty">No subscription yet. The free baseline is included. <a href="/pricing.html">View plans</a>.</p>`;
      return;
    }
    node.innerHTML = subs
      .map((sub) => {
        const cloud = sub.grants_cloud
          ? `<span class="forge-badge forge-badge--ok">Cloud enabled</span>`
          : `<span class="forge-badge forge-badge--neutral">Local only</span>`;
        const renews = sub.cancel_at_period_end
          ? `Cancels on ${formatDate(sub.current_period_end)}`
          : sub.current_period_end
            ? `Renews on ${formatDate(sub.current_period_end)}`
            : "";
        return `
          <div class="forge-row">
            <div class="forge-row__main">
              <strong>${escapeHtml(sub.plan_key ?? sub.plan ?? "Subscription")}</strong>
              <div class="forge-row__sub">${renews ? escapeHtml(renews) : ""}</div>
            </div>
            <div class="forge-row__side">${badge(sub.status)} ${cloud}</div>
          </div>`;
      })
      .join("");
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
}

async function renderLicenses() {
  const node = el("licenses");
  if (!node) return;
  try {
    const licenses = asList(await forge.licenses(), "licenses");
    if (licenses.length === 0) {
      node.innerHTML = `<p class="forge-empty">No licenses on this account.</p>`;
      return;
    }
    node.innerHTML = licenses
      .map((lic) => {
        const used = lic.active_devices ?? 0;
        const limit = lic.device_limit ?? 0;
        return `
          <div class="forge-row">
            <div class="forge-row__main">
              <strong>${escapeHtml(lic.product_key ?? lic.key ?? lic.id ?? "License")}</strong>
              <div class="forge-row__sub">Devices: ${escapeHtml(String(used))} of ${escapeHtml(String(limit))}</div>
            </div>
            <div class="forge-row__side">${badge(lic.status)}</div>
          </div>`;
      })
      .join("");
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
}

async function renderInstallations() {
  const node = el("installations");
  if (!node) return;
  try {
    const installations = asList(await forge.installations(), "installations");
    if (installations.length === 0) {
      node.innerHTML = `<p class="forge-empty">No active installations.</p>`;
      return;
    }
    node.innerHTML = "";
    for (const inst of installations) {
      const id = inst.id ?? inst.installation_id;
      const label =
        inst.device_name || inst.hostname || inst.device?.name || inst.platform || "Device";
      const lastSeen = inst.last_heartbeat ?? inst.last_seen_at ?? inst.last_heartbeat_at;

      const row = document.createElement("div");
      row.className = "forge-row";
      row.innerHTML = `
        <div class="forge-row__main">
          <strong>${escapeHtml(label)}</strong>
          <div class="forge-row__sub">Last heartbeat: ${escapeHtml(formatDate(lastSeen))}</div>
        </div>
        <div class="forge-row__side">${badge(inst.status)}</div>`;

      const side = row.querySelector(".forge-row__side");
      const isRevoked = String(inst.status ?? "").toLowerCase().includes("revok");
      if (id && !isRevoked) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-ghost btn-small";
        button.textContent = "Remove this device";
        button.addEventListener("click", () => deactivate(id, button, node));
        side.appendChild(button);
      }
      node.appendChild(row);
    }
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
}

async function deactivate(id, button, node) {
  button.disabled = true;
  button.textContent = "Removing…";
  try {
    await forge.deactivateInstallation(id);
    // Re-read installations and licenses so the freed slot is reflected.
    await Promise.all([renderInstallations(), renderLicenses()]);
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) {
      // 403 REVOKED and other non-redirecting errors render inline near the row.
      const notice = document.createElement("p");
      notice.className = "forge-section__error";
      notice.setAttribute("role", "alert");
      notice.textContent = descriptor.message;
      node.prepend(notice);
      button.disabled = false;
      button.textContent = "Remove this device";
    }
  }
}

async function renderUsage() {
  const node = el("usage");
  if (!node) return;
  try {
    const usage = await forge.usageCurrent();
    const meters = asList(usage, "meters");
    if (meters.length === 0) {
      node.innerHTML = `<p class="forge-empty">No usage to display for the current period.</p>`;
      return;
    }
    node.innerHTML = meters
      .map((meter) => {
        const used = Number(meter.used ?? 0);
        const reserved = Number(meter.reserved ?? 0);
        const limit = Number(meter.limit ?? 0);
        const remaining = meter.remaining ?? Math.max(limit - used - reserved, 0);
        const pct = limit > 0 ? Math.min(((used + reserved) / limit) * 100, 100) : 0;
        const name = meter.meter ?? meter.name ?? meter.key ?? "Usage";
        return `
          <div class="forge-usage">
            <div class="forge-usage__head">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(String(used))}${reserved ? ` (+${escapeHtml(String(reserved))} reserved)` : ""} / ${limit ? escapeHtml(String(limit)) : "∞"}</span>
            </div>
            <div class="forge-usage__bar"><span style="width:${pct}%"></span></div>
            <div class="forge-usage__foot">
              <span>${escapeHtml(String(remaining))} remaining</span>
              ${meter.period_key ? `<span>Period ${escapeHtml(String(meter.period_key))}</span>` : ""}
            </div>
          </div>`;
      })
      .join("");
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
}

// Self-service billing: hand the browser to the Stripe Customer Portal. ForgeCustomer
// mints an ephemeral session; nothing here mutates subscription truth — the customer's
// change reprojects via webhook and shows on next load. Free-baseline accounts get a
// friendly 409 (NO_BILLING_ACCOUNT) rendered inline rather than a redirect.
function wireBillingPortal() {
  const button = document.querySelector("[data-billing-portal]");
  if (!(button instanceof HTMLButtonElement)) return;
  const status = document.querySelector("[data-billing-portal-status]");
  button.hidden = false;
  button.addEventListener("click", async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Opening…";
    if (status) status.textContent = "";
    try {
      const result = await forge.billingPortal({
        returnUrl: `${window.location.origin}/account.html`,
      });
      const url = result?.url;
      if (!url) throw new Error("Billing portal did not return a URL.");
      window.location.assign(url);
    } catch (error) {
      const descriptor = await handleForgeError(error);
      if (!descriptor.redirect) {
        if (status) status.textContent = descriptor.message;
        button.disabled = false;
        button.textContent = original;
      }
    }
  });
}

// --- bootstrap -------------------------------------------------------------

async function init() {
  const signoutBtn = document.querySelector("[data-signout]");
  if (signoutBtn instanceof HTMLButtonElement) {
    signoutBtn.addEventListener("click", async () => {
      await signOut();
      window.location.assign("/login.html");
    });
  }

  let session;
  try {
    ({ session } = await bootstrapSession({ requireAuth: true }));
  } catch (error) {
    // Auth/account-state failures redirect; outages need a visible failure state.
    if (!describeForgeError(error).redirect) {
      for (const section of ["account", "mfa", "subscriptions", "licenses", "installations", "usage"]) {
        const node = el(section);
        if (node) setSectionError(node, error);
      }
      const accountNode = el("account");
      if (accountNode) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-ghost";
        retry.textContent = "Retry loading account";
        retry.addEventListener("click", () => window.location.reload());
        accountNode.appendChild(retry);
      }
    }
    return;
  }
  if (!session) {
    return;
  }

  wireBillingPortal();

  // Reads run in parallel; each section handles its own errors.
  await Promise.all([
    renderAccount(session),
    renderMfa(),
    renderSubscriptions(),
    renderLicenses(),
    renderInstallations(),
    renderUsage(),
  ]);
}

init();
