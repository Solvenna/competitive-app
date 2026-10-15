/**
 * Indexes the ~8 MB demo snapshot off the main thread.
 * The page asks for `series` rows only for the companies on screen.
 */

let catalog = null;

self.onmessage = async (event) => {
  const message = event.data;
  if (!message) return;

  if (message.type === "load") {
    try {
      const response = await fetch(message.url);
      if (!response.ok) throw new Error(`The sample file returned ${response.status}.`);
      const document = await response.json();
      if (
        !document ||
        !Array.isArray(document.metrics) ||
        !Array.isArray(document.companies) ||
        !Array.isArray(document.series)
      ) {
        throw new Error("demo.json is missing metrics, companies, or series.");
      }

      catalog = document;
      const months = [];
      const seenMonths = new Set();
      const coverage = {};
      for (const row of document.series) {
        if (row.month && !seenMonths.has(row.month)) {
          seenMonths.add(row.month);
          months.push(row.month);
        }
        if (row.company_id && row.month) {
          if (!coverage[row.company_id]) coverage[row.company_id] = [];
          if (!coverage[row.company_id].includes(row.month)) {
            coverage[row.company_id].push(row.month);
          }
        }
      }
      months.sort();

      self.postMessage({
        type: "index",
        companies: document.companies.map((company) => ({
          id: company.id,
          name: company.name,
          domain: company.domain || "",
          seed: !!company.seed,
        })),
        metrics: document.metrics,
        competitors: document.competitors || {},
        months,
        coverage,
        generatedAt: document.generated_at || null,
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "The sample file could not be read.",
      });
    }
    return;
  }

  if (message.type === "series") {
    const wanted = new Set(message.ids || []);
    const rows = [];
    for (const row of catalog?.series || []) {
      if (!wanted.has(row.company_id)) continue;
      rows.push({
        company_id: row.company_id,
        month: row.month,
        metrics: row.metrics || {},
      });
    }
    self.postMessage({ type: "series", requestId: message.requestId, rows });
  }
};
