import { loadCatalog, suggestedCompetitorIds } from "../lib/catalog.js";
import { formatMonth } from "../lib/format.js";
import { escapeHtml } from "../lib/html.js";
import {
  SPOTLIGHT_METRIC_IDS,
  coverageNote,
  definitionFor,
  displayLabel,
  metricCell,
  readMetric,
  tableRows,
} from "../lib/metrics.js";
import { searchCompanies } from "../lib/search.js";
import { openMonthGate } from "./month-gate.js";
import { createPriorityPlays } from "./priority-plays.js";

const LOCK_ICON = `<svg class="lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.4 7V5.1a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

export function startApp(root) {
  const state = {
    model: null,
    store: null,
    companyId: null,
    month: null,
    removed: new Set(),
    added: [],
    companyQuery: "",
    companyOpen: false,
    companyActiveIndex: 0,
    addQuery: "",
    addOpen: false,
    addActiveIndex: 0,
    activeCompareIds,
  };

  let seriesGeneration = 0;
  const refreshPriorityPlays = createPriorityPlays(state);

  function companyById(id) {
    return state.model.companiesById.get(id) || null;
  }

  function companyName(id) {
    return companyById(id)?.name || id;
  }

  function showsDomain(company) {
    if (!company?.domain) return false;
    return company.domain.toLowerCase() !== String(company.name || "").toLowerCase();
  }

  function activeCompareIds() {
    const ids = [];
    const seen = new Set();
    for (const id of [...suggestedCompetitorIds(state.model, state.companyId), ...state.added]) {
      if (!id || id === state.companyId || seen.has(id) || state.removed.has(id)) continue;
      if (!companyById(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function companyMatches() {
    return searchCompanies(state.model.companies, state.companyQuery, {
      seedsWhenEmpty: true,
      limit: 12,
    });
  }

  function addMatches() {
    const exclude = new Set([state.companyId, ...activeCompareIds()]);
    return searchCompanies(state.model.companies, state.addQuery, { exclude, limit: 12 });
  }

  function idsToLoad() {
    return [state.companyId, ...suggestedCompetitorIds(state.model, state.companyId), ...state.added].filter(
      Boolean,
    );
  }

  function metricsReady(ids) {
    return ids.every((id) => state.model.loadedCompanies.has(id));
  }

  function syncUrl() {
    const url = new URL(location.href);
    if (state.companyId) url.searchParams.set("company", state.companyId);
    else url.searchParams.delete("company");
    if (state.companyId && state.month) url.searchParams.set("month", state.month.slice(0, 7));
    else url.searchParams.delete("month");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function syncTitle() {
    const name = state.companyId ? companyName(state.companyId) : null;
    document.title = name
      ? `${name} · Solvenna Marketing Benchmark`
      : "Solvenna Marketing Benchmark";
  }

  function ensureSeries() {
    const requestId = ++seriesGeneration;
    const ids = idsToLoad();
    return state.store
      .ensure(ids)
      .then(() => {
        if (requestId === seriesGeneration) renderResults();
      })
      .catch((error) => {
        if (requestId !== seriesGeneration) return;
        showLoadError(
          error instanceof Error ? error.message : "The comparison metrics could not be loaded.",
        );
      });
  }

  function selectCompany(id) {
    if (!companyById(id)) return;
    state.companyQuery = "";
    state.companyOpen = false;
    state.companyActiveIndex = 0;
    const input = document.querySelector("#company-search");
    if (input) input.value = companyName(id);
    renderCompanyList();
    if (state.companyId === id) return;
    state.companyId = id;
    state.removed = new Set();
    state.added = [];
    state.addQuery = "";
    state.addOpen = false;
    state.addActiveIndex = 0;
    const addInput = document.querySelector("#add-company");
    if (addInput) addInput.value = "";
    syncUrl();
    syncTitle();
    renderCompetitors();
    renderAddList();
    renderResults();
    refreshPriorityPlays();
    ensureSeries();
  }

  function removeCompetitor(id) {
    const before = activeCompareIds().join("\0");
    state.removed.add(id);
    state.added = state.added.filter((existing) => existing !== id);
    renderCompetitors();
    renderAddList();
    renderResults();
    if (activeCompareIds().join("\0") !== before) refreshPriorityPlays();
  }

  function addCompetitor(id) {
    if (!companyById(id) || id === state.companyId) return;
    const before = activeCompareIds().join("\0");
    state.removed.delete(id);
    const suggested = new Set(suggestedCompetitorIds(state.model, state.companyId));
    if (!suggested.has(id) && !state.added.includes(id)) state.added.push(id);
    state.addQuery = "";
    state.addOpen = false;
    state.addActiveIndex = 0;
    const addInput = document.querySelector("#add-company");
    if (addInput) addInput.value = "";
    renderCompetitors();
    renderAddList();
    renderResults();
    ensureSeries();
    if (activeCompareIds().join("\0") !== before) refreshPriorityPlays();
    addInput?.focus();
  }

  function renderCombo(list, input, result, { open, activeIndex, idPrefix, idleText }) {
    let index = activeIndex;
    const matches = result.matches;
    if (index > matches.length - 1) index = Math.max(matches.length - 1, 0);
    input.setAttribute("aria-expanded", open ? "true" : "false");
    list.hidden = !open;
    if (!matches.length) {
      list.innerHTML = `<li class="hint" style="margin:0;padding:0.55rem 0.7rem">${escapeHtml(idleText)}</li>`;
      input.removeAttribute("aria-activedescendant");
      return index;
    }
    list.innerHTML =
      matches
        .map((company, itemIndex) => {
          const active = itemIndex === index;
          return `<li
        id="${idPrefix}${escapeHtml(company.id)}"
        role="option"
        data-id="${escapeHtml(company.id)}"
        class="${active ? "active" : ""}"
        aria-selected="${active ? "true" : "false"}"
      ><span class="opt-name">${escapeHtml(company.name)}</span><span class="opt-domain">${escapeHtml(company.domain)}</span></li>`;
        })
        .join("") +
      (result.truncated
        ? `<li class="hint" style="margin:0;padding:0.45rem 0.7rem">Keep typing to narrow the list.</li>`
        : "");
    const current = matches[index];
    if (current && open) {
      input.setAttribute("aria-activedescendant", `${idPrefix}${current.id}`);
      document.getElementById(`${idPrefix}${current.id}`)?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    return index;
  }

  function renderCompanyList() {
    const list = document.querySelector("#company-list");
    const input = document.querySelector("#company-search");
    if (!list || !input) return;
    const idleText = state.companyQuery.trim()
      ? "No companies match that search."
      : "Type a name or domain.";
    state.companyActiveIndex = renderCombo(list, input, companyMatches(), {
      open: state.companyOpen,
      activeIndex: state.companyActiveIndex,
      idPrefix: "company-opt-",
      idleText,
    });
  }

  function renderAddList() {
    const list = document.querySelector("#add-list");
    const input = document.querySelector("#add-company");
    if (!list || !input) return;
    const idleText = state.addQuery.trim()
      ? "No companies match that search."
      : "Type a name or domain.";
    state.addActiveIndex = renderCombo(list, input, addMatches(), {
      open: state.addOpen,
      activeIndex: state.addActiveIndex,
      idPrefix: "add-opt-",
      idleText,
    });
  }

  function renderCompetitors() {
    const list = document.querySelector("#competitor-list");
    if (!list) return;
    const ids = activeCompareIds();
    if (!ids.length) {
      list.innerHTML = `<li class="competitor-empty">None selected.</li>`;
      return;
    }
    list.innerHTML = ids
      .map((id) => {
        const company = companyById(id);
        const name = company?.name || id;
        const domain = showsDomain(company)
          ? `<span class="chip-domain">${escapeHtml(company.domain)}</span>`
          : "";
        return `<li>
        <span class="competitor">
          <span class="competitor-name">${escapeHtml(name)}</span>
          ${domain}
          <button type="button" class="competitor-remove" data-id="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(name)}">
            <span aria-hidden="true">×</span>
          </button>
        </span>
      </li>`;
      })
      .join("");
  }

  function closeMonthMenu() {
    const menu = document.querySelector("#month-menu");
    const trigger = document.querySelector("#month-trigger");
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }

  function onCompanyKeydown(event) {
    const matches = companyMatches().matches;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.companyOpen) {
        if (matches.length) {
          state.companyActiveIndex = Math.min(state.companyActiveIndex + 1, matches.length - 1);
        }
      } else {
        state.companyOpen = true;
        state.companyQuery = "";
        state.companyActiveIndex = 0;
      }
      renderCompanyList();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (state.companyOpen) {
        state.companyActiveIndex = Math.max(state.companyActiveIndex - 1, 0);
      } else {
        state.companyOpen = true;
        state.companyQuery = "";
        state.companyActiveIndex = 0;
      }
      renderCompanyList();
      return;
    }
    if (event.key === "Enter") {
      if (!state.companyOpen) return;
      event.preventDefault();
      const chosen = matches[state.companyActiveIndex] || (matches.length === 1 ? matches[0] : null);
      if (chosen) selectCompany(chosen.id);
      return;
    }
    if (event.key === "Escape") {
      state.companyOpen = false;
      state.companyQuery = "";
      event.target.value = companyName(state.companyId);
      renderCompanyList();
    }
  }

  function onAddKeydown(event) {
    const matches = addMatches().matches;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.addOpen) {
        if (matches.length) {
          state.addActiveIndex = Math.min(state.addActiveIndex + 1, matches.length - 1);
        }
      } else {
        state.addOpen = true;
        state.addActiveIndex = 0;
      }
      renderAddList();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (state.addOpen) {
        state.addActiveIndex = Math.max(state.addActiveIndex - 1, 0);
      } else {
        state.addOpen = true;
        state.addActiveIndex = 0;
      }
      renderAddList();
      return;
    }
    if (event.key === "Enter") {
      if (!state.addOpen) return;
      event.preventDefault();
      const chosen = matches[state.addActiveIndex] || (matches.length === 1 ? matches[0] : null);
      if (chosen) addCompetitor(chosen.id);
      return;
    }
    if (event.key === "Escape") {
      state.addOpen = false;
      renderAddList();
    }
  }

  function onSetupClick(event) {
    const trigger = event.target.closest("#month-trigger");
    if (trigger) {
      const menu = document.querySelector("#month-menu");
      const opening = menu?.hidden;
      if (menu) menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", opening ? "true" : "false");
      return;
    }
    const monthButton = event.target.closest("[data-month]");
    if (monthButton) {
      closeMonthMenu();
      if (monthButton.dataset.month !== state.model.defaultMonth) openMonthGate();
      return;
    }
    if (event.target.closest("#why-month")) {
      closeMonthMenu();
      openMonthGate();
    }
  }

  function onSetupKeydown(event) {
    const menu = document.querySelector("#month-menu");
    const option = event.target.closest("#month-menu button");
    if (option && menu) {
      const buttons = [...menu.querySelectorAll("button")];
      const index = buttons.indexOf(option);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        buttons[Math.max(index - 1, 0)]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMonthMenu();
        document.querySelector("#month-trigger")?.focus();
      }
      return;
    }
    const trigger = event.target.closest("#month-trigger");
    if (!trigger) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (menu) menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      menu?.querySelector("button")?.focus();
    }
    if (event.key === "Escape") closeMonthMenu();
  }

  function columnHeader(companyId, month, focal) {
    const company = companyById(companyId);
    const name = company?.name || companyId;
    const domain = showsDomain(company)
      ? `<span class="header-domain">${escapeHtml(company.domain)}</span>`
      : "";
    const badge = focal ? `<span class="badge">Selected</span>` : "";
    const note = coverageNote(state.model, company?.id, month);
    const noteHtml = note ? `<span class="col-note">${escapeHtml(note)}</span>` : "";
    return `<th scope="col" class="company${focal ? " focal" : ""}" data-company="${escapeHtml(companyId)}" title="${escapeHtml(name)}">
    <span class="company-name">${escapeHtml(name)}</span>
    ${domain}
    ${badge}
    ${noteHtml}
  </th>`;
  }

  function comparisonPhrase(cmp, focalName) {
    if (cmp === "better") return `Better than ${focalName}. `;
    if (cmp === "worse") return `Worse than ${focalName}. `;
    return "";
  }

  function comparisonTable(focal, compareIds, month) {
    const focalName = companyName(focal.id);
    const columnCount = compareIds.length + 1;
    const body = tableRows(state.model.metrics)
      .map((row) => {
        if (row.type === "group") {
          return `<tr class="group"><th colspan="${columnCount}" scope="colgroup">${escapeHtml(row.label)}</th></tr>`;
        }
        const metric = row.metric;
        const label = displayLabel(metric);
        const definition = definitionFor(metric);
        const cells = [focal.id, ...compareIds]
          .map((id) => {
            const cell = metricCell(state.model, metric, id, focal.id, month);
            const classes = ["num", cell.kind];
            if (id === focal.id) classes.push("focal");
            if (cell.cmp) classes.push(cell.cmp);
            const phrase = comparisonPhrase(cell.cmp, focalName);
            return `<td class="${classes.join(" ")}" data-company="${escapeHtml(id)}" data-metric="${escapeHtml(metric.id)}" data-kind="${cell.kind}"${cell.cmp ? ` data-cmp="${cell.cmp}"` : ""}>${phrase ? `<span class="vh">${escapeHtml(phrase)}</span>` : ""}${escapeHtml(cell.display)}</td>`;
          })
          .join("");
        return `<tr>
        <th scope="row" class="metric">
          <button type="button" class="metric-label" data-definition="${escapeHtml(definition)}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>
        </th>
        ${cells}
      </tr>`;
      })
      .join("");

    return `<div class="table-card">
    <table id="comparison-table" style="--companies:${columnCount}">
      <colgroup>
        <col class="col-metric" />
        ${Array.from({ length: columnCount }, () => `<col class="col-company" />`).join("")}
      </colgroup>
      <caption>Metric comparison for ${escapeHtml(focalName)} and selected competitors, ${escapeHtml(formatMonth(month))}</caption>
      <thead>
        <tr>
          <th scope="col" class="metric">Metric</th>
          ${columnHeader(focal.id, month, true)}
          ${compareIds.map((id) => columnHeader(id, month, false)).join("")}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>
  <p class="scroll-hint">Scroll sideways to see every competitor.</p>`;
  }

  function spotlight(focal, compareIds, month) {
    const cards = SPOTLIGHT_METRIC_IDS.map((metricId) => {
      const metric = state.model.metrics.find((item) => item.id === metricId);
      if (!metric || metric.available_in_snapshot === false) return "";
      const points = [focal.id, ...compareIds].map((id) => ({
        id,
        value: readMetric(state.model, id, month, metric.id),
      }));
      if (points[0].value == null) return "";
      const max = Math.max(...points.map((point) => (point.value != null && point.value > 0 ? point.value : 0)));
      const bars = points
        .map((point) => {
          const name = companyById(point.id)?.name || point.id;
          const cell = metricCell(state.model, metric, point.id, focal.id, month);
          const width =
            point.value == null || max <= 0 ? 0 : Math.min(100, Math.max(0, (point.value / max) * 100));
          const tone = point.id === focal.id ? "focal" : cell.cmp || "";
          return `<li class="bar-row${point.id === focal.id ? " focal" : ""}">
          <span class="bar-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span class="track"><span class="fill ${tone}" style="width:${width.toFixed(1)}%"></span></span>
          <span class="bar-val">${escapeHtml(cell.display)}</span>
        </li>`;
        })
        .join("");
      const focalCell = metricCell(state.model, metric, focal.id, focal.id, month);
      return `<article class="spot-card">
      <div class="spot-top">
        <h3>${escapeHtml(displayLabel(metric))}</h3>
        <span class="spot-focal">${escapeHtml(focalCell.display)}</span>
      </div>
      <ul class="bars">${bars}</ul>
    </article>`;
    }).filter(Boolean);

    if (!cards.length) return "";
    return `<section class="spotlight" aria-labelledby="glance-title">
    <div class="spot-head">
      <h3 id="glance-title">At a glance</h3>
      <p>Bar length is the raw value. Color compares each competitor with the selected company.</p>
    </div>
    <div class="spot-grid">${cards.join("")}</div>
  </section>`;
  }

  function renderResults() {
    const results = document.querySelector("#results");
    const focal = state.companyId ? companyById(state.companyId) : null;
    if (!focal || !results) return;
    const compareIds = activeCompareIds();
    const month = state.model.defaultMonth;
    state.month = month;
    if (!metricsReady([focal.id, ...compareIds])) {
      const status = document.querySelector("#live-status");
      if (status) status.textContent = `Loading metrics for ${focal.name}.`;
      results.innerHTML = `
      <section class="panel results-card">
        <p class="status">Loading metrics for this comparison…</p>
      </section>`;
      return;
    }
    const glance = spotlight(focal, compareIds, month);
    const status = document.querySelector("#live-status");
    if (status) {
      const count = compareIds.length === 1 ? "1 competitor" : `${compareIds.length} competitors`;
      status.textContent = `Comparing ${focal.name} with ${count} for ${formatMonth(month)}.`;
    }
    results.innerHTML = `
    <section class="panel results-card">
      <div class="compare-head">
        <h2>Comparison</h2>
        <ul class="legend">
          <li><span class="swatch better" aria-hidden="true"></span> Better than ${escapeHtml(focal.name)}</li>
          <li><span class="swatch worse" aria-hidden="true"></span> Worse than ${escapeHtml(focal.name)}</li>
        </ul>
      </div>
      ${comparisonTable(focal, compareIds, month)}
      ${glance ? `<div class="glance">${glance}</div>` : ""}
    </section>`;
  }

  function renderShell() {
    const month = state.model.defaultMonth;
    state.month = month;
    const monthOptions = state.model.months
      .map((option) => {
        const locked = option !== month;
        return `<li><button type="button" role="option" data-month="${escapeHtml(option)}" aria-selected="${locked ? "false" : "true"}"${locked ? ` aria-disabled="true" class="is-locked"` : ""}>
        <span>${escapeHtml(formatMonth(option))}</span>
        ${locked ? LOCK_ICON : ""}
      </button></li>`;
      })
      .join("");

    root.innerHTML = `
    <section class="panel setup" id="setup" aria-label="Comparison setup">
      <div class="setup-grid">
        <div class="setup-company">
          <label for="company-search">Company</label>
          <div class="combo">
            <input
              id="company-search"
              type="text"
              role="combobox"
              autocomplete="off"
              spellcheck="false"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="company-list"
              placeholder="Search by name or domain"
              value="${escapeHtml(companyName(state.companyId))}"
            />
            <ul id="company-list" class="combo-list" role="listbox" hidden></ul>
          </div>
        </div>
        <div class="setup-competitors">
          <span class="field-label" id="competitors-label">Compare To</span>
          <div class="competitor-row">
            <ul class="competitors" id="competitor-list" aria-labelledby="competitors-label"></ul>
            <div class="add-company combo">
              <label class="vh" for="add-company">Add a company</label>
              <input
                id="add-company"
                type="text"
                role="combobox"
                autocomplete="off"
                spellcheck="false"
                aria-autocomplete="list"
                aria-expanded="false"
                aria-controls="add-list"
                placeholder="Add a company"
              />
              <ul id="add-list" class="combo-list" role="listbox" hidden></ul>
            </div>
          </div>
        </div>
        <div class="month-wrap">
          <div class="month">
            <span id="month-label">Month</span>
            <button type="button" class="month-trigger" id="month-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="month-menu" aria-labelledby="month-label month-value">
              <span id="month-value">${escapeHtml(formatMonth(month))}</span>
            </button>
            <ul class="month-menu" id="month-menu" role="listbox" aria-labelledby="month-label" hidden>${monthOptions}</ul>
          </div>
          <button type="button" class="why-month" id="why-month">Why only one month?</button>
        </div>
      </div>
    </section>
    <section class="panel opportunities" aria-labelledby="opportunities-title">
      <h2 id="opportunities-title">Priority Plays</h2>
      <div id="opportunities-body" aria-live="polite"></div>
    </section>
    <p id="live-status" class="vh" aria-live="polite"></p>
    <div id="results"></div>
  `;

    const companyInput = document.querySelector("#company-search");
    companyInput.addEventListener("focus", () => {
      state.companyQuery = "";
      state.companyOpen = true;
      state.companyActiveIndex = 0;
      renderCompanyList();
      companyInput.select();
    });
    companyInput.addEventListener("input", () => {
      state.companyQuery = companyInput.value;
      state.companyOpen = true;
      state.companyActiveIndex = 0;
      renderCompanyList();
    });
    companyInput.addEventListener("keydown", onCompanyKeydown);
    companyInput.addEventListener("click", () => {
      if (state.companyOpen) return;
      state.companyQuery = "";
      state.companyOpen = true;
      state.companyActiveIndex = 0;
      renderCompanyList();
    });
    companyInput.addEventListener("blur", () => {
      state.companyOpen = false;
      state.companyQuery = "";
      companyInput.value = companyName(state.companyId);
      renderCompanyList();
    });

    const companyList = document.querySelector("#company-list");
    companyList.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-id]")) event.preventDefault();
    });
    companyList.addEventListener("click", (event) => {
      const option = event.target.closest("[data-id]");
      if (option) selectCompany(option.dataset.id);
    });

    document.querySelector("#competitor-list").addEventListener("click", (event) => {
      const button = event.target.closest(".competitor-remove");
      if (button) removeCompetitor(button.dataset.id);
    });

    const addInput = document.querySelector("#add-company");
    addInput.addEventListener("focus", () => {
      state.addOpen = true;
      renderAddList();
    });
    addInput.addEventListener("input", () => {
      state.addQuery = addInput.value;
      state.addOpen = true;
      state.addActiveIndex = 0;
      renderAddList();
    });
    addInput.addEventListener("keydown", onAddKeydown);
    addInput.addEventListener("click", () => {
      if (state.addOpen) return;
      state.addOpen = true;
      renderAddList();
    });
    addInput.addEventListener("blur", () => {
      state.addOpen = false;
      renderAddList();
    });

    const addList = document.querySelector("#add-list");
    addList.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-id]")) event.preventDefault();
    });
    addList.addEventListener("click", (event) => {
      const option = event.target.closest("[data-id]");
      if (option) addCompetitor(option.dataset.id);
    });

    const setup = document.querySelector("#setup");
    setup.addEventListener("click", onSetupClick);
    setup.addEventListener("keydown", onSetupKeydown);
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".month")) closeMonthMenu();
      if (!event.target.closest(".add-company") && state.addOpen) {
        state.addOpen = false;
        renderAddList();
      }
      if (!event.target.closest(".setup-company") && state.companyOpen) {
        state.companyOpen = false;
        state.companyQuery = "";
        const input = document.querySelector("#company-search");
        if (input) input.value = companyName(state.companyId);
        renderCompanyList();
      }
    });

    renderCompanyList();
    renderCompetitors();
    renderAddList();
    renderResults();
    refreshPriorityPlays();
    ensureSeries();
  }

  function showLoadError(message) {
    root.innerHTML = `
    <section class="banner" role="alert">
      <h2>Couldn’t load the sample</h2>
      <p>${escapeHtml(message)} Use <code>npm run dev</code> or <code>npm run preview</code> so <code>data/demo.json</code> can be fetched. Opening the HTML file directly will not load it.</p>
    </section>`;
  }

  loadCatalog()
    .then((store) => {
      state.store = store;
      state.model = store.model;
      if (!state.model.companies.length) {
        showLoadError("The sample file has no companies to choose from.");
        return;
      }
      const requested = new URLSearchParams(location.search).get("company");
      const fromUrl = state.model.companiesById.get(requested);
      const fallback = state.model.companiesById.has("bestbuy")
        ? "bestbuy"
        : state.model.seeds[0]?.id || state.model.companies[0].id;
      state.companyId = fromUrl ? fromUrl.id : fallback;
      state.month = state.model.defaultMonth;
      renderShell();
      syncTitle();
      syncUrl();
    })
    .catch((error) => {
      showLoadError(error instanceof Error ? error.message : "The sample file could not be read.");
    });
}
