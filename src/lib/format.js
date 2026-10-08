const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-02-01" -> "February 2026". Unparseable input is returned unchanged. */
export function formatMonth(iso) {
  if (!iso || typeof iso !== "string") return "";
  const [year, month] = iso.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  if (!name || !year) return iso;
  return `${name} ${year}`;
}

export function formatFixed(value, fractionDigits) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value.toFixed(fractionDigits)));
}

/** Display string for a raw metric value, or null when the value is not a number. */
export function formatMetricValue(value, format) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  if (format === "percent") return `${(number * 100).toFixed(1)}%`;
  if (format === "currency") {
    const digits = Math.abs(number) >= 100 ? 0 : 2;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(number);
  }
  if (format === "index") return formatFixed(number, 1);
  return formatFixed(number, Math.abs(number) >= 100 ? 1 : 2);
}
