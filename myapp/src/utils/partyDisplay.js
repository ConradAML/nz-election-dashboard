export function formatPartyDisplayLabel(shortName, fullName) {
  const sourceLabel = (shortName || fullName || "Independent").trim();

  if (sourceLabel === "The Opportunities Party") {
    return "Opportunity";
  }

  if (sourceLabel === "New Conservatives") {
    return "Conservative Party NZ";
  }

  return sourceLabel
    .replace(/\s+Party$/i, "")
    .replace(/\s+Movement$/i, "")
    .trim();
}

const MAIN_CHART_LABEL_OVERRIDES = {
  "Aotearoa Legalise Cannabis": "ALCP",
  "Animal Justice": "AJPANZ",
  "Conservative Party NZ": "CPNZ",
  "Women's Rights Party": "WRP",
};

export function formatMainChartPartyLabel(shortName, fullName) {
  const displayLabel = formatPartyDisplayLabel(shortName, fullName);

  return MAIN_CHART_LABEL_OVERRIDES[displayLabel] ?? displayLabel;
}
