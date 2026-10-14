export const LEAD_FORM_NAME = "benchmark-lead";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;

const EMPTY_MESSAGE = "Enter an email address or a phone number so we can follow up.";
const INVALID_MESSAGE =
  "That doesn’t look like an email or a phone number. Try name@company.com, (555) 123-4567, or +44 20 7946 0958.";

export function contactErrorMessage(value) {
  return String(value || "").trim() ? INVALID_MESSAGE : EMPTY_MESSAGE;
}

/** "email", "phone", or null when the value is missing or not plausible. */
export function classifyContact(value) {
  const contact = String(value || "").trim();
  if (!contact) return null;
  if (contact.includes("@")) return isPlausibleEmail(contact) ? "email" : null;
  return isPlausiblePhone(contact) ? "phone" : null;
}

function isPlausibleEmail(contact) {
  if (contact.length > 254 || contact.includes("..")) return false;
  if (!EMAIL_PATTERN.test(contact)) return false;
  const domain = contact.slice(contact.lastIndexOf("@") + 1);
  const labels = domain.split(".");
  return labels.every((label) => label.length > 0 && !label.startsWith("-") && !label.endsWith("-"));
}

function isPlausiblePhone(contact) {
  if (!PHONE_PATTERN.test(contact)) return false;
  const opens = (contact.match(/\(/g) || []).length;
  const closes = (contact.match(/\)/g) || []).length;
  if (opens !== closes) return false;
  const digits = contact.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
