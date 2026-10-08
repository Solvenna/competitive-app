/** Floating definition for metric-name buttons. The node lives in index.html. */
export function initMetricTooltip() {
  const tooltip = document.querySelector("#metric-tooltip");
  if (!tooltip || tooltip.dataset.bound === "1") return;
  tooltip.dataset.bound = "1";

  let anchor = null;

  function place(target) {
    const rect = target.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 8}px`;
    const tip = tooltip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (tip.right > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - tip.width - 8);
    }
    if (tip.bottom > window.innerHeight - 8) {
      top = Math.max(8, rect.top - tip.height - 8);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function show(target) {
    const text = target?.getAttribute("data-definition");
    if (!text) return;
    if (anchor && anchor !== target) anchor.removeAttribute("aria-describedby");
    anchor = target;
    target.setAttribute("aria-describedby", "metric-tooltip");
    tooltip.textContent = text;
    place(target);
  }

  function hide() {
    anchor?.removeAttribute("aria-describedby");
    anchor = null;
    tooltip.hidden = true;
    tooltip.textContent = "";
  }

  document.addEventListener("mouseover", (event) => {
    const target = event.target.closest("[data-definition]");
    if (target) show(target);
  });
  document.addEventListener("mouseout", (event) => {
    const target = event.target.closest("[data-definition]");
    if (target && !target.contains(event.relatedTarget) && event.relatedTarget !== tooltip) {
      hide();
    }
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-definition]");
    if (target) show(target);
  });
  document.addEventListener("focusout", (event) => {
    if (event.target.closest("[data-definition]")) hide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("scroll", hide, true);
}
