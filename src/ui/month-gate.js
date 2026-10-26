import { classifyContact, contactErrorMessage } from "../lib/contact.js";
import { readComparisonContext } from "./comparison-context.js";
import { isReportUnlocked, onReportUnlock, unlockReport } from "./report-lock.js";

const VARIANTS = {
  month: {
    title: "See the full year against your peers",
    copy: "This demo stays on February 2026. Solvenna keeps the rest of the monthly history for this benchmark and turns it into a clear plan: where you trail peers, which channels are not earning their spend, and where to invest next so you can win share.",
    submit: "Get the full monthly analysis",
    successTitle: "Thanks, we have your note",
    successCopy: "Solvenna will follow up with the full monthly history and a short read on what to fix first.",
  },
  report: {
    title: "Unlock the full benchmark report",
    copy: "See every metric against your competitors, the at-a-glance charts, and all of your Priority Plays. Leave an email or phone number and the full report opens right away.",
    submit: "Unlock the full report",
    successTitle: "Your full report is unlocked",
    successCopy: "Close this to read the rest of the benchmark. Solvenna will also follow up with the monthly history and a short read on what to fix first.",
  },
  header: {
    title: "Get your full competitive benchmark",
    copy: "Unlock every metric against your competitors, the at-a-glance charts, and all of your Priority Plays. Leave an email or phone number and the full report opens right away.",
    submit: "Get the full report",
    successTitle: "Your full report is unlocked",
    successCopy: "Close this to read the rest of the benchmark. Solvenna will also follow up with the monthly history and a short read on what to fix first.",
  },
};

let variant = VARIANTS.month;

function applyVariant(name) {
  variant = VARIANTS[name] || VARIANTS.month;
  const set = (selector, text) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };
  set("#month-gate-title", variant.title);
  set("#month-gate-copy", variant.copy);
  set("#month-gate-form button[type=\"submit\"]", variant.submit);
  set("#month-gate-success-title", variant.successTitle);
  set("#month-gate-success-copy", variant.successCopy);
  const source = document.querySelector("#month-gate-form")?.elements.source;
  if (source) source.value = name in VARIANTS ? name : "month";
}

function formElements() {
  return {
    dialog: document.querySelector("#month-gate"),
    form: document.querySelector("#month-gate-form"),
    success: document.querySelector("#month-gate-success"),
    error: document.querySelector("#month-gate-error"),
  };
}

function resetGate() {
  const { dialog, form, success, error } = formElements();
  form?.reset();
  if (form) form.hidden = false;
  if (success) success.hidden = true;
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  const contact = form?.contact;
  contact?.removeAttribute("aria-invalid");
  const button = form?.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = false;
    button.textContent = variant.submit;
  }
  dialog?.setAttribute("aria-labelledby", "month-gate-title");
}

function showError(message, field) {
  const { dialog, form, error } = formElements();
  if (!dialog?.open) return;
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  form?.contact?.removeAttribute("aria-invalid");
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

function clearError() {
  const { form, error } = formElements();
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  form?.contact?.removeAttribute("aria-invalid");
}

function showSuccess() {
  const { dialog, form, success } = formElements();
  if (!dialog?.open) return;
  if (form) form.hidden = true;
  if (success) success.hidden = false;
  dialog.setAttribute("aria-labelledby", "month-gate-success-title");
  document.querySelector("#month-gate-success-close")?.focus();
}

async function submitGate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const contact = form.contact.value.trim();
  const kind = classifyContact(contact);
  if (!kind) {
    showError(contactErrorMessage(contact), form.contact);
    return;
  }

  clearError();
  form.contact.value = contact;
  form.elements["contact-kind"].value = kind;
  const context = readComparisonContext();
  form.elements["selected-company"].value = context.company;
  form.elements["compare-to"].value = context.competitors;
  form.elements["page-url"].value = window.location.href;

  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.textContent = "Sending…";
  }

  try {
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)).toString(),
    });
    if (!response.ok) throw new Error(String(response.status));
    showSuccess();
    unlockReport();
  } catch {
    showError("We couldn’t send that just now. Try again in a moment.", form.contact);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = variant.submit;
    }
  }
}

function openGate(name) {
  const dialog = document.querySelector("#month-gate");
  if (!dialog || dialog.open) return;
  applyVariant(name);
  dialog.showModal();
}

export function openMonthGate() {
  openGate("month");
}

export function openReportGate() {
  openGate("report");
}

export function initMonthGate() {
  const dialog = document.querySelector("#month-gate");
  const form = document.querySelector("#month-gate-form");
  if (!dialog || !form || dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";
  form.addEventListener("submit", submitGate);
  dialog.addEventListener("close", resetGate);
  document.querySelector("#month-gate-close")?.addEventListener("click", () => dialog.close());
  document.querySelector("#month-gate-success-close")?.addEventListener("click", () => dialog.close());

  const headerCta = document.querySelector("#header-cta");
  if (headerCta) {
    headerCta.hidden = isReportUnlocked();
    headerCta.addEventListener("click", () => openGate("header"));
    onReportUnlock(() => {
      headerCta.hidden = true;
    });
  }
}
