/**
 * BDS Support HUD — bottom-right messenger widget.
 *
 * Self-injecting: importing this module builds and mounts the entire HUD, so a
 * page only needs to link `hud.css` and load `site.js` (which imports this).
 * Any legacy static HUD markup on the page is removed to avoid duplicates.
 *
 * Home tab   — system status, quick links, "Send us a message".
 * Messages   — composer that posts to the governed intake lane, plus the
 *              receipts of messages sent during this browser session.
 *
 * The HUD never mutates business state; it only reads `/healthz` and submits
 * to `/api/intake/consultation`, exactly like the contact page.
 */

const INTAKE_URL = "/api/intake/consultation";
const HEALTH_URL = "/healthz";
const DOCS_URL = "/architecture.html";
const RECEIPTS_KEY = "bds-hud-receipts";
const SUBMIT_TIMEOUT_MS = 8000;
const HEALTH_TIMEOUT_MS = 4000;

const QUICK_LINKS = [
  { label: "Browse products", href: "/products.html" },
  { label: "How the security model works", href: "/security.html" },
  { label: "Pricing", href: "/pricing.html" },
];

function shouldMount() {
  if (window.__bdsHudMounted) {
    return false;
  }
  // Only activate where the HUD stylesheet is present.
  return Boolean(document.querySelector('link[href*="hud.css"]'));
}

function removeLegacyMarkup() {
  for (const id of ["hud-dock", "hud-panel", "hud-overlay"]) {
    document.getElementById(id)?.remove();
  }
}

function template() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="hud-overlay" id="hud-overlay"></div>

    <div class="hud-dock" id="hud-dock" data-open="false">
      <button class="hud-dock__trigger" id="hud-trigger" aria-label="Open BDS support" aria-expanded="false" aria-controls="hud-panel">
        <svg class="hud-dock__trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      </button>
    </div>

    <section class="hud-panel" id="hud-panel" role="dialog" aria-label="BDS support" aria-hidden="true">
      <header class="hud-panel__header">
        <span class="hud-panel__title">BDS Support</span>
        <button class="hud-panel__close" id="hud-close" aria-label="Close support panel">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="hud-panel__views">
        <div class="hud-view hud-view--active" id="hud-view-home" role="tabpanel" aria-label="Home">
          <div class="hud-status" id="hud-status" data-state="checking">
            <span class="hud-status__dot"></span>
            <span class="hud-status__text">
              <span class="hud-status__label" id="hud-status-label">Checking status…</span>
              <span class="hud-status__meta" id="hud-status-meta"></span>
            </span>
          </div>

          <p class="hud-greeting"><strong>How can we help?</strong><br>Browse a quick link below, or send us a message and we'll follow up by email.</p>

          <div class="hud-suggestions" id="hud-suggestions"></div>

          <div class="hud-cta">
            <button class="hud-btn hud-btn--primary" id="hud-send-cta" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send us a message
            </button>
            <a class="hud-link" id="hud-docs" href="${DOCS_URL}">
              <svg class="hud-link__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Documentation
            </a>
          </div>
        </div>

        <div class="hud-view" id="hud-view-messages" role="tabpanel" aria-label="Messages" hidden>
          <form class="hud-form" id="hud-form" novalidate>
            <div class="hud-field">
              <label class="hud-field__label" for="hud-name">Name</label>
              <input class="hud-input" id="hud-name" name="name" type="text" autocomplete="name" maxlength="120" required placeholder="Your name">
            </div>
            <div class="hud-field">
              <label class="hud-field__label" for="hud-email">Email</label>
              <input class="hud-input" id="hud-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com">
            </div>
            <div class="hud-field">
              <label class="hud-field__label" for="hud-message">Message</label>
              <textarea class="hud-textarea" id="hud-message" name="message" maxlength="5000" required placeholder="How can we help?"></textarea>
            </div>
            <button class="hud-btn hud-btn--primary" id="hud-submit" type="submit">Send message</button>
            <p class="hud-form__status" id="hud-form-status" role="status" aria-live="polite"></p>
          </form>

          <div class="hud-receipts">
            <span class="hud-receipts__heading">Sent this session</span>
            <div id="hud-receipts-list"></div>
          </div>
        </div>
      </div>

      <nav class="hud-tabbar" role="tablist" aria-label="Support views">
        <button class="hud-tab" id="hud-tab-home" role="tab" aria-selected="true" aria-controls="hud-view-home" data-view="home">
          <svg class="hud-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Home
        </button>
        <button class="hud-tab" id="hud-tab-messages" role="tab" aria-selected="false" aria-controls="hud-view-messages" data-view="messages">
          <svg class="hud-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Messages
        </button>
      </nav>
    </section>`;
  return wrap;
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return `hud-${globalThis.crypto.randomUUID()}`;
  }
  return `hud-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readReceipts() {
  try {
    const raw = sessionStorage.getItem(RECEIPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReceipts(receipts) {
  try {
    sessionStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts.slice(0, 20)));
  } catch {
    // Storage may be unavailable (private mode); receipts stay in-memory only.
  }
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function mount() {
  removeLegacyMarkup();
  const fragment = template();
  document.body.append(...fragment.childNodes);
  window.__bdsHudMounted = true;

  const dock = document.getElementById("hud-dock");
  const trigger = document.getElementById("hud-trigger");
  const panel = document.getElementById("hud-panel");
  const overlay = document.getElementById("hud-overlay");
  const close = document.getElementById("hud-close");

  // ---- open / close ----
  const openHud = () => {
    panel.classList.add("hud-panel--open");
    overlay.classList.add("hud-overlay--visible");
    dock.dataset.open = "true";
    panel.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    close.focus();
    refreshStatus();
  };

  const closeHud = () => {
    panel.classList.remove("hud-panel--open");
    overlay.classList.remove("hud-overlay--visible");
    dock.dataset.open = "false";
    panel.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  };

  trigger.addEventListener("click", openHud);
  close.addEventListener("click", closeHud);
  overlay.addEventListener("click", closeHud);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("hud-panel--open")) {
      closeHud();
    }
  });

  // focus trap
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = [...panel.querySelectorAll(
      'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // ---- tabs ----
  const tabs = {
    home: document.getElementById("hud-tab-home"),
    messages: document.getElementById("hud-tab-messages"),
  };
  const views = {
    home: document.getElementById("hud-view-home"),
    messages: document.getElementById("hud-view-messages"),
  };

  const selectView = (name) => {
    for (const key of Object.keys(views)) {
      const active = key === name;
      tabs[key].setAttribute("aria-selected", String(active));
      views[key].classList.toggle("hud-view--active", active);
      views[key].hidden = !active;
    }
  };

  tabs.home.addEventListener("click", () => selectView("home"));
  tabs.messages.addEventListener("click", () => selectView("messages"));

  // ---- quick links ----
  const suggestions = document.getElementById("hud-suggestions");
  for (const link of QUICK_LINKS) {
    const a = document.createElement("a");
    a.className = "hud-suggestion";
    a.href = link.href;
    a.textContent = link.label;
    suggestions.append(a);
  }

  // "Send us a message" jumps to the composer
  document.getElementById("hud-send-cta").addEventListener("click", () => {
    selectView("messages");
    document.getElementById("hud-message").focus();
  });

  // ---- status card ----
  const statusEl = document.getElementById("hud-status");
  const statusLabel = document.getElementById("hud-status-label");
  const statusMeta = document.getElementById("hud-status-meta");
  let lastStatusCheck = 0;

  async function refreshStatus() {
    // Throttle to once per 30s while the panel is reopened.
    if (Date.now() - lastStatusCheck < 30000) {
      return;
    }
    lastStatusCheck = Date.now();

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(HEALTH_URL, { headers: { accept: "application/json" }, signal: controller.signal });
      if (response.ok) {
        statusEl.dataset.state = "operational";
        statusLabel.textContent = "All systems operational";
      } else {
        statusEl.dataset.state = "degraded";
        statusLabel.textContent = "Some services may be degraded";
      }
    } catch {
      statusEl.dataset.state = "down";
      statusLabel.textContent = "Status unavailable";
    } finally {
      clearTimeout(timer);
      statusMeta.textContent = `Checked ${formatTime(new Date().toISOString())}`;
    }
  }

  // ---- receipts ----
  const receiptsList = document.getElementById("hud-receipts-list");

  function renderReceipts() {
    const receipts = readReceipts();
    receiptsList.innerHTML = "";
    if (receipts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hud-receipts__empty";
      empty.textContent = "No messages sent yet.";
      receiptsList.append(empty);
      return;
    }
    for (const receipt of receipts) {
      const item = document.createElement("div");
      item.className = "hud-receipt";

      const meta = document.createElement("div");
      meta.className = "hud-receipt__meta";
      const when = document.createElement("span");
      when.textContent = formatTime(receipt.at);
      const tag = document.createElement("span");
      tag.textContent = "Received";
      meta.append(when, tag);

      const body = document.createElement("div");
      body.className = "hud-receipt__body";
      body.textContent = receipt.message;

      item.append(meta, body);
      receiptsList.append(item);
    }
  }

  renderReceipts();

  // ---- composer submit ----
  const form = document.getElementById("hud-form");
  const submitButton = document.getElementById("hud-submit");
  const formStatus = document.getElementById("hud-form-status");
  const nameInput = document.getElementById("hud-name");
  const emailInput = document.getElementById("hud-email");
  const messageInput = document.getElementById("hud-message");

  const setFormStatus = (state, message) => {
    formStatus.dataset.state = state;
    formStatus.textContent = message;
  };

  const setSubmitting = (submitting) => {
    submitButton.disabled = submitting;
    submitButton.textContent = submitting ? "Sending…" : "Send message";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const payload = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      reason: "General support",
      message: messageInput.value.trim(),
      source_page: "hud",
    };

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    setSubmitting(true);
    setFormStatus("pending", "Sending your message to BDS…");

    try {
      const response = await fetch(INTAKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const receipts = readReceipts();
      receipts.unshift({ at: new Date().toISOString(), message: payload.message });
      writeReceipts(receipts);
      renderReceipts();

      form.reset();
      setFormStatus("success", "Message received. BDS will follow up by email.");
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "The request timed out after 8 seconds."
          : error instanceof Error
            ? error.message
            : "Your message could not be sent.";
      setFormStatus("error", `${message} You can also email contact@boswelldigitalsolutions.com.`);
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  });
}

async function parseError(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
      return payload.error.message.trim();
    }
  } catch {
    // Fall through to a generic message.
  }
  return `Request failed: ${response.status} ${response.statusText}`;
}

if (shouldMount()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}
