import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyContact, contactErrorMessage, LEAD_FORM_NAME } from "./contact.js";

test("accepts a plausible email or phone and rejects everything else", () => {
  assert.equal(classifyContact("  ada@solvenna.com "), "email");
  assert.equal(classifyContact("a@b.co"), "email");
  assert.equal(classifyContact("(555) 123-4567"), "phone");
  assert.equal(classifyContact("555-123-4567"), "phone");
  assert.equal(classifyContact("+1 555 123 4567"), "phone");
  assert.equal(classifyContact("+44 20 7946 0958"), "phone");
  assert.equal(classifyContact("555.123.4567"), "phone");
  assert.equal(classifyContact("123-4567"), "phone");

  assert.equal(classifyContact(""), null);
  assert.equal(classifyContact("   "), null);
  assert.equal(classifyContact("not an email"), null);
  assert.equal(classifyContact("ada@"), null);
  assert.equal(classifyContact("ada@solvenna"), null);
  assert.equal(classifyContact("a@b.c"), null);
  assert.equal(classifyContact("555"), null);
  assert.equal(classifyContact("+123"), null);
  assert.equal(classifyContact("++1 555 123 4567"), null);
  assert.equal(classifyContact("555) 123-4567"), null);
  assert.equal(classifyContact("call me at 5551234567"), null);
  assert.equal(contactErrorMessage(""), "Enter an email address or a phone number so we can follow up.");
  assert.match(contactErrorMessage("nope"), /email or a phone number/);
});

test("index.html has a static Netlify form with the same field names", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const staticForm = html.match(
    /<form\b[^>]*name="benchmark-lead"[^>]*data-netlify="true"[\s\S]*?<\/form>/,
  );
  assert.ok(staticForm, "hidden detection form is missing");
  const block = staticForm[0];
  assert.match(block, /data-netlify-honeypot="bot-field"/);
  for (const name of [
    "form-name",
    "contact",
    "contact-kind",
    "selected-company",
    "compare-to",
    "page-url",
    "bot-field",
  ]) {
    assert.match(block, new RegExp(`name="${name}"`));
  }
  assert.match(block, new RegExp(`value="${LEAD_FORM_NAME}"`));
  assert.match(html, /id="gate-contact"/);
  assert.match(html, /name="contact"/);
});
