const STORAGE_KEY = "quicklift-high-contrast";

function storedPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "on" || value === "off") return value;
  } catch {
    /* private mode and blocked storage both fall through to the media query */
  }
  return null;
}

export function applyContrast(enabled) {
  document.documentElement.setAttribute("data-contrast", enabled ? "high" : "standard");
  const button = document.querySelector("#contrast-toggle");
  if (button) {
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    const state = button.querySelector(".contrast-state");
    if (state) state.textContent = enabled ? "On" : "Off";
  }
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", enabled ? "#010c16" : "#22395e");
}

export function initContrast() {
  const stored = storedPreference();
  const media = window.matchMedia("(prefers-contrast: more)");
  applyContrast(stored === null ? media.matches : stored === "on");

  document.querySelector("#contrast-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-contrast") !== "high";
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* the toggle still updates the page when storage is unavailable */
    }
    applyContrast(next);
  });

  media.addEventListener?.("change", () => {
    if (storedPreference() === null) applyContrast(media.matches);
  });
}
