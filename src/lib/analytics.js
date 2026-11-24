/**
 * Pushes an event to the GTM dataLayer. GTM (GTM-M4WH8GX, shared with
 * solvenna.com) turns these into GA4 events. Every event name gets a
 * "radar_" prefix so Radar events stay apart from solvenna.com's in the
 * shared container. Never pass the visitor's email or phone number here:
 * GA4 forbids PII in event parameters.
 */

// Every parameter the GTM tag reads through a Data Layer Variable. GTM keeps
// the last pushed value of each key for the life of the page, so each push
// sets all of them: keys an event doesn't use go out as undefined, which
// clears what an earlier event left behind instead of letting it leak into
// this one. Add a key here when the GA4 tag gains a parameter.
const PARAM_KEYS = ["gate_variant", "contact_method", "form_name"];

export function track(event, params = {}) {
  const target = globalThis.window;
  if (!target) return;
  target.dataLayer = target.dataLayer || [];
  const cleared = Object.fromEntries(PARAM_KEYS.map((key) => [key, undefined]));
  target.dataLayer.push({ event: `radar_${event}`, ...cleared, site_section: "radar", ...params });
}
