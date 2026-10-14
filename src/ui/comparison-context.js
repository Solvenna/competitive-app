let readContext = () => ({ company: "", competitors: "" });

export function setComparisonReader(reader) {
  readContext = reader;
}

export function readComparisonContext() {
  try {
    const context = readContext() || {};
    return {
      company: String(context.company || ""),
      competitors: String(context.competitors || ""),
    };
  } catch {
    return { company: "", competitors: "" };
  }
}
