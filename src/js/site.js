// The support HUD self-mounts on every page that links hud.css.
import "./hud.js";

const menuToggle = document.getElementById("menu-toggle");
const mainNav = document.getElementById("main-nav");

if (menuToggle instanceof HTMLButtonElement && mainNav instanceof HTMLElement) {
  const setOpenState = (open) => {
    mainNav.classList.toggle("site-header__nav--open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  };

  menuToggle.addEventListener("click", () => {
    setOpenState(!mainNav.classList.contains("site-header__nav--open"));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      setOpenState(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpenState(false);
      menuToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      setOpenState(false);
    }
  });
}
