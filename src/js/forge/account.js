// Account dashboard controller. All sections are read-only renderings of state
// ForgeCustomer owns: account identifiers, subscription, licenses, installations
// and devices, and usage. The only write offered here is deactivating an
// installation to free a device slot.

import { forge } from "./api.js";
import { signOut } from "./supabase.js";
import { bootstrapSession, handleForgeError } from "./session.js";
import { describeForgeError } from "./errors.js";

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

async function renderAccount() {
  const node = el("account");
  if (!node) return;
  try {
    const account = await forge.account();
    node.innerHTML = `
      <dl class="forge-meta">
        <div><dt>Account ID</dt><dd>${escapeHtml(account.id ?? account.account_id ?? "—")}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(account.email ?? "—")}</dd></div>
        ${account.display_name ? `<div><dt>Name</dt><dd>${escapeHtml(account.display_name)}</dd></div>` : ""}
        ${account.country_code ? `<div><dt>Country</dt><dd>${escapeHtml(account.country_code)}</dd></div>` : ""}
      </dl>`;
  } catch (error) {
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) setSectionError(node, error);
  }
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
  } catch {
    // bootstrapSession already redirected (login / suspended / closed).
    return;
  }
  if (!session) {
    return;
  }

  // Reads run in parallel; each section handles its own errors.
  await Promise.all([
    renderAccount(),
    renderSubscriptions(),
    renderLicenses(),
    renderInstallations(),
    renderUsage(),
  ]);
}

init();
