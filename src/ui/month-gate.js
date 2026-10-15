import { classifyContact, contactErrorMessage } from "../lib/contact.js";
import { readComparisonContext } from "./comparison-context.js";

const SUBMIT_LABEL = "Get the full monthly analysis";

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
    button.textContent = SUBMIT_LABEL;
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
  } catch {
    showError("We couldn’t send that just now. Try again in a moment.", form.contact);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = SUBMIT_LABEL;
    }
  }
}

export function openMonthGate() {
  const dialog = document.querySelector("#month-gate");
  if (dialog && !dialog.open) dialog.showModal();
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
}
