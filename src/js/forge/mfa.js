// Thin wrapper around Supabase's built-in TOTP MFA API. Supabase stores and
// verifies factors itself (in its own `auth` schema) — there is no factor
// state, secret, or recovery material anywhere in this repo or ForgeCustomer.
// See docs/plans/two-factor-authentication-plan.md for the design this
// implements.

import { getSupabase } from "./supabase.js";

/** Verified TOTP factors on the current account (usually 0 or 1, but a user
 *  may enroll a backup authenticator). */
export async function listFactors() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    throw error;
  }
  return (data?.totp ?? []).filter((factor) => factor.status === "verified");
}

/** Begin enrolling a new TOTP factor. Returns the QR code (an inline SVG
 *  `data:` URI — no QR-rendering library needed) and the manual-entry
 *  secret. The factor is not active until `verifyCode` succeeds against it. */
export async function enroll() {
  const supabase = await getSupabase();
  const { data: listed, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    throw listError;
  }
  // Reloading or leaving setup can strand an unverified factor whose secret
  // cannot be recovered. Restart only these TOTP enrollments, never a verified
  // authenticator or another factor type. Stop if cleanup fails.
  const factors = listed?.all ?? [];
  for (const factor of factors) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
  }
  // Supabase requires distinct factor names, including for backup authenticators.
  const usedNames = new Set(factors.map((factor) => factor.friendly_name));
  let number = 1;
  while (usedNames.has(`Authenticator ${number}`)) number += 1;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${number}`,
  });
  if (error) {
    throw error;
  }
  // auth-js 2.64.4 prefixes raw SVG with this data-URI header. Encode the
  // payload so SVG quotes and # colors remain image data, not HTML/URL syntax.
  const qrPrefix = "data:image/svg+xml;utf-8,";
  const svg = data.totp.qr_code.slice(qrPrefix.length);
  return {
    factorId: data.id,
    qrCode: `${qrPrefix}${encodeURIComponent(svg)}`,
    secret: data.totp.secret,
  };
}

/** Customer-safe messages for Supabase MFA failures; do not display raw errors. */
export function describeMfaError(error) {
  if (error?.code === "mfa_factor_name_conflict") {
    return "An authenticator with that name already exists. Try again to restart setup.";
  }
  if (error?.code === "over_request_rate_limit") {
    return "Too many setup attempts. Wait a moment, then try again.";
  }
  return "Couldn't load two-factor setup. Please try again.";
}

/** Verify a 6-digit code against a factor — used both to confirm a fresh
 *  enrollment and to complete a sign-in challenge. */
export async function verifyCode(factorId, code) {
  const supabase = await getSupabase();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) {
    throw challengeError;
  }
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) {
    throw verifyError;
  }
}

/** Remove a factor (e.g. the user disabling 2FA, or cleaning up an
 *  abandoned enrollment they didn't finish). */
export async function unenroll(factorId) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    throw error;
  }
}

/** Verify a code against whichever enrolled factor accepts it. Used at
 *  sign-in, where the challenger doesn't know which of possibly several
 *  enrolled authenticators (a user may keep a backup) produced the code. */
export async function verifyAnyFactor(code) {
  const factors = await listFactors();
  if (factors.length === 0) {
    throw new Error("No authentication method found for this account.");
  }
  let lastError;
  for (const factor of factors) {
    try {
      await verifyCode(factor.id, code);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** True when the session is authenticated but the account has a verified
 *  factor requiring step-up to AAL2 that hasn't happened yet this session. */
export async function hasPendingChallenge() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw error;
  }
  if (!data) throw new Error("Could not determine sign-in verification status.");
  return data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel;
}
