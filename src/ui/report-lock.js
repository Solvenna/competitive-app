import { track } from "../lib/analytics.js";

const STORAGE_KEY = "solvenna-report-unlocked";

const listeners = new Set();
let unlocked = readStored();

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
  track("report_unlock");
  for (const listener of listeners) listener();
}

export function onReportUnlock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
