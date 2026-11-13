import { withContextualDirections } from "./metrics.js";

const WORKER_TIMEOUT_MS = 20_000;

export function defaultMonth(months) {
  return months.find((month) => month.startsWith("2026-02")) || months[months.length - 1] || null;
}

export function demoJsonUrl() {
  return new URL("./data/demo.json", window.location.href).href;
}

export function suggestedCompetitorIds(model, companyId) {
  const listed = model.competitors[companyId];
  if (!Array.isArray(listed)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of listed) {
    if (!id || id === companyId || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function mergeSeries(model, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.company_id) continue;
    model.series.set(`${row.company_id}|${row.month}`, row.metrics || {});
    if (!row.month) continue;
    if (!model.monthsByCompany.has(row.company_id)) {
      model.monthsByCompany.set(row.company_id, new Set());
    }
    model.monthsByCompany.get(row.company_id).add(row.month);
  }
}

/** Full snapshot already in memory (worker fallback). */
export function buildModelFromDocument(document) {
  if (
    !document ||
    !Array.isArray(document.metrics) ||
    !Array.isArray(document.companies) ||
    !Array.isArray(document.series)
  ) {
    throw new Error("demo.json is missing metrics, companies, or series.");
  }

  const companiesById = new Map(document.companies.map((company) => [company.id, company]));
  const months = [...new Set(document.series.map((row) => row.month))].filter(Boolean).sort();
  const series = new Map(
    document.series.map((row) => [`${row.company_id}|${row.month}`, row.metrics || {}]),
  );
  const monthsByCompany = new Map();
  for (const row of document.series) {
    if (!monthsByCompany.has(row.company_id)) monthsByCompany.set(row.company_id, new Set());
    monthsByCompany.get(row.company_id).add(row.month);
  }

  return {
    companies: document.companies,
    companiesById,
    seeds: document.companies.filter((company) => company.seed),
    months,
    series,
    monthsByCompany,
    loadedCompanies: new Set(document.companies.map((company) => company.id)),
    defaultMonth: defaultMonth(months),
    metrics: withContextualDirections(document.metrics),
    competitors: document.competitors || {},
    generatedAt: document.generated_at || null,
  };
}

/** Index message from the worker. Series rows arrive later. */
export function buildModelFromIndex(index) {
  if (!index || !Array.isArray(index.companies) || !Array.isArray(index.metrics)) {
    throw new Error("demo.json is missing metrics, companies, or series.");
  }

  const companies = index.companies.map((company) => ({
    id: company.id,
    name: company.name,
    domain: company.domain || "",
    seed: !!company.seed,
  }));
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const months = [...(index.months || [])].filter(Boolean).sort();
  const monthsByCompany = new Map();
  for (const [id, covered] of Object.entries(index.coverage || {})) {
    monthsByCompany.set(id, new Set(covered));
  }

  return {
    companies,
    companiesById,
    seeds: companies.filter((company) => company.seed),
    months,
    series: new Map(),
    monthsByCompany,
    loadedCompanies: new Set(),
    defaultMonth: defaultMonth(months),
    metrics: withContextualDirections(index.metrics),
    competitors: index.competitors || {},
    generatedAt: index.generatedAt ?? index.generated_at ?? null,
  };
}

async function loadOnMainThread(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The sample file returned ${response.status}.`);
  const model = buildModelFromDocument(await response.json());
  return {
    model,
    ensure() {
      return Promise.resolve();
    },
  };
}

function loadWithWorker(url) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("../workers/demo-worker.js", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let model = null;
    let requestSerial = 0;
    const pending = new Map();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error("The catalog took too long to load."));
    }, WORKER_TIMEOUT_MS);

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      reject(error);
    };

    worker.onerror = () => {
      fail(new Error("The catalog worker could not start."));
    };

    worker.onmessage = (event) => {
      const message = event.data;
      if (!message) return;

      if (message.type === "error") {
        fail(new Error(message.message));
        return;
      }

      if (message.type === "index") {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        model = buildModelFromIndex(message);
        resolve({
          model,
          ensure(ids) {
            const need = [...new Set((ids || []).filter(Boolean))].filter(
              (id) => !model.loadedCompanies.has(id),
            );
            if (!need.length) return Promise.resolve();
            const requestId = ++requestSerial;
            return new Promise((resolveRows, rejectRows) => {
              pending.set(requestId, { resolveRows, rejectRows, need });
              worker.postMessage({ type: "series", requestId, ids: need });
            });
          },
        });
        return;
      }

      if (message.type === "series") {
        const request = pending.get(message.requestId);
        if (!request || !model) return;
        pending.delete(message.requestId);
        mergeSeries(model, message.rows);
        for (const id of request.need) model.loadedCompanies.add(id);
        request.resolveRows();
      }
    };

    worker.postMessage({ type: "load", url });
  });
}

export async function loadCatalog(url = demoJsonUrl()) {
  try {
    return await loadWithWorker(url);
  } catch {
    return loadOnMainThread(url);
  }
}
