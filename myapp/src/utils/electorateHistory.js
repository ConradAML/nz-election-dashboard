import electorateVoteHistoryCsv from "../../../electorate_vote_history.csv?raw";
import partyVoteHistoryCsv from "../../../party_vote_history.csv?raw";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function buildHistoryLookup(csvText, winnerColumn) {
  const [rawHeaders, ...rows] = parseCsv(csvText.replace(/^\uFEFF/, ""));
  const headers = rawHeaders.map((header) => header.trim());
  const columnIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

  return new Map(rows.map((values) => {
    const electorate = values[columnIndex.Electorate];
    return [electorate, {
      electorate,
      otherNames: values[columnIndex["Other names"]] || "",
      results: [
        { year: "2023", party: values[columnIndex[winnerColumn]] },
        { year: "2020", party: values[columnIndex["2020"]] },
        { year: "2017", party: values[columnIndex["2017"]] },
      ],
    }];
  }));
}

const electorateVoteHistory = buildHistoryLookup(
  electorateVoteHistoryCsv,
  "2023 electorate vote winner (notional)",
);
const partyVoteHistory = buildHistoryLookup(
  partyVoteHistoryCsv,
  "2023 party vote winner (notional)",
);

export function getElectorateHistory(electorateName, voteType) {
  const history = voteType === "electorate" ? electorateVoteHistory : partyVoteHistory;
  return history.get(electorateName) ?? null;
}
