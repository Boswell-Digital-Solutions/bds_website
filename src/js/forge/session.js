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

const PROVISION_FLAG = "bds.forge.provisioned";

/**
 * Ensure there is a signed-in session and the account is provisioned.
 *
 * @param {object} opts
 * @param {boolean} [opts.requireAuth=true]  Redirect to login when signed out.
 * @returns {Promise<{ session: object|null }>}
 */
export async function bootstrapSession({ requireAuth = true } = {}) {
  const session = await getSession();

  if (!session) {
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
      await forge.provision(defaultProvisionProfile());
      sessionStorage.setItem(PROVISION_FLAG, session.user.id);
    } catch (error) {
      // A suspended/closed account surfaces here on the very first call.
      await handleForgeError(error);
      throw error;
    }
  }

  return { session };
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
