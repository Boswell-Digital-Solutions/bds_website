// Account deletion lifecycle controller (privacy controls).
//
// Renders every state of a deletion request and offers create / cancel where
// allowed:
//   requested | verified | cooling_off  → cancel available
//   processing                          → point of no return, cancel disabled
//   completed | rejected | canceled     → terminal
// After completion ForgeCustomer returns 403 for the account, so we sign the
// user out gracefully.

import { forge } from "./api.js";
import { signOut } from "./supabase.js";
import { bootstrapSession, handleForgeError } from "./session.js";
import { ForgeError, describeForgeError } from "./errors.js";

const root = document.querySelector("[data-deletion]");

const CANCELLABLE = new Set(["requested", "verified", "cooling_off"]);
const TERMINAL = new Set(["completed", "rejected", "canceled"]);

const STATE_COPY = {
  requested: "Your deletion request has been received and is awaiting verification.",
  verified: "Your deletion request is verified and scheduled.",
  cooling_off: "Your account is in the cooling-off period. You can still cancel.",
  processing: "Your account is being deleted. This is the point of no return — it can no longer be canceled.",
  completed: "Your account has been deleted.",
  rejected: "Your deletion request was rejected. Contact support if you have questions.",
  canceled: "Your previous deletion request was canceled.",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function setBusy(busy) {
  root.querySelectorAll("button").forEach((btn) => {
    btn.disabled = busy;
  });
}

function renderError(message) {
  const notice = document.createElement("p");
  notice.className = "forge-section__error";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  root.prepend(notice);
}

function renderNoRequest() {
  root.innerHTML = `
    <p>Requesting deletion starts a verifiable, reversible-until-final process. You can cancel any time before processing begins.</p>
    <form class="page-form" data-deletion-form>
      <div class="page-field">
        <label for="deletion-reason">Reason (optional)</label>
        <textarea id="deletion-reason" name="reason" rows="3"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">Request account deletion</button>
    </form>`;

  const form = root.querySelector("[data-deletion-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(true);
    const reason = String(new FormData(form).get("reason") || "").trim();
    try {
      const request = await forge.requestDeletion(reason || undefined);
      renderRequest(request);
    } catch (error) {
      const descriptor = await handleForgeError(error);
      if (!descriptor.redirect) {
        renderNoRequest();
        renderError(descriptor.message);
      }
    }
  });
}

function renderRequest(request) {
  const state = String(request?.status ?? request?.state ?? "requested").toLowerCase();
  const copy = STATE_COPY[state] ?? `Deletion request status: ${state}.`;
  const coolingUntil = request?.cooling_off_until;

  if (state === "completed") {
    root.innerHTML = `<div class="forge-banner forge-banner--info"><p>${escapeHtml(copy)} Signing you out…</p></div>`;
    window.setTimeout(async () => {
      await signOut();
      window.location.replace("/account/closed.html");
    }, 1500);
    return;
  }

  const canCancel = CANCELLABLE.has(state);
  const showCancel = canCancel;
  const processingNote =
    state === "processing"
      ? `<p class="page-note">Cancellation is disabled at this stage.</p>`
      : "";
  const coolingNote =
    state === "cooling_off" && coolingUntil
      ? `<p class="page-note">Cooling-off ends ${escapeHtml(formatDate(coolingUntil))}.</p>`
      : "";

  root.innerHTML = `
    <div class="forge-banner forge-banner--${state === "processing" ? "warn" : "info"}">
      <strong>Deletion ${escapeHtml(state.replace(/_/g, " "))}</strong>
      <p>${escapeHtml(copy)}</p>
      ${coolingNote}
      ${processingNote}
    </div>
    ${
      TERMINAL.has(state)
        ? ""
        : `<div class="page-actions" data-deletion-actions></div>`
    }`;

  if (showCancel) {
    const actions = root.querySelector("[data-deletion-actions]");
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-primary";
    cancelBtn.textContent = "Cancel deletion request";
    cancelBtn.addEventListener("click", async () => {
      setBusy(true);
      try {
        const updated = await forge.cancelDeletion();
        renderRequest(updated ?? { status: "canceled" });
      } catch (error) {
        const descriptor = await handleForgeError(error);
        if (!descriptor.redirect) {
          renderRequest(request);
          renderError(descriptor.message);
        }
      }
    });
    actions.appendChild(cancelBtn);
  }

  // After a terminal "rejected"/"canceled" the user can start a new request.
  if (TERMINAL.has(state) && state !== "completed") {
    const restart = document.createElement("div");
    restart.className = "page-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.textContent = "Start a new deletion request";
    btn.addEventListener("click", renderNoRequest);
    restart.appendChild(btn);
    root.appendChild(restart);
  }
}

async function init() {
  if (!(root instanceof HTMLElement)) {
    return;
  }

  let session;
  try {
    ({ session } = await bootstrapSession({ requireAuth: true }));
  } catch {
    return;
  }
  if (!session) {
    return;
  }

  try {
    const request = await forge.getDeletionRequest();
    if (request && (request.status || request.state)) {
      renderRequest(request);
    } else {
      renderNoRequest();
    }
  } catch (error) {
    // No open request is commonly a 404 — show the create form.
    if (error instanceof ForgeError && error.status === 404) {
      renderNoRequest();
      return;
    }
    const descriptor = await handleForgeError(error);
    if (!descriptor.redirect) {
      renderNoRequest();
      renderError(describeForgeError(error).message);
    }
  }
}

init();
