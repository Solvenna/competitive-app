/**
 * Rank companies by name, domain, or id.
 * Empty query returns seeds when `seedsWhenEmpty` is set, otherwise nothing.
 */
export function searchCompanies(companies, query, options = {}) {
  const limit = options.limit ?? 12;
  const exclude = options.exclude || null;
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  const matches = [];

  if (!needle) {
    if (!options.seedsWhenEmpty) return { matches, truncated: false };
    let truncated = false;
    for (const company of companies) {
      if (!company?.seed || exclude?.has(company.id)) continue;
      if (matches.length < limit) matches.push(company);
      else truncated = true;
    }
    return { matches, truncated };
  }

  const ranked = [];
  for (const company of companies) {
    if (!company || exclude?.has(company.id)) continue;
    const name = String(company.name || "").toLowerCase();
    const domain = String(company.domain || "").toLowerCase();
    const id = String(company.id || "").toLowerCase();
    let rank = 4;
    if (name.startsWith(needle)) rank = 0;
    else if (domain.startsWith(needle)) rank = 1;
    else if (name.includes(needle)) rank = 2;
    else if (domain.includes(needle) || id.includes(needle)) rank = 3;
    else continue;
    ranked.push({ company, rank, name });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return {
    matches: ranked.slice(0, limit).map((entry) => entry.company),
    truncated: ranked.length > limit,
  };
}
