import assert from "node:assert/strict";
import test from "node:test";
import { formatMetricValue, formatMonth } from "./format.js";
import {
  buildAnalysisPacket,
  compareToBaseline,
  displayLabel,
  metricCell,
  metricDirection,
  withContextualDirections,
} from "./metrics.js";
import { searchCompanies } from "./search.js";
import { TAGLINE_INTERVAL_MS } from "../ui/priority-plays.js";

test("month labels and metric display match the shipped formatter", () => {
  assert.equal(formatMonth("2026-02-01"), "February 2026");
  assert.equal(formatMetricValue(0.026, "percent"), "2.6%");
  assert.equal(formatMetricValue(0.43319, "percent"), "43.3%");
  assert.equal(formatMetricValue(57, "index"), "57");
  assert.equal(formatMetricValue(68, "index"), "68");
  assert.equal(formatMetricValue(1.15384, "currency"), "$1.15");
  assert.equal(formatMetricValue(555551.096306, "currency"), "$555,551");
  assert.equal(formatMetricValue(39.2, "number"), "39.2");
  assert.equal(formatMetricValue(12.903258, "number"), "12.9");
});

test("contextual metrics lose a better/worse direction", () => {
  const metrics = withContextualDirections([
    { id: "mobile_pct", higher_is_better: true },
    { id: "paid_visits_pct", higher_is_better: false },
    { id: "list_mm", higher_is_better: true },
    { id: "conv_pct", higher_is_better: true },
    { id: "bounce_pct", higher_is_better: false },
  ]);
  assert.equal(metricDirection(metrics[0]), "contextual");
  assert.equal(metricDirection(metrics[1]), "contextual");
  assert.equal(metricDirection(metrics[2]), "contextual");
  assert.equal(metricDirection(metrics[3]), "higher");
  assert.equal(metricDirection(metrics[4]), "lower");
  assert.equal(displayLabel({ id: "quicklift_score", label: "Marketing Effectiveness Score" }), "Marketing Effectiveness Score");
});

test("equal displayed values are not marked better or worse", () => {
  assert.equal(compareToBaseline(0.026, 0.0264, true, "percent"), null);
  assert.equal(compareToBaseline(0.07, 0.026, true, "percent"), "better");
  assert.equal(compareToBaseline(0.5, 0.43319, false, "percent"), "worse");
});

test("search ranks name prefix ahead of domain and caps the list", () => {
  const companies = [
    { id: "zeta", name: "Zeta", domain: "zeta.com", seed: false },
    { id: "target", name: "Target", domain: "target.com", seed: true },
    { id: "acme", name: "Acme Target Shop", domain: "acme.com", seed: false },
    { id: "bestbuy", name: "Best Buy", domain: "bestbuy.com", seed: true },
  ];
  const empty = searchCompanies(companies, "", { seedsWhenEmpty: true, limit: 12 });
  assert.deepEqual(
    empty.matches.map((company) => company.id),
    ["target", "bestbuy"],
  );

  const found = searchCompanies(companies, "tar");
  assert.deepEqual(
    found.matches.map((company) => company.id),
    ["target", "acme"],
  );

  const excluded = searchCompanies(companies, "tar", { exclude: new Set(["target"]) });
  assert.deepEqual(
    excluded.matches.map((company) => company.id),
    ["acme"],
  );
});

test("analysis packet uses on-screen labels and the score name", () => {
  const model = {
    companiesById: new Map([
      ["bestbuy", { id: "bestbuy", name: "Best Buy", domain: "bestbuy.com" }],
      ["walmart", { id: "walmart", name: "Walmart", domain: "walmart.com" }],
    ]),
    metrics: withContextualDirections([
      {
        id: "quicklift_score",
        label: "Marketing Effectiveness Score",
        format: "index",
        higher_is_better: true,
        available_in_snapshot: true,
      },
      {
        id: "conv_pct",
        label: "Conv %",
        format: "percent",
        higher_is_better: true,
        available_in_snapshot: true,
      },
    ]),
    series: new Map([
      ["bestbuy|2026-02-01", { quicklift_score: 57, conv_pct: 0.026 }],
      ["walmart|2026-02-01", { quicklift_score: 70, conv_pct: 0.07 }],
    ]),
  };

  const cell = metricCell(model, model.metrics[1], "walmart", "bestbuy", "2026-02-01");
  assert.equal(cell.display, "7.0%");
  assert.equal(cell.cmp, "better");

  const packet = buildAnalysisPacket(model, "bestbuy", ["walmart"], "2026-02-01");
  assert.equal(packet.monthLabel, "February 2026");
  assert.equal(packet.metrics[0].label, "Marketing Effectiveness Score");
  assert.equal(packet.metrics[1].values[1].display, "7.0%");
  assert.equal(packet.metrics[1].direction, "higher");
});

test("priority play taglines rotate every four seconds", () => {
  assert.equal(TAGLINE_INTERVAL_MS, 4000);
});
