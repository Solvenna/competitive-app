import { formatMetricValue, formatMonth } from "./format.js";

export const METRIC_GROUPS = [
  { id: "score", label: "Score", ids: ["quicklift_score"] },
  {
    id: "site",
    label: "Site",
    ids: [
      "conv_pct",
      "multi_visit_pct",
      "mobile_pct",
      "new_visitors_pct",
      "return_visitors_pct",
      "bounce_pct",
    ],
  },
  {
    id: "traffic",
    label: "Traffic",
    ids: [
      "owned_visits_pct",
      "owned_traffic_retention_index",
      "paid_visits_pct",
      "paid_traffic_retention_index",
      "dollars_per_retained_ppc_visit",
    ],
  },
  {
    id: "email",
    label: "Email",
    ids: [
      "list_mm",
      "read_pct",
      "spam_pct",
      "list_campaign_pct",
      "email_user_day",
      "email_power_index",
    ],
  },
  { id: "revenue", label: "Revenue", ids: ["rpe"] },
];

export const SPOTLIGHT_METRIC_IDS = ["conv_pct", "bounce_pct", "owned_visits_pct", "rpe"];

/** Shown on hover for the metric name. The score label in the table is overridden below. */
const DEFINITIONS = {
  quicklift_score:
    "Composite score of overall marketing and brand performance across key digital engagement and conversion signals. Not available in this snapshot when values are missing.",
  conv_pct: "Share of visits that convert (complete a purchase or conversion event).",
  multi_visit_pct:
    "Share of traffic that comes from visitors who return more than once (visits beyond unique audience).",
  mobile_pct:
    "Share of visits from mobile devices. Not inherently better or worse; a higher share means more traffic depends on the mobile experience.",
  new_visitors_pct: "Share of audience that is first-time visitors in the period.",
  return_visitors_pct: "Share of audience that has visited before.",
  bounce_pct: "Share of visits that leave after a single page with little engagement.",
  owned_visits_pct: "Share of visits from owned channels (direct, organic search, and email).",
  owned_traffic_retention_index:
    "Measures how well owned-channel traffic (direct, organic search, email) is retained. Higher is better.",
  paid_visits_pct:
    "Share of visits from paid and referral channels. Lower is not automatically better — it can reflect under-investment in paid when conversion is weak. Higher is not automatically better either; it depends on whether that paid traffic converts and retains.",
  paid_traffic_retention_index:
    "Measures how well paid and referral traffic is retained. Higher is better.",
  dollars_per_retained_ppc_visit:
    "Estimated paid-search spend per retained PPC visit (efficiency of paid search).",
  list_mm:
    "Email list reach in millions. Raw size alone is not necessarily better. As a share of unique visitors (list MM ÷ unique visitors), a higher ratio tends to be better.",
  read_pct: "Share of email sends that are opened or read.",
  spam_pct: "Share of email volume marked as spam or landing in spam.",
  list_campaign_pct:
    "Average list reach covered per campaign (campaign volume relative to list size).",
  email_user_day: "Average emails sent per list member per day.",
  email_power_index:
    "Measures email-driven site visits relative to send volume. Higher is better.",
  rpe: "Revenue per email, shown as currency in this demo.",
};

/** These three are contextual even when the snapshot marks a direction. */
const CONTEXTUAL_METRIC_IDS = new Set(["mobile_pct", "paid_visits_pct", "list_mm"]);

const groupByMetricId = new Map();
for (const group of METRIC_GROUPS) {
  for (const id of group.ids) groupByMetricId.set(id, group);
}

export function displayLabel(metric) {
  return metric?.id === "quicklift_score" ? "Marketing Effectiveness Score" : metric?.label || "";
}

export function definitionFor(metric) {
  return DEFINITIONS[metric?.id] || "";
}

export function withContextualDirections(metrics) {
  return metrics.map((metric) =>
    CONTEXTUAL_METRIC_IDS.has(metric.id) ? { ...metric, higher_is_better: null } : metric,
  );
}

export function metricDirection(metric) {
  if (metric.higher_is_better === true) return "higher";
  if (metric.higher_is_better === false) return "lower";
  return "contextual";
}

export function groupForMetric(metricId) {
  return groupByMetricId.get(metricId) || { id: "other", label: "Other" };
}

/** Table body rows: a group header whenever the metric family changes. */
export function tableRows(metrics) {
  const rows = [];
  let currentGroup = null;
  for (const metric of metrics) {
    const group = groupForMetric(metric.id);
    if (group.id !== currentGroup) {
      rows.push({ type: "group", id: group.id, label: group.label });
      currentGroup = group.id;
    }
    rows.push({ type: "metric", metric });
  }
  return rows;
}

export function readMetric(model, companyId, month, metricId) {
  const row = model.series.get(`${companyId}|${month}`);
  if (!row || !Object.prototype.hasOwnProperty.call(row, metricId)) return null;
  const raw = row[metricId];
  if (raw == null || raw === "") return null;
  const number = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function compareToBaseline(value, baseline, higherIsBetter, format) {
  if (
    value == null ||
    baseline == null ||
    typeof higherIsBetter !== "boolean" ||
    formatMetricValue(value, format) === formatMetricValue(baseline, format)
  ) {
    return null;
  }
  const better = higherIsBetter ? value > baseline : value < baseline;
  return better ? "better" : "worse";
}

export function metricCell(model, metric, companyId, focalId, month) {
  if (metric.available_in_snapshot === false) {
    return { display: "n/a", kind: "na", cmp: null, value: null };
  }
  const value = readMetric(model, companyId, month, metric.id);
  if (value == null) return { display: "—", kind: "missing", cmp: null, value: null };
  const display = formatMetricValue(value, metric.format);
  if (display == null) return { display: "—", kind: "missing", cmp: null, value: null };
  return {
    display,
    kind: "value",
    cmp:
      companyId === focalId
        ? null
        : compareToBaseline(
            value,
            readMetric(model, focalId, month, metric.id),
            metric.higher_is_better,
            metric.format,
          ),
    value,
  };
}

export function coverageNote(model, companyId, month) {
  const covered = model.monthsByCompany.get(companyId);
  if (!covered || covered.size === 0) return "No data in sample";
  if (covered.has(month)) return "";
  return "No row this month";
}

/**
 * Packet posted to /api/analyze. Values are the strings on screen, not raw numbers.
 */
export function buildAnalysisPacket(model, companyId, compareIds, month) {
  const company = model.companiesById.get(companyId);
  if (!company || !month) return null;

  const compareTo = [];
  const seen = new Set([companyId]);
  for (const id of compareIds || []) {
    if (!id || seen.has(id)) continue;
    const peer = model.companiesById.get(id);
    if (!peer) continue;
    seen.add(id);
    compareTo.push({ id: peer.id, name: peer.name, domain: peer.domain || "" });
  }

  const columns = [
    { id: company.id, name: company.name },
    ...compareTo.map((peer) => ({ id: peer.id, name: peer.name })),
  ];

  const metrics = model.metrics
    .filter((metric) => metric.available_in_snapshot !== false)
    .map((metric) => ({
      id: metric.id,
      label: displayLabel(metric),
      definition: definitionFor(metric),
      direction: metricDirection(metric),
      values: columns.map((column) => ({
        id: column.id,
        name: column.name,
        display: metricCell(model, metric, column.id, company.id, month).display,
      })),
    }));

  return {
    month,
    monthLabel: formatMonth(month),
    company: { id: company.id, name: company.name, domain: company.domain || "" },
    compareTo,
    metrics,
  };
}
