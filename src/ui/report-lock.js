const STORAGE_KEY = "solvenna-report-unlocked";

/** Only the /demo page gates the report; the main page always shows all of it. */
const GATED = globalThis.document?.documentElement.dataset.page === "demo";

const listeners = new Set();
let unlocked = !GATED || readStored();

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function isReportUnlocked() {
  return unlocked;
}

/** Marks the full report as revealed for this visitor and notifies listeners once. */
export function unlockReport() {
  if (unlocked) return;
  unlocked = true;
  try {
    localStorage.setItem(STORAGE_KEY, "on");
  } catch {
    // Private windows can block storage; the report still unlocks for this visit.
  }
  for (const listener of listeners) listener();
}

export function onReportUnlock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
