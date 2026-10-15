// Login page controller. Authentication runs against Supabase on the client;
// on success we provision the ForgeCustomer profile (idempotent) before sending
// the user to their destination.

import { getSupabase, getSession } from "./supabase.js";
import { forge } from "./api.js";
import { describeForgeError, LOGIN_PAGE } from "./errors.js";
import { hasPendingChallenge, verifyAnyFactor } from "./mfa.js";
import { signUpWithEmailDelivery } from "./signup.js";

const form = document.querySelector("[data-login-form]");

function safeNext() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/account.html";
  // Only allow same-origin, root-relative destinations.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/account.html";
}

if (form instanceof HTMLFormElement) {
  const statusEl = form.querySelector("[data-form-status]");
  const submitBtn = form.querySelector("[data-submit-button]");
  const magicBtn = form.querySelector("[data-magic-button]");
  const modeInputs = form.querySelectorAll("[name='auth-mode']");
  const credentialFields = form.querySelectorAll("[data-credential-field]");
  const credentialInputs = form.querySelectorAll("[data-credential-field] input");
  const mfaStep = form.querySelector("[data-mfa-step]");
  const mfaInput = form.querySelector("#login-mfa-code");

  const setStatus = (state, message) => {
    if (statusEl instanceof HTMLElement) {
      statusEl.dataset.state = state;
      statusEl.textContent = message;
    }
  };

  const currentMode = () => {
    const checked = form.querySelector("[name='auth-mode']:checked");
    return checked instanceof HTMLInputElement ? checked.value : "signin";
  };

  // The sign-in form and the "enter your authenticator code" step share one
  // <form> and toggle visibility rather than navigating to a second page.
  // Disabling the credential inputs (not just hiding them) is what actually
  // keeps them out of constraint validation and out of the FormData read.
  const setMfaStepVisible = (visible) => {
    credentialFields.forEach((field) => {
      field.hidden = visible;
    });
    credentialInputs.forEach((input) => {
      input.disabled = visible;
    });
    if (mfaStep instanceof HTMLElement) {
      mfaStep.hidden = !visible;
    }
    if (mfaInput instanceof HTMLInputElement) {
      mfaInput.disabled = !visible;
      if (visible) {
        mfaInput.value = "";
        mfaInput.focus();
      }
    }
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.textContent = visible
        ? "Verify"
        : currentMode() === "signup"
          ? "Create account"
          : "Sign in";
    }
    form.dataset.step = visible ? "mfa" : "credentials";
  };

  // Covers both a plain revisit with an existing session and landing back
  // here (via session.js's redirect) after a magic-link or stale session
  // turned out to need a step-up the caller couldn't complete itself.
  const checkSignedIn = async () => {
    const session = await getSession();
    if (!session) {
      return;
    }
    if (await hasPendingChallenge()) {
      setMfaStepVisible(true);
      return;
    }
    window.location.replace(safeNext());
  };
  checkSignedIn();

  const finishSignIn = async () => {
    try {
      await forge.provision({});
    } catch (error) {
      const descriptor = describeForgeError(error);
      // Honour genuine account-state redirects (suspended / closed). For any
      // other provisioning failure — ForgeCustomer unavailable, not yet wired,
      // timeout, or token-not-trusted — don't trap the user on login: their
      // Supabase session is valid, so send them into the site and let
      // provisioning retry later. Keeps login usable while the customer service
      // is still being stood up.
      if (descriptor.redirect && descriptor.redirect !== LOGIN_PAGE) {
        window.location.replace(descriptor.redirect);
        return;
      }
      console.warn("[login] provisioning deferred:", descriptor.message);
      window.location.replace("/");
      return;
    }
    window.location.replace(safeNext());
  };

  // Same generic failure message whether the code was wrong, expired, or the
  // lookup itself failed — don't give an attacker a way to distinguish them.
  const submitMfaCode = async () => {
    const code = String(mfaInput?.value || "").trim();
    if (!code) {
      setStatus("error", "Enter the 6-digit code from your authenticator app.");
      return;
    }
    setStatus("pending", "Verifying…");
    try {
      await verifyAnyFactor(code);
    } catch {
      setStatus("error", "That code didn't work. Try again.");
      if (mfaInput instanceof HTMLInputElement) {
        mfaInput.value = "";
        mfaInput.focus();
      }
      return;
    }
    await finishSignIn();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
    }

    try {
      if (form.dataset.step === "mfa") {
        await submitMfaCode();
        return;
      }

      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      const mode = currentMode();

      setStatus("pending", mode === "signup" ? "Creating your account…" : "Signing you in…");

      const supabase = await getSupabase();
      const { error } =
        mode === "signup"
          ? await signUpWithEmailDelivery(supabase, {
              email,
              password,
              redirectTo: `${window.location.origin}${safeNext()}`,
            })
          : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("error", error.message);
        return;
      }

      const session = await getSession();
      if (!session) {
        // New accounts receive confirmation; existing accounts receive sign-in.
        // Keep the same status for both so the UI does not enumerate accounts.
        setStatus(
          "success",
          "Check your email for a confirmation or sign-in link."
        );
        return;
      }

      if (await hasPendingChallenge()) {
        setStatus("", "");
        setMfaStepVisible(true);
        return;
      }

      await finishSignIn();
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
      }
    }
  });

  if (magicBtn instanceof HTMLButtonElement) {
    magicBtn.addEventListener("click", async () => {
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      if (!email) {
        setStatus("error", "Enter your email to receive a magic link.");
        return;
      }
      magicBtn.disabled = true;
      setStatus("pending", "Sending a magic link…");
      try {
        const supabase = await getSupabase();
        const redirectTo = `${window.location.origin}${safeNext()}`;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        setStatus(
          error ? "error" : "success",
          error ? error.message : "Magic link sent. Check your email."
        );
      } catch (error) {
        setStatus("error", error instanceof Error ? error.message : "Could not send link.");
      } finally {
        magicBtn.disabled = false;
      }
    });
  }

  modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.textContent = currentMode() === "signup" ? "Create account" : "Sign in";
      }
      setStatus("", "");
    });
  });
}
