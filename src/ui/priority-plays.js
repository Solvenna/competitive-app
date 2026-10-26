import { escapeHtml } from "../lib/html.js";
import { buildAnalysisPacket } from "../lib/metrics.js";
import { isReportUnlocked } from "./report-lock.js";

export const TAGLINE_INTERVAL_MS = 4000;
const MIN_VISIBLE_MS = 1200;

const TAGLINES = [
  "Stacking the scoreboard…",
  "Reading the competitive tea leaves…",
  "Finding where share is hiding…",
  "Matching you against the pack…",
  "Spotting the soft spots…",
  "Turning gaps into game plans…",
  "Checking who’s winning the inbox…",
  "Mapping the open goals…",
  "Sharpening the next moves…",
  "Brewing your action brief…",
];

const ENDPOINTS = ["/api/analyze", "/.netlify/functions/analyze"];

export function isAnalysis(payload) {
  return Boolean(
    payload &&
      typeof payload.bottomLine === "string" &&
      payload.bottomLine.trim() &&
      Array.isArray(payload.actions) &&
      payload.actions.length &&
      payload.actions.every(
        (action) =>
          action && String(action.label || "").trim() && String(action.detail || "").trim(),
      ),
  );
}

function samplePlays() {
  return `
    <p class="opp-note">Sample analysis for Best Buy until live generation is wired.</p>
    <p class="opp-lead"><strong>Bottom line:</strong> Best Buy gets people to the site and keeps them from bouncing (43.3% beats Walmart and HP), but it converts and retains them poorly, and it pays too much for paid traffic that doesn't come back. The gaps are mostly downstream of the landing page.</p>
    <ul class="opp-list">
      <li><strong>Cut paid waste:</strong> Best Buy pays the most per retained PPC visit ($1.15 vs. Amazon's $0.56). Shift budget from prospecting to remarketing and high-intent terms.</li>
      <li><strong>Capture new visitors:</strong> 48% of traffic is new and only 52% returns (Walmart: 74%). Add email/SMS/app sign-up prompts and automate abandonment flows.</li>
      <li><strong>Fix mobile conversion:</strong> Mobile is 63% of visits but conversion is 2.6% (Walmart: 7.0%). Audit checkout friction, wallet payments, and page speed.</li>
      <li><strong>Grow owned traffic:</strong> Owned retention (68) trails Amazon (77). Invest in loyalty, email, and push, and personalize for returning users.</li>
    </ul>`;
}

function renderAnalysis(analysis) {
  const items = analysis.actions
    .map(
      (action) =>
        `<li><strong>${escapeHtml(String(action.label || "").replace(/:$/, ""))}:</strong> ${escapeHtml(action.detail)}</li>`,
    )
    .join("");
  return `
    <p class="opp-lead"><strong>Bottom line:</strong> ${escapeHtml(analysis.bottomLine)}</p>
    <ul class="opp-list">${items}</ul>`;
}

async function requestAnalysis(packet, signal) {
  let status = 0;
  for (const endpoint of ENDPOINTS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(packet),
      signal,
    });
    status = response.status;
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    if (!isAnalysis(payload)) throw new Error("The analysis response was incomplete.");
    return payload;
  }
  throw new Error(status ? String(status) : "The analysis function is not available.");
}

function stopTaglines() {
  if (taglineTimer) {
    clearInterval(taglineTimer);
    taglineTimer = null;
  }
}

let taglineTimer = null;

/** Plays shown in the clear, after the bottom line, before the opt-in. */
const PREVIEW_PLAYS = 2;

/** Keeps the bottom line and first plays readable; the rest wait for the opt-in. */
function lockPlays(body) {
  const items = [...body.querySelectorAll(".opp-list li")].slice(PREVIEW_PLAYS);
  if (!items.length) return;
  for (const item of items) {
    item.classList.add("locked-item");
    item.inert = true;
  }
  const count = items.length === 1 ? "1 more play" : `${items.length} more plays`;
  body.insertAdjacentHTML(
    "beforeend",
    `<p class="opp-more"><button type="button" class="opp-unlock" data-unlock>Unlock ${count} in the full report</button></p>`,
  );
}

export function unlockPriorityPlays() {
  const body = document.querySelector("#opportunities-body");
  if (!body) return;
  for (const item of body.querySelectorAll(".locked-item")) {
    item.classList.remove("locked-item");
    item.inert = false;
  }
  body.querySelector(".opp-more")?.remove();
}

function showPlays(html) {
  stopTaglines();
  const body = document.querySelector("#opportunities-body");
  if (!body) return;
  body.setAttribute("aria-busy", "false");
  body.innerHTML = html;
  if (!isReportUnlocked()) lockPlays(body);
}

function showLoading() {
  stopTaglines();
  const body = document.querySelector("#opportunities-body");
  if (!body) return;
  body.setAttribute("aria-busy", "true");
  let index = 0;
  const paint = () => {
    const label = body.querySelector(".opp-loading-text");
    if (label) label.textContent = TAGLINES[index];
  };
  body.innerHTML = `
    <p class="opp-status">
      <span class="opp-spinner" aria-hidden="true"></span>
      <span class="opp-loading-text"></span>
    </p>
    <div class="opp-shimmer" aria-hidden="true"><span></span><span></span><span></span></div>`;
  paint();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    taglineTimer = setInterval(() => {
      index = (index + 1) % TAGLINES.length;
      paint();
    }, TAGLINE_INTERVAL_MS);
  }
}

/**
 * Loads Priority Plays for the current comparison.
 * A newer call aborts the previous request. Failures fall back to the sample read.
 */
export function createPriorityPlays(state) {
  let generation = 0;
  let abortController = null;

  return function refreshPriorityPlays() {
    const requestId = ++generation;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    if (!state.companyId || !document.querySelector("#opportunities-body")) return;

    showLoading();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    const companyIds = [state.companyId, ...state.activeCompareIds()];
    const month = state.model.defaultMonth;

    const reveal = async (html) => {
      const remaining = MIN_VISIBLE_MS - (performance.now() - started);
      if (!reducedMotion && remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      if (requestId === generation) showPlays(html);
    };

    state.store
      .ensure(companyIds)
      .then(() => {
        if (requestId !== generation) return null;
        if (!companyIds.every((id) => state.model.loadedCompanies.has(id))) {
          throw new Error("Metrics for this comparison are not loaded.");
        }
        const packet = buildAnalysisPacket(
          state.model,
          state.companyId,
          state.activeCompareIds(),
          month,
        );
        return requestAnalysis(packet, controller.signal);
      })
      .then((analysis) => {
        if (requestId === generation && analysis) return reveal(renderAnalysis(analysis));
      })
      .catch((error) => {
        if (requestId === generation && error?.name !== "AbortError") return reveal(samplePlays());
      });
  };
}
