const hudTrigger = document.getElementById("hud-trigger");
const hudPanel = document.getElementById("hud-panel");
const hudOverlay = document.getElementById("hud-overlay");
const hudClose = document.getElementById("hud-close");
const hudInput = document.getElementById("hud-input");

if (hudTrigger && hudPanel && hudOverlay && hudClose) {
  function openHud() {
    hudPanel.classList.add("hud-panel--open");
    hudOverlay.classList.add("hud-overlay--visible");
    hudPanel.setAttribute("aria-hidden", "false");
    hudTrigger.setAttribute("aria-expanded", "true");
    hudInput?.focus();
  }

  function closeHud() {
    hudPanel.classList.remove("hud-panel--open");
    hudOverlay.classList.remove("hud-overlay--visible");
    hudPanel.setAttribute("aria-hidden", "true");
    hudTrigger.setAttribute("aria-expanded", "false");
    hudTrigger.focus();
  }

  hudTrigger.addEventListener("click", openHud);
  hudClose.addEventListener("click", closeHud);
  hudOverlay.addEventListener("click", closeHud);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hudPanel.classList.contains("hud-panel--open")) {
      closeHud();
    }
  });

  hudPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = hudPanel.querySelectorAll(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
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
}
