// Login page controller. Authentication runs against Supabase on the client;
// on success we provision the ForgeCustomer profile (idempotent) before sending
// the user to their destination.

import { getSupabase, getSession } from "./supabase.js";
import { forge } from "./api.js";
import { describeForgeError } from "./errors.js";

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

  const redirectIfSignedIn = async () => {
    const session = await getSession();
    if (session) {
      window.location.replace(safeNext());
    }
  };
  redirectIfSignedIn();

  const finishSignIn = async () => {
    try {
      await forge.provision({});
    } catch (error) {
      // Suspended/closed accounts get a descriptor with a redirect.
      const descriptor = describeForgeError(error);
      if (descriptor.redirect) {
        window.location.replace(descriptor.redirect);
        return;
      }
      setStatus("error", descriptor.message);
      return;
    }
    window.location.replace(safeNext());
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const mode = currentMode();

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
    }
    setStatus("pending", mode === "signup" ? "Creating your account…" : "Signing you in…");

    try {
      const supabase = await getSupabase();
      const { error } =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("error", error.message);
        return;
      }

      const session = await getSession();
      if (!session) {
        // Sign-up with email confirmation required.
        setStatus(
          "success",
          "Check your email to confirm your account, then sign in."
        );
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
