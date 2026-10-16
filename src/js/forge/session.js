// Session bootstrap and shared error handling for authenticated pages.
//
// `bootstrapSession` is the single entry point authenticated pages call before
// any other ForgeCustomer request. It guarantees `POST /v1/account/provision`
// has run once for this browser session (idempotent server-side; we also guard
// with sessionStorage to avoid redundant calls), so the customer profile exists
// before the dashboard reads run.

import { getSession } from "./supabase.js";
import { forge } from "./api.js";
import { describeForgeError, LOGIN_PAGE } from "./errors.js";
import { signOut } from "./supabase.js";
import { hasPendingChallenge, listFactors } from "./mfa.js";

const PROVISION_FLAG = "bds.forge.provisioned";
const MFA_GRACE_CACHE_KEY = "bds.forge.mfaGraceEndsAt";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Ensure there is a signed-in session and the account is provisioned.
 *
 * @param {object} opts
 * @param {boolean} [opts.requireAuth=true]  Redirect to login when signed out.
 * @param {function} [opts.onRetry] Reports safe account-service reconnection.
 * @returns {Promise<{ session: object|null }>}
 */
export async function bootstrapSession({ requireAuth = true, onRetry } = {}) {
  const session = await getSession();

  // A session that hasn't completed a required MFA step-up (AAL2) is treated
  // the same as no session — this is what catches a magic-link redemption or
  // a stale tab for an account that has 2FA enabled, since neither of those
  // paths runs login.js's own post-password-signin challenge check.
  if (!session || (requireAuth && (await hasPendingChallenge()))) {
    if (requireAuth) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${LOGIN_PAGE}?next=${next}`);
    }
    return { session: null };
  }

  // Provision once per session (idempotent on the server; returns the existing
  // profile with created:false on repeat). Must precede any other call.
  if (sessionStorage.getItem(PROVISION_FLAG) !== session.user.id) {
    try {
      await forge.provision(defaultProvisionProfile(), { onRetry });
      sessionStorage.setItem(PROVISION_FLAG, session.user.id);
    } catch (error) {
      // A suspended/closed account surfaces here on the very first call.
      await handleForgeError(error);
      throw error;
    }
  }

  await showMfaGraceReminder(onRetry);

  return { session };
}

/**
 * Show a site-wide reminder banner while this account is inside its
 * mandatory-MFA grace period (ForgeCustomer's `mfa_grace_period_ends_at`) and
 * hasn't enrolled a factor yet. Best-effort throughout: any failure here just
 * skips the reminder for this page load rather than affecting sign-in.
 */
async function showMfaGraceReminder(onRetry) {
  let endsAtRaw = sessionStorage.getItem(MFA_GRACE_CACHE_KEY);
  if (endsAtRaw === null) {
    try {
      const account = await forge.account({ onRetry });
      endsAtRaw = account?.mfa_grace_period_ends_at || "";
    } catch {
      endsAtRaw = "";
    }
    sessionStorage.setItem(MFA_GRACE_CACHE_KEY, endsAtRaw);
  }
  if (!endsAtRaw) {
    return;
  }

  const msRemaining = new Date(endsAtRaw).getTime() - Date.now();
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) {
    return;
  }

  // Always checked live (never cached): the whole point is that this
  // disappears the moment the account actually enrolls a factor.
  let factorCount;
  try {
    factorCount = (await listFactors()).length;
  } catch {
    return;
  }
  if (factorCount > 0) {
    return;
  }

  renderMfaGraceBanner(Math.ceil(msRemaining / MS_PER_DAY));
}

function renderMfaGraceBanner(daysRemaining) {
  if (document.querySelector("[data-mfa-grace-banner]")) {
    return;
  }
  const banner = document.createElement("div");
  banner.dataset.mfaGraceBanner = "";
  banner.setAttribute("role", "status");
  const days = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
  banner.innerHTML = `
    <p>Two-factor authentication is now required on every account. You have ${days} left to set it up.</p>
    <a href="/account.html">Set up two-factor authentication</a>`;
  document.body.prepend(banner);
}

function defaultProvisionProfile() {
  // Best-effort, all-optional hints. ForgeCustomer fills the rest.
  const profile = {};
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      profile.timezone = tz;
    }
  } catch {
    // Ignore — timezone is optional.
  }
  return profile;
}

/**
 * Apply the central error→UX mapping. Performs sign-out and/or redirect when the
 * descriptor calls for it (401 re-login, 403 suspended/closed pages). Returns
 * the descriptor so callers can render inline messaging for the rest.
 */
export async function handleForgeError(error) {
  const descriptor = describeForgeError(error);

  if (descriptor.signOut) {
    try {
      await signOut();
    } catch {
      // Sign-out best-effort; still proceed to redirect.
    }
  }

  if (descriptor.redirect) {
    window.location.replace(descriptor.redirect);
  }

  return descriptor;
}
