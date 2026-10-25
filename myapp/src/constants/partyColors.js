export const PARTY_COLORS = {
  "6": "#990000",
  "5": "#D3B641",
  "10": "#009900",
  "13": "#FF0000",
  "14": "#AA00D4",
  "16": "#3399FF",
  "17": "#999999",
  "24": "#F0E68C",
  "20": "#45B545",
  "32": "#000000",
  "34": "#0000FF",
  "36": "#7F7F7F",
  "51": "#78C878",
  "52": "#5ECF72",
  "54": "#333333",
  "56": "#B7B7B7",
  "58": "#78C878",
  "68": "#990000",
  "69": "#666666",
  "70": "#333333",
  "71": "#BB33DD",
};

export const NEUTRAL_PARTY_COLOR = "#c2a27c";
export const NEUTRAL_MAP_FILL = "#d7d3cb";

// Resolve name-based colours against the IDs supplied by the selected feed.
export function applyPartyColorOverrides(results, electorateDetails) {
  const electorateParties = Object.values(electorateDetails?.by_electorate_number ?? {})
    .flatMap((electorate) => [...(electorate.candidate_results ?? []), ...(electorate.party_vote_results ?? [])]);
  for (const party of [...(results ?? []), ...electorateParties]) {
    const names = [party.short_name, party.party_short_name, party.party_name];
    const code = party.p_no ?? party.party_code;
    if (code == null) continue;
    if (names.some((name) => /^free palestine(?: party)?$/i.test(name?.trim() ?? ""))) {
      PARTY_COLORS[code] = "#666666";
    }
    if (names.some((name) => /^te tai tokerau(?: party)?$/i.test(name?.trim() ?? ""))) {
      PARTY_COLORS[code] = "#BB33DD";
    }
  }
}
