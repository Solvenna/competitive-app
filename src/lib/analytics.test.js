import assert from "node:assert/strict";
import test from "node:test";
import { track } from "./analytics.js";

function withWindow(run) {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    run(globalThis.window);
  } finally {
    globalThis.window = previous;
  }
}

test("prefixes the event name and tags the site section", () => {
  withWindow((win) => {
    track("gate_open", { gate_variant: "header" });
    assert.equal(win.dataLayer.length, 1);
    assert.equal(win.dataLayer[0].event, "radar_gate_open");
    assert.equal(win.dataLayer[0].site_section, "radar");
    assert.equal(win.dataLayer[0].gate_variant, "header");
  });
});

test("clears parameters an earlier event set, so they can't carry over", () => {
  withWindow((win) => {
    track("generate_lead", { form_name: "benchmark-lead", gate_variant: "month", contact_method: "email" });
    track("gate_open", { gate_variant: "header" });
    const later = win.dataLayer[1];
    assert.ok("contact_method" in later && later.contact_method === undefined);
    assert.ok("form_name" in later && later.form_name === undefined);
    assert.equal(later.gate_variant, "header");

    track("report_unlock");
    assert.ok("gate_variant" in win.dataLayer[2] && win.dataLayer[2].gate_variant === undefined);
  });
});
