/**
 * HUD Tier 2 — signed-in conversation thread (phase 2a).
 *
 * Lazy-loaded by hud.js the first time a visitor opens the Messages tab, so the
 * Supabase client is never pulled onto pages that don't need it. When the
 * visitor is signed in, this takes over the Messages view: it renders the
 * persisted thread, polls for operator replies, and posts new messages through
 * the governed /api/hud BFF (RLS-scoped to the user).
 *
 * Returns false when the visitor is anonymous or Supabase is unconfigured, so
 * hud.js keeps the Tier 1 intake composer.
 */

import { getSession, getAccessToken } from "./forge/supabase.js";

const THREAD_URL = "/api/hud/thread";
const MESSAGES_URL = "/api/hud/messages";
const POLL_MS = 20000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * @param {HTMLElement} view  The #hud-view-messages element to take over.
 * @returns {Promise<boolean>} true if thread mode mounted, false to fall back.
 */
export async function mountThreadMode(view) {
  let session;
  try {
    session = await getSession();
  } catch {
    // Supabase isn't configured for this environment — fall back to Tier 1.
    return false;
  }
  if (!session) {
    return false;
  }

  view.innerHTML = `
    <div class="hud-thread" id="hud-thread" aria-live="polite"></div>
    <form class="hud-form hud-thread__composer" id="hud-thread-form" novalidate>
      <div class="hud-field">
        <label class="hud-field__label" for="hud-thread-input">Message</label>
        <textarea class="hud-textarea" id="hud-thread-input" name="message" maxlength="5000" required placeholder="Reply to BDS…"></textarea>
      </div>
      <button class="hud-btn hud-btn--primary" id="hud-thread-send" type="submit">Send</button>
      <p class="hud-form__status" id="hud-thread-status" role="status" aria-live="polite"></p>
    </form>`;

  const threadEl = view.querySelector("#hud-thread");
  const form = view.querySelector("#hud-thread-form");
  const input = view.querySelector("#hud-thread-input");
  const sendBtn = view.querySelector("#hud-thread-send");
  const statusEl = view.querySelector("#hud-thread-status");

  let messages = [];

  const setStatus = (state, text) => {
    statusEl.dataset.state = state;
    statusEl.textContent = text;
  };

  const render = () => {
    if (messages.length === 0) {
      threadEl.innerHTML = `<p class="hud-receipts__empty">No messages yet. Send one and BDS will reply here.</p>`;
      return;
    }
    threadEl.innerHTML = "";
    for (const m of messages) {
      const bubble = document.createElement("div");
      bubble.className = `hud-msg hud-msg--${m.author === "operator" ? "operator" : "visitor"}`;
      const body = document.createElement("div");
      body.className = "hud-msg__body";
      body.textContent = m.body;
      const meta = document.createElement("div");
      meta.className = "hud-msg__meta";
      meta.textContent = `${m.author === "operator" ? "BDS" : "You"} · ${formatTime(m.created_at)}`;
      bubble.append(body, meta);
      threadEl.append(bubble);
    }
    threadEl.scrollTop = threadEl.scrollHeight;
  };

  const applyThread = (doc) => {
    const next = Array.isArray(doc?.messages) ? doc.messages : [];
    // Only re-render when the message set actually changed.
    if (next.length !== messages.length || JSON.stringify(next) !== JSON.stringify(messages)) {
      messages = next;
      render();
    }
  };

  async function authedFetch(url, options = {}) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("UNAUTHENTICATED");
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...options,
        headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadThread() {
    if (document.visibilityState !== "visible") {
      return;
    }
    try {
      const res = await authedFetch(THREAD_URL);
      if (res.status === 503) {
        return; // Stay quiet; configuration may arrive later.
      }
      if (!res.ok) {
        return;
      }
      const doc = await res.json();
      applyThread(doc);
    } catch {
      // Transient; the next poll will retry.
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (message.length === 0) {
      return;
    }
    sendBtn.disabled = true;
    setStatus("pending", "Sending…");
    try {
      const res = await authedFetch(MESSAGES_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey() },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        throw new Error(`send failed (${res.status})`);
      }
      const doc = await res.json();
      applyThread(doc);
      input.value = "";
      setStatus("success", "Sent.");
    } catch (error) {
      setStatus("error", error instanceof Error && error.message === "UNAUTHENTICATED"
        ? "Your session expired. Sign in again to continue."
        : "Could not send. Please try again.");
    } finally {
      sendBtn.disabled = false;
    }
  });

  await loadThread();
  window.setInterval(loadThread, POLL_MS);
  return true;
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return `hud-msg-${globalThis.crypto.randomUUID()}`;
  }
  return `hud-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}
