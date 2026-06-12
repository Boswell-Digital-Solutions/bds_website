const form = document.querySelector("[data-intake-form]");

if (form instanceof HTMLFormElement) {
  const statusElement = form.querySelector("[data-form-status]");
  const submitButton = form.querySelector("[data-submit-button]");
  const intakeUrl = form.dataset.intakeUrl?.trim() || "/api/intake/consultation";
  const fallbackEmail = form.dataset.fallbackEmail?.trim() ?? "";
  const timeoutMs = 8000;

  const setStatus = (state, message) => {
    if (!(statusElement instanceof HTMLElement)) {
      return;
    }

    statusElement.dataset.state = state;
    statusElement.textContent = message;
  };

  const setSubmitting = (submitting) => {
    if (!(submitButton instanceof HTMLButtonElement)) {
      return;
    }

    submitButton.disabled = submitting;
    submitButton.textContent = submitting ? "Sending..." : "Send Request";
  };

  const parseError = async (response) => {
    try {
      const payload = await response.json();
      if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Fall through to generic message.
    }

    return `Request failed: ${response.status} ${response.statusText}`;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    if (!intakeUrl) {
      setStatus(
        "error",
        `Online intake is not configured. Email ${fallbackEmail || "the business address on this page"} instead.`
      );
      return;
    }

    const formData = new FormData(form);
    const honeypot = formData.get("website");

    if (typeof honeypot === "string" && honeypot.trim() !== "") {
      form.reset();
      setStatus("success", "Request received.");
      return;
    }

    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      reason: String(formData.get("reason") || "").trim(),
      message: String(formData.get("message") || "").trim(),
      source_page: String(formData.get("source_page") || "contact.html").trim()
    };

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    setSubmitting(true);
    setStatus("pending", "Sending request to the BDS intake service...");

    try {
      const response = await fetch(intakeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey()
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      form.reset();
      setStatus("success", "Request received. BDS will review the submission and follow up by email.");
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "The intake service timed out after 8 seconds."
          : error instanceof Error
            ? error.message
            : "The request could not be sent.";

      setStatus(
        "error",
        `${message} If needed, email ${fallbackEmail || "the business address on this page"}.`
      );
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  });
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return `contact-${globalThis.crypto.randomUUID()}`;
  }
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
