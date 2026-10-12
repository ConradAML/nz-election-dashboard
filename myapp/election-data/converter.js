import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

const SNAPSHOT_PARTY_CODES = new Set(["5", "10", "13", "14", "16", "17", "24"]);

const SVG_NAME_ALIASES = {
  East_Cape: "East_Coast",
  Kapiti: "Otaki",
  Invercargil: "Invercargill",
};

const DISPLAY_NAME_ALIASES = {
  "East Coast": "East Cape",
  "Ōtaki": "Kapiti",
  Otaki: "Kapiti",
  Rongotai: "Wellington Bays",
  "Wellington Central": "Wellington North",
  "Ōhāriu": "Kenepuru",
  Ohariu: "Kenepuru",
  "Bay of Plenty": "Mt Maunganui",
  "New Lynn": "Waitākere",
  "Te Atatū": "Henderson",
  Kelston: "Glendene",
  "Panmure-Ōtāhuhu": "Ōtāhuhu",
};

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeNumericEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : decodeNumericEntities(String(value)).trim();
}

function rawText(value, fallback = "") {
  return value === undefined || value === null ? fallback : decodeNumericEntities(String(value));
}

function integer(value) {
  const parsed = Number.parseInt(text(value, "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function number(value) {
  const parsed = Number.parseFloat(text(value, "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseXml(xml, expectedRoot) {
  const document = parser.parse(xml);
  const root = document[expectedRoot];
  if (!root) throw new Error(`XML document does not contain <${expectedRoot}>`);
  return root;
}

function childRecords(container, childName) {
  return asArray(container?.[childName]).map((record) => {
    const output = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === "#text") continue;
      output[key] = rawText(value);
    }
    return output;
  });
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (quoted) {
      if (character === '"' && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function normalizeSvgId(name) {
  return text(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/'/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeNotionalLabel(label) {
  return text(label)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function loadNotionalShares(csvText) {
  const output = {};
  for (const row of parseCsv(csvText)) {
    const electorateId = normalizeSvgId(row.electorate_name);
    const totalColumn = Object.keys(row).find((column) => column.startsWith("Total_valid_"));
    const shares = {};
    const votes = {};
    for (const [column, value] of Object.entries(row)) {
      if (column.endsWith("_share") && value) {
        shares[normalizeNotionalLabel(column.slice(0, -6))] = number(value) * 100;
      }
      if (column.endsWith("_votes") && value) {
        votes[normalizeNotionalLabel(column.slice(0, -6))] = number(value);
      }
    }
    output[electorateId] = {
      total_votes: number(row[totalColumn] ?? 0),
      shares,
      votes,
    };
  }
  return output;
}

function findNotionalShare(shares, partyMeta, candidateName = null, independent = false) {
  if (independent && candidateName) {
    const value = shares[normalizeNotionalLabel(`INDEPENDENT — ${candidateName}`)];
    if (value !== undefined) return value;
  }
  for (const label of [partyMeta.short_name, partyMeta.party_name, partyMeta.abbrev]) {
    const value = shares[normalizeNotionalLabel(label)];
    if (value !== undefined) return value;
  }
  return null;
}

function loadSvgLayerIds(svg) {
  const ids = [];
  const expression = /<(?:[\w-]+:)?(?:g|path)\b[^>]*\bid=["']([^"']+)["']/gi;
  for (const match of svg.matchAll(expression)) ids.push(match[1]);
  return ids;
}

function matchingBlockLength(first, second, firstStart, firstEnd, secondStart, secondEnd) {
  let bestFirst = firstStart;
  let bestSecond = secondStart;
  let bestSize = 0;
  const lengths = new Map();
  for (let firstIndex = firstStart; firstIndex < firstEnd; firstIndex += 1) {
    const nextLengths = new Map();
    for (let secondIndex = secondStart; secondIndex < secondEnd; secondIndex += 1) {
      if (first[firstIndex] !== second[secondIndex]) continue;
      const size = (lengths.get(secondIndex - 1) ?? 0) + 1;
      nextLengths.set(secondIndex, size);
      if (size > bestSize) {
        bestFirst = firstIndex - size + 1;
        bestSecond = secondIndex - size + 1;
        bestSize = size;
      }
    }
    lengths.clear();
    for (const entry of nextLengths) lengths.set(...entry);
  }
  return [bestFirst, bestSecond, bestSize];
}

function sequenceMatchSize(first, second, firstStart = 0, firstEnd = first.length, secondStart = 0, secondEnd = second.length) {
  const [firstIndex, secondIndex, size] = matchingBlockLength(first, second, firstStart, firstEnd, secondStart, secondEnd);
  if (!size) return 0;
  return size
    + sequenceMatchSize(first, second, firstStart, firstIndex, secondStart, secondIndex)
    + sequenceMatchSize(first, second, firstIndex + size, firstEnd, secondIndex + size, secondEnd);
}

function sequenceRatio(first, second) {
  if (!first.length && !second.length) return 1;
  return (2 * sequenceMatchSize(first, second)) / (first.length + second.length);
}

function pickSvgMatch(normalizedName, svgIds) {
  if (svgIds.includes(normalizedName)) return [normalizedName, "exact"];
  for (const [svgId, aliasTarget] of Object.entries(SVG_NAME_ALIASES)) {
    if (aliasTarget === normalizedName && svgIds.includes(svgId)) return [svgId, "alias"];
  }

  const normalizedTokens = new Set(normalizedName.toLowerCase().split(/[_-]+/).filter(Boolean));
  let bestId = null;
  let bestScore = 0;
  for (const svgId of svgIds) {
    const svgTokens = new Set(svgId.toLowerCase().split(/[_-]+/).filter(Boolean));
    const overlap = [...normalizedTokens].filter((token) => svgTokens.has(token)).length;
    const score = sequenceRatio(normalizedName.toLowerCase(), svgId.toLowerCase()) + overlap * 0.18;
    if (score > bestScore) {
      bestScore = score;
      bestId = svgId;
    }
  }
  return bestId && bestScore >= 0.88 ? [bestId, "fuzzy"] : [normalizedName, "none"];
}

function buildLookups(source) {
  const candidatesRoot = parseXml(source.candidatesXml, "candidates");
  const electoratesRoot = parseXml(source.electoratesXml, "electorates");
  const partiesRoot = parseXml(source.partiesXml, "parties");
  const candidates = Object.fromEntries(asArray(candidatesRoot.candidate).map((candidate) => [text(candidate.c_no), {
    party: text(candidate.party),
    candidate_name: text(candidate.candidate_name),
  }]));
  const electorateNames = Object.fromEntries(asArray(electoratesRoot.electorate).map((electorate) => {
    const name = text(electorate.electorate_name);
    return [text(electorate.e_no), DISPLAY_NAME_ALIASES[name] ?? name];
  }));
  const parties = childRecords(partiesRoot, "party");
  const partyLookup = Object.fromEntries(parties.map((party) => [party.p_no, {
    abbrev: party.abbrev ?? "",
    short_name: party.short_name ?? "",
    party_name: party.party_name ?? "",
  }]));
  return { candidates, electorateNames, parties, partyLookup };
}

function addCount(counts, key, value) {
  counts.set(key, (counts.get(key) ?? 0) + value);
}

function maximumCount(counts) {
  const entries = [...counts.entries()];
  return entries.length ? entries.reduce((best, entry) => entry[1] > best[1] ? entry : best) : [null, 0];
}

function electorateDocuments(source) {
  return Object.entries(source.electorateXmlByNumber)
    .sort(([first], [second]) => Number(first) - Number(second))
    .map(([, xml]) => parseXml(xml, "electorate"));
}

function buildElectorateWinners(source, lookups, svgIds) {
  const bySvgId = Object.fromEntries(svgIds.map((svgId) => [svgId, {
    svg_id: svgId,
    has_svg_match: false,
    electorate_name: null,
    electorate_number: null,
    winner_party_code: null,
    winner_party_short_name: null,
    winner_party_name: null,
    winner_votes: 0,
    total_valid_candidate_votes: 0,
  }]));
  const byElectorateNumber = {};

  for (const electorate of electorateDocuments(source)) {
    const electorateNumber = text(electorate.e_no);
    const electorateName = lookups.electorateNames[electorateNumber] ?? "";
    const normalizedName = normalizeSvgId(electorateName);
    const [svgId, matchMethod] = pickSvgMatch(normalizedName, svgIds);
    const partyVoteCounts = new Map();
    for (const candidate of asArray(electorate.candidatevotes?.candidate)) {
      const candidateMeta = lookups.candidates[text(candidate.c_no)] ?? {};
      if (candidateMeta.party) addCount(partyVoteCounts, candidateMeta.party, integer(candidate.votes));
    }
    const [winnerPartyCode, winnerVotes] = maximumCount(partyVoteCounts);
    const winnerParty = lookups.partyLookup[winnerPartyCode] ?? {};
    const result = {
      svg_id: svgId,
      has_svg_match: Object.hasOwn(bySvgId, svgId),
      match_method: matchMethod,
      normalized_name: normalizedName,
      electorate_name: electorateName,
      electorate_number: electorateNumber,
      winner_party_code: winnerPartyCode,
      winner_party_short_name: winnerParty.short_name ?? "",
      winner_party_name: winnerParty.party_name ?? "",
      winner_votes: winnerVotes,
      total_valid_candidate_votes: [...partyVoteCounts.values()].reduce((sum, votes) => sum + votes, 0),
    };
    byElectorateNumber[electorateNumber] = result;
    if (result.has_svg_match) bySvgId[svgId] = result;
  }

  return {
    by_electorate_number: byElectorateNumber,
    by_svg_id: bySvgId,
    unmatched_svg_ids: svgIds.filter((svgId) => !bySvgId[svgId].has_svg_match),
  };
}

function buildElectorateDetails(source, lookups, svgIds) {
  const electorateNotionals = loadNotionalShares(source.electorateNotionalsCsv);
  const partyNotionals = loadNotionalShares(source.partyNotionalsCsv);
  const details = {};

  for (const electorate of electorateDocuments(source)) {
    const electorateNumber = text(electorate.e_no);
    const electorateName = lookups.electorateNames[electorateNumber] ?? "";
    const normalizedName = normalizeSvgId(electorateName);
    const electoratePrevious = electorateNotionals[normalizedName] ?? {};
    const partyPrevious = partyNotionals[normalizedName] ?? {};
    const [svgId, matchMethod] = pickSvgMatch(normalizedName, svgIds);
    const candidateResults = [];
    const partyVoteResults = [];
    const candidatePartyCounts = new Map();
    const partyBallotCounts = new Map();

    for (const candidate of asArray(electorate.candidatevotes?.candidate)) {
      const candidateNumber = text(candidate.c_no);
      const candidateMeta = lookups.candidates[candidateNumber] ?? {};
      const partyCode = candidateMeta.party ?? "";
      const partyMeta = lookups.partyLookup[partyCode] ?? {};
      const votes = integer(candidate.votes);
      candidateResults.push({
        candidate_number: candidateNumber,
        candidate_name: candidateMeta.candidate_name ?? "",
        party_code: partyCode,
        party_short_name: partyMeta.short_name ?? "",
        party_name: partyMeta.party_name ?? "",
        votes,
      });
      if (partyCode) addCount(candidatePartyCounts, partyCode, votes);
    }

    for (const party of asArray(electorate.partyvotes?.party)) {
      const partyCode = text(party.p_no);
      const partyMeta = lookups.partyLookup[partyCode] ?? {};
      const votes = integer(party.votes);
      partyVoteResults.push({
        party_code: partyCode,
        party_short_name: partyMeta.short_name ?? "",
        party_name: partyMeta.party_name ?? "",
        votes,
      });
      addCount(partyBallotCounts, partyCode, votes);
    }

    const totalCandidateVotes = candidateResults.reduce((sum, candidate) => sum + candidate.votes, 0);
    const totalPartyVotes = partyVoteResults.reduce((sum, party) => sum + party.votes, 0);
    candidateResults.sort((first, second) => second.votes - first.votes);
    partyVoteResults.sort((first, second) => second.votes - first.votes);

    for (const candidate of candidateResults) {
      candidate.vote_share = totalCandidateVotes ? round(candidate.votes / totalCandidateVotes * 100) : 0;
      const previousShare = findNotionalShare(
        electoratePrevious.shares ?? {},
        lookups.partyLookup[candidate.party_code] ?? {},
        candidate.candidate_name,
        candidate.party_code === "0",
      );
      candidate.previous_vote_share = previousShare === null ? null : round(previousShare);
      candidate.change = previousShare === null ? null : round(candidate.vote_share - candidate.previous_vote_share);
    }

    for (const party of partyVoteResults) {
      party.vote_share = totalPartyVotes ? round(party.votes / totalPartyVotes * 100) : 0;
      const meta = lookups.partyLookup[party.party_code] ?? {};
      const previousShare = findNotionalShare(partyPrevious.shares ?? {}, meta);
      const previousVotes = findNotionalShare(partyPrevious.votes ?? {}, meta);
      party.previous_votes = previousVotes === null ? null : round(previousVotes, 4);
      party.previous_vote_share = previousShare === null ? null : round(previousShare);
      party.change = previousShare === null ? null : round(party.vote_share - party.previous_vote_share);
    }

    const [winnerPartyCode, winnerPartyVotes] = maximumCount(candidatePartyCounts);
    const winnerParty = lookups.partyLookup[winnerPartyCode] ?? {};
    const [leadingPartyCode, leadingPartyTotal] = maximumCount(partyBallotCounts);
    const leadingParty = lookups.partyLookup[leadingPartyCode] ?? {};
    const statistics = electorate.statistics ?? {};

    details[electorateNumber] = {
      electorate_number: electorateNumber,
      electorate_name: electorateName,
      svg_id: svgId,
      match_method: matchMethod,
      winner_party_code: winnerPartyCode,
      winner_party_short_name: winnerParty.short_name ?? "",
      winner_party_name: winnerParty.party_name ?? "",
      winner_party_votes: winnerPartyVotes,
      leading_party_vote_code: leadingPartyCode,
      leading_party_vote_short_name: leadingParty.short_name ?? "",
      leading_party_vote_name: leadingParty.party_name ?? "",
      leading_party_vote_total: leadingPartyTotal,
      total_voting_places_counted: integer(statistics.total_voting_places_counted),
      percent_voting_places_counted: number(statistics.percent_voting_places_counted),
      total_votes_cast: integer(statistics.total_votes_cast),
      percent_votes_cast: number(statistics.percent_votes_cast),
      total_valid_candidate_votes: totalCandidateVotes,
      total_valid_party_votes: totalPartyVotes,
      previous_total_valid_party_votes: round(partyPrevious.total_votes ?? 0, 4),
      candidate_results: candidateResults,
      party_vote_results: partyVoteResults,
    };
  }
  return { by_electorate_number: details };
}

export function buildPartyVoteSnapshot(results, voteCount, timestamp = new Date().toISOString()) {
  const parties = {};
  const projectedSeats = {};
  const sorted = [...results].sort((first, second) => integer(first.p_no) - integer(second.p_no));
  for (const result of sorted.filter((item) => SNAPSHOT_PARTY_CODES.has(item.p_no))) {
    parties[result.p_no] = { votes: integer(result.votes), voteShare: number(result.percent_votes) };
  }
  const other = results.filter((item) => !SNAPSHOT_PARTY_CODES.has(item.p_no));
  parties.other = {
    votes: other.reduce((sum, result) => sum + integer(result.votes), 0),
    voteShare: round(other.reduce((sum, result) => sum + number(result.percent_votes), 0)),
  };
  for (const result of results.filter((item) => SNAPSHOT_PARTY_CODES.has(item.p_no))) {
    projectedSeats[result.p_no] = integer(result.total_seats);
  }
  projectedSeats.other = other.reduce((sum, result) => sum + integer(result.total_seats), 0);
  return {
    timestamp,
    percentCounted: number(voteCount.percent_voting_places_counted),
    totalVotingPlacesCounted: integer(voteCount.total_voting_places_counted),
    totalVotesCast: integer(voteCount.total_votes_cast),
    turnout: number(voteCount.percent_votes_cast),
    parties,
    projectedSeats,
  };
}

export function convertElectionData(source) {
  const lookups = buildLookups(source);
  const election = parseXml(source.electionXml, "election");
  const results = childRecords(election.partystatus, "party").map((result) => ({
    ...result,
    ...(lookups.partyLookup[result.p_no] ?? { abbrev: "", short_name: "", party_name: "" }),
  }));
  const statistics = election.statistics ?? {};
  const voteCount = {
    label: "Percentage of votes counted",
    value: text(statistics.percent_voting_places_counted, "0"),
    total_voting_places_counted: text(statistics.total_voting_places_counted, "0"),
    percent_voting_places_counted: text(statistics.percent_voting_places_counted, "0"),
    total_votes_cast: text(statistics.total_votes_cast, "0"),
    percent_votes_cast: text(statistics.percent_votes_cast, "0"),
  };
  const svgIds = loadSvgLayerIds(source.mapSvg);
  return {
    results,
    voteCount,
    electorateWinners: buildElectorateWinners(source, lookups, svgIds),
    electorateDetails: buildElectorateDetails(source, lookups, svgIds),
  };
}
