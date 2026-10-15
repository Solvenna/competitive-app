const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resetGate() {
  const dialog = document.querySelector("#month-gate");
  const form = document.querySelector("#month-gate-form");
  const success = document.querySelector("#month-gate-success");
  const error = document.querySelector("#month-gate-error");
  form?.reset();
  if (form) form.hidden = false;
  if (success) success.hidden = true;
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  form?.email?.removeAttribute("aria-invalid");
  form?.phone?.removeAttribute("aria-invalid");
  dialog?.setAttribute("aria-labelledby", "month-gate-title");
}

function showError(message, field) {
  const error = document.querySelector("#month-gate-error");
  const form = document.querySelector("#month-gate-form");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  form?.email?.removeAttribute("aria-invalid");
  form?.phone?.removeAttribute("aria-invalid");
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

function submitGate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  const company = form.company.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const emailValid = EMAIL_PATTERN.test(email);

  if (!email && !phone) {
    showError("Add an email or a phone number so we can follow up.", form.email);
    return;
  }
  if (email && !emailValid) {
    showError(
      "Enter a valid email address, or leave it blank and use a phone number.",
      form.email,
    );
    return;
  }
  if (phone && phone.replace(/\D/g, "").length < 7) {
    showError("Enter a phone number we can reach, or use email instead.", form.phone);
    return;
  }

  const lines = [
    "I'd like the full monthly history for this benchmark and a read on what to do next.",
    "",
  ];
  if (name) lines.push(`Name: ${name}`);
  if (company) lines.push(`Company: ${company}`);
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);

  const mailto = `mailto:info@solvenna.com?subject=Full%20monthly%20benchmark%20analysis&body=${encodeURIComponent(lines.join("\n"))}`;
  const link = document.createElement("a");
  link.href = mailto;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  form.hidden = true;
  const success = document.querySelector("#month-gate-success");
  if (success) success.hidden = false;
  document.querySelector("#month-gate")?.setAttribute("aria-labelledby", "month-gate-success-title");
  document.querySelector("#month-gate-success-close")?.focus();
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
