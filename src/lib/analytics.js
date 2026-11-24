/**
 * Pushes an event to the GTM dataLayer. GTM (GTM-M4WH8GX, shared with
 * solvenna.com) turns these into GA4 events. Every event name gets a
 * "radar_" prefix so Radar events stay apart from solvenna.com's in the
 * shared container. Never pass the visitor's email or phone number here:
 * GA4 forbids PII in event parameters.
 */
export function track(event, params = {}) {
  const target = globalThis.window;
  if (!target) return;
  target.dataLayer = target.dataLayer || [];
  target.dataLayer.push({ event: `radar_${event}`, site_section: "radar", ...params });
}
