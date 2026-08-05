import { useEffect, useRef, useState } from "react";
import VerticalBarChart from "./components/VerticalBarChart";
import SemiDonutChart from "./components/SemiDonutChart";
import VoteCountBar from "./components/VoteCountBar";
import InteractiveMap from "./components/InteractiveMap";
import ElectorateDetailPanel from "./components/ElectorateDetailPanel";
import RegionVoteCarousel from "./components/RegionVoteCarousel";
import HorizontalPartyVoteChart from "./components/HorizontalPartyVoteChart";
import PartyHistoryChart from "./components/PartyHistoryChart";
import VoteProgressionChart from "./components/VoteProgressionChart";
import useIsMobile from "./hooks/useIsMobile";
import useDashboardData from "./hooks/useDashboardData";
import { PARTY_COLORS } from "./constants/partyColors";
import {
  formatMainChartPartyLabel,
  formatPartyDisplayLabel,
} from "./utils/partyDisplay";

const GENERAL_ELECTORATES = "general";
const MAORI_ELECTORATES = "maori";
const MAORI_ELECTORATE_NUMBERS = new Set([
  "66",
  "67",
  "68",
  "69",
  "70",
  "71",
  "72",
]);
const REGION_POPULATION_ORDER = [
  "Māori electorates",
  "Auckland Region",
  "Canterbury Region",
  "Wellington Region",
  "Waikato Region",
  "Bay of Plenty Region",
  "Manawatū-Whanganui Region",
  "Otago Region",
  "Northland Region",
  "Hawke's Bay Region",
  "Taranaki Region",
  "Southland Region",
  "West Coast/Tasman Region",
  "Nelson Region",
  "Gisborne Region",
  "Marlborough Region",
];

function formatRegionCardName(regionName) {
  if (regionName === "Tasman Region") {
    return "West Coast/Tasman Region";
  }

  return regionName;
}

// Parties to be included in the charts
const PARTY_CONFIG = [
  {
    label: "National",
    code: "16",
    previousVote: 25.6,
    previousSeats: 33,
    color: PARTY_COLORS["16"],
  },
  {
    label: "Labour",
    code: "13",
    previousVote: 50.0,
    previousSeats: 65,
    color: PARTY_COLORS["13"],
  },
  {
    label: "Green",
    code: "10",
    previousVote: 7.9,
    previousSeats: 10,
    color: PARTY_COLORS["10"],
  },
  {
    label: "ACT",
    code: "5",
    previousVote: 7.6,
    previousSeats: 10,
    color: PARTY_COLORS["5"],
  },
  {
    label: "NZ First",
    code: "17",
    previousVote: 2.6,
    previousSeats: 0,
    color: PARTY_COLORS["17"],
  },
  {
    label: "Māori",
    code: "14",
    previousVote: 1.2,
    previousSeats: 2,
    color: PARTY_COLORS["14"],
  },
  {
    label: "Opportunity",
    code: "24",
    previousVote: 1.5,
    previousSeats: 0,
    color: PARTY_COLORS["24"],
  },
];

//Other parties configuration
const OTHER_PARTY = {
  label: "Other",
  previousVote: 3.6,
  previousSeats: 0,
  color: "#454545",
};

//Sets the order for the parties on the seat chart
const SEAT_CHART_ORDER = [
  "Māori",
  "Green",
  "Labour",
  "Opportunity",
  "Other",
  "NZ First",
  "National",
  "ACT",
];

//Sorts party vote chart by dercreasing vote share but keeps Others always at the end
function sortByValueWithPinnedLast(data, pinnedLabel) {
  const sortedItems = [...data]
    .filter((item) => item.label !== pinnedLabel)
    .sort((a, b) => b.value - a.value);

  const pinnedItem = data.find((item) => item.label === pinnedLabel);

  return pinnedItem ? [...sortedItems, pinnedItem] : sortedItems;
}

//Safely converts value to a vote share number
function toNumber(value) {
  return Number.parseFloat(value ?? 0) || 0;
}

//Safely converts value to a seat count number
function toSeatNumber(value) {
  return Number.parseInt(value ?? 0, 10) || 0;
}

//Rounds a number to one decimal place
function roundToOneDecimal(value) {
  return Number(value.toFixed(1));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
}

//Builds a lookup map of results by party code
function buildResultsLookup(rows) {
  return new Map(rows.map((row) => [row.p_no, row]));
}

function fallbackSeatColor(partyCode) {
  return "#c2a27c";
}

function formatRefreshTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatVoteUpdateTime(timestamp) {
  if (!timestamp) {
    return "No vote updates recorded yet";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function findLastNewVotesTimestamp(history) {
  const snapshots = history?.snapshots ?? [];

  for (let index = snapshots.length - 1; index > 0; index -= 1) {
    if (snapshots[index].totalVotesCast !== snapshots[index - 1].totalVotesCast) {
      return snapshots[index].timestamp;
    }
  }

  return snapshots[0]?.timestamp ?? null;
}

function isMaoriElectorateNumber(electorateNumber) {
  return MAORI_ELECTORATE_NUMBERS.has(String(electorateNumber ?? ""));
}

function normalizeElectorateName(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseElectorateRegionsCsv(csvText) {
  if (!csvText) {
    return new Map();
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.slice(1);
  const lookup = new Map();

  for (const row of rows) {
    const [electorateName, regionName] = parseCsvLine(row);

    if (!electorateName || !regionName) {
      continue;
    }

    lookup.set(normalizeElectorateName(electorateName), regionName);
  }

  return lookup;
}

function createAggregatedPartyVoteGroup(regionName) {
  return {
    regionName,
    totalVotes: 0,
    previousTotalVotes: 0,
    totalVotingPlacesCounted: 0,
    inferredTotalVotingPlaces: 0,
    trackedVotes: new Map(PARTY_CONFIG.map((party) => [party.code, 0])),
    trackedPreviousVotes: new Map(PARTY_CONFIG.map((party) => [party.code, 0])),
  };
}

function accumulateElectorateIntoPartyVoteGroup(group, electorate) {
  const electorateTotalVotes =
    toNumber(electorate?.total_valid_party_votes)
    || (electorate.party_vote_results ?? []).reduce(
      (sum, party) => sum + toNumber(party?.votes),
      0,
    );

  group.totalVotes += electorateTotalVotes;
  group.previousTotalVotes += toNumber(
    electorate?.previous_total_valid_party_votes,
  );

  const totalVotingPlacesCounted = toNumber(
    electorate?.total_voting_places_counted,
  );
  const percentVotingPlacesCounted = toNumber(
    electorate?.percent_voting_places_counted,
  );

  if (totalVotingPlacesCounted > 0) {
    group.totalVotingPlacesCounted += totalVotingPlacesCounted;
  }

  if (totalVotingPlacesCounted > 0 && percentVotingPlacesCounted > 0) {
    group.inferredTotalVotingPlaces +=
      totalVotingPlacesCounted / (percentVotingPlacesCounted / 100);
  }

  for (const party of electorate.party_vote_results ?? []) {
    const partyCode = party?.party_code;

    if (!group.trackedVotes.has(partyCode)) {
      continue;
    }

    group.trackedVotes.set(
      partyCode,
      group.trackedVotes.get(partyCode) + toNumber(party?.votes),
    );
    group.trackedPreviousVotes.set(
      partyCode,
      group.trackedPreviousVotes.get(partyCode) + toNumber(party?.previous_votes),
    );
  }
}

function finalizeAggregatedPartyVoteGroup(group) {
  const trackedParties = PARTY_CONFIG.map((party) => {
    const votes = group.trackedVotes.get(party.code) ?? 0;
    const previousVotes = group.trackedPreviousVotes.get(party.code) ?? 0;
    const value = group.totalVotes > 0 ? (votes / group.totalVotes) * 100 : 0;
    const previousValue = group.previousTotalVotes > 0
      ? (previousVotes / group.previousTotalVotes) * 100
      : 0;

    return {
      label: party.label,
      value: roundToOneDecimal(value),
      change: roundToOneDecimal(value - previousValue),
      color: party.color,
    };
  });

  const trackedVoteTotal = [...group.trackedVotes.values()].reduce(
    (sum, votes) => sum + votes,
    0,
  );
  const otherVotes = Math.max(group.totalVotes - trackedVoteTotal, 0);
  const trackedPreviousVoteTotal = [...group.trackedPreviousVotes.values()].reduce(
    (sum, votes) => sum + votes,
    0,
  );
  const otherPreviousVotes = Math.max(
    group.previousTotalVotes - trackedPreviousVoteTotal,
    0,
  );
  const otherValue = group.totalVotes > 0
    ? (otherVotes / group.totalVotes) * 100
    : 0;
  const otherPreviousValue = group.previousTotalVotes > 0
    ? (otherPreviousVotes / group.previousTotalVotes) * 100
    : 0;

  const parties = sortByValueWithPinnedLast([...trackedParties, {
    label: OTHER_PARTY.label,
    value: roundToOneDecimal(otherValue),
    change: roundToOneDecimal(otherValue - otherPreviousValue),
    color: OTHER_PARTY.color,
  }], "Other");

  const leadingValue = parties[0]?.value ?? 0;
  const percentCounted = group.inferredTotalVotingPlaces > 0
    ? (group.totalVotingPlacesCounted / group.inferredTotalVotingPlaces) * 100
    : 0;

  return {
    regionName: formatRegionCardName(group.regionName),
    percentCounted: roundToOneDecimal(percentCounted),
    parties: parties.map((party) => ({
      ...party,
      scaledValue: leadingValue > 0
        ? (party.value / leadingValue) * 100
        : 0,
    })),
  };
}

function buildRegionalPartyVoteData(electorateDetails, electorateRegionsCsv) {
  if (!electorateDetails || !electorateRegionsCsv) {
    return [];
  }

  const regionLookup = parseElectorateRegionsCsv(electorateRegionsCsv);
  const byElectorateNumber = electorateDetails.by_electorate_number ?? {};
  const regions = new Map();
  const maoriElectoratesGroup = createAggregatedPartyVoteGroup("Māori electorates");

  for (const [electorateNumber, electorate] of Object.entries(byElectorateNumber)) {
    if (isMaoriElectorateNumber(electorateNumber)) {
      accumulateElectorateIntoPartyVoteGroup(maoriElectoratesGroup, electorate);
      continue;
    }

    const regionName = regionLookup.get(
      normalizeElectorateName(electorate?.electorate_name),
    );

    if (!regionName) {
      continue;
    }

    const existingRegion =
      regions.get(regionName) ?? createAggregatedPartyVoteGroup(regionName);

    accumulateElectorateIntoPartyVoteGroup(existingRegion, electorate);

    regions.set(regionName, existingRegion);
  }

  const regionCards = [...regions.values()]
    .map(finalizeAggregatedPartyVoteGroup)
    .sort((left, right) => {
      const leftIndex = REGION_POPULATION_ORDER.indexOf(left.regionName);
      const rightIndex = REGION_POPULATION_ORDER.indexOf(right.regionName);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }

        if (rightIndex === -1) {
          return -1;
        }

        return leftIndex - rightIndex;
      }

      return left.regionName.localeCompare(right.regionName);
    });

  return maoriElectoratesGroup.totalVotes > 0
    ? [finalizeAggregatedPartyVoteGroup(maoriElectoratesGroup), ...regionCards]
    : regionCards;
}

function filterElectorateDataByGroup(data, electorateGroup) {
  if (!data) {
    return null;
  }

  const isMaoriGroup = electorateGroup === MAORI_ELECTORATES;
  const filteredByElectorateNumber = Object.fromEntries(
    Object.entries(data.by_electorate_number ?? {}).filter(([electorateNumber]) =>
      isMaoriGroup
        ? isMaoriElectorateNumber(electorateNumber)
        : !isMaoriElectorateNumber(electorateNumber),
    ),
  );

  const filteredBySvgId = Object.fromEntries(
    Object.entries(data.by_svg_id ?? {}).filter(([, entry]) =>
      isMaoriGroup
        ? isMaoriElectorateNumber(entry?.electorate_number)
        : !isMaoriElectorateNumber(entry?.electorate_number),
    ),
  );

  return {
    ...data,
    by_electorate_number: filteredByElectorateNumber,
    by_svg_id: filteredBySvgId,
  };
}

//Builds the party vote data for the chart
function buildPartyVoteData(rows) {
  const lookup = buildResultsLookup(rows);
  const trackedPartyCodes = new Set(PARTY_CONFIG.map((party) => party.code));

  //This gets the vote share and names of the parties we want to track
  const trackedParties = PARTY_CONFIG.map((party) => {
    const row = lookup.get(party.code);
    const value = toNumber(row?.percent_votes);

    return {
      label: party.label,
      value,
      change: value - party.previousVote,
      color: party.color,
    };
  });

  const seatWinningExtraParties = rows
    .filter((row) => !trackedPartyCodes.has(row.p_no))
    .map((row) => {
      const value = toNumber(row.percent_votes);

      return {
        label: formatMainChartPartyLabel(row.short_name, row.party_name),
        partyCode: row.p_no,
        value,
        change: roundToOneDecimal(value),
        color: PARTY_COLORS[row.p_no] ?? fallbackSeatColor(row.p_no),
        totalSeats: toSeatNumber(row.total_seats),
      };
    })
    .filter((party) => party.totalSeats > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  //This calculates the vote share for Others
  const totalVoteShare = rows.reduce((sum, row) => sum + toNumber(row.percent_votes), 0);
  const includedVoteShare = [...trackedParties, ...seatWinningExtraParties].reduce(
    (sum, party) => sum + party.value,
    0,
  );
  const otherVoteShare = Math.max(totalVoteShare - includedVoteShare, 0);

  const otherParty = {
    label: OTHER_PARTY.label,
    value: roundToOneDecimal(otherVoteShare),
    change: roundToOneDecimal(otherVoteShare - OTHER_PARTY.previousVote),
    color: OTHER_PARTY.color,
  };

  return sortByValueWithPinnedLast(
    [...trackedParties, ...seatWinningExtraParties, otherParty],
    "Other",
  );
}

function buildAllPartyVoteData(rows) {
  const previousVoteLookup = new Map(
    PARTY_CONFIG.map((party) => [party.code, party.previousVote]),
  );
  const trackedLabelLookup = new Map(
    PARTY_CONFIG.map((party) => [party.code, party.label]),
  );

  return [...rows]
    .map((row) => {
      const value = toNumber(row.percent_votes);
      const previousVote = previousVoteLookup.get(row.p_no) ?? 0;

      return {
        label:
          trackedLabelLookup.get(row.p_no)
          ?? formatPartyDisplayLabel(row.short_name, row.party_name),
        partyCode: row.p_no,
        votes: toSeatNumber(row.votes),
        value,
        change: roundToOneDecimal(value - previousVote),
        color: PARTY_COLORS[row.p_no] ?? fallbackSeatColor(row.p_no),
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

//Builds the seat count data for the chart
function buildSeatData(rows) {
  const lookup = buildResultsLookup(rows);
  const trackedPartyCodes = new Set(PARTY_CONFIG.map((party) => party.code));
  const seatLookup = new Map(
    PARTY_CONFIG.map((party) => {
      const row = lookup.get(party.code);
      const value = toSeatNumber(row?.total_seats);

      return [
        party.label,
        {
          label: party.label,
          value,
          change: value - party.previousSeats,
          color: party.color,
        },
      ];
    }),
  );

  const extraSeatWinners = rows
    .filter((row) => !trackedPartyCodes.has(row.p_no))
    .map((row) => ({
      partyCode: row.p_no,
      label: formatPartyDisplayLabel(row.short_name, row.party_name),
      value: toSeatNumber(row.total_seats),
      change: toSeatNumber(row.total_seats),
      color: PARTY_COLORS[row.p_no] ?? fallbackSeatColor(row.p_no),
    }))
    .filter((party) => party.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return SEAT_CHART_ORDER.flatMap((label) => {
    if (label === "Other") {
      return extraSeatWinners;
    }

    const trackedParty = seatLookup.get(label);
    return trackedParty ? [trackedParty] : [];
  });
}

export default function App() {
  const isMobile = useIsMobile();
  const {
    results,
    voteCount,
    partyVoteSnapshots,
    electorateDetails,
    electorateWinners,
    electorateRegionsCsv,
    regionMapMarkup,
    nzMapMarkup,
    nzHexMapMarkup,
    maoriMapMarkup,
    maoriHexMapMarkup,
    isLoading,
    error,
    lastSuccessfulAt,
    refreshIntervalMs,
  } = useDashboardData();
  const [electorateGroup, setElectorateGroup] = useState(GENERAL_ELECTORATES);
  const [selectedElectorates, setSelectedElectorates] = useState({
    [GENERAL_ELECTORATES]: null,
    [MAORI_ELECTORATES]: null,
  });
  const [partyVoteMode, setPartyVoteMode] = useState("share");
  const [showAllParties, setShowAllParties] = useState(false);
  const [mapViewMode, setMapViewMode] = useState("cartographic");
  const savedMapViewsRef = useRef({
    [GENERAL_ELECTORATES]: {
      cartographic: null,
      hex: null,
    },
    [MAORI_ELECTORATES]: {
      cartographic: null,
      hex: null,
    },
  });
  const filteredElectorateDetails = filterElectorateDataByGroup(
    electorateDetails,
    electorateGroup,
  );
  const filteredElectorateWinners = filterElectorateDataByGroup(
    electorateWinners,
    electorateGroup,
  );
  const activeCartographicMapMarkup =
    electorateGroup === MAORI_ELECTORATES ? maoriMapMarkup : nzMapMarkup;
  const activeHexMapMarkup =
    electorateGroup === MAORI_ELECTORATES ? maoriHexMapMarkup : nzHexMapMarkup;
  const electorateLookup = filteredElectorateDetails?.by_electorate_number ?? {};
  const selectedElectorateNumber = selectedElectorates[electorateGroup];
  const selectedElectorate = selectedElectorateNumber
    ? electorateLookup[selectedElectorateNumber] ?? null
    : null;
  const partyVoteData = buildPartyVoteData(results ?? []);
  const allPartyVoteData = buildAllPartyVoteData(results ?? []);
  const seatData = buildSeatData(results ?? []);
  const regionalPartyVoteData = buildRegionalPartyVoteData(
    electorateDetails,
    electorateRegionsCsv,
  );
  const totalVotesCounted = toSeatNumber(voteCount?.total_votes_cast);
  const votesCountedData = voteCount
      ? [
        {
          label: voteCount.label,
          value: toNumber(voteCount.value),
          color: "#EAD349",
        },
      ]
    : [];

  useEffect(() => {
    if (isMobile || !filteredElectorateDetails) {
      return;
    }

    if (selectedElectorateNumber && electorateLookup[selectedElectorateNumber]) {
      return;
    }

    const fallbackElectorateNumber = Object.keys(electorateLookup)[0] ?? null;

    if (!fallbackElectorateNumber) {
      return;
    }

    setSelectedElectorates((currentSelections) => ({
      ...currentSelections,
      [electorateGroup]: fallbackElectorateNumber,
    }));
  }, [
    electorateGroup,
    electorateLookup,
    filteredElectorateDetails,
    isMobile,
    selectedElectorateNumber,
  ]);

  function handleSelectElectorate(electorateNumber) {
    setSelectedElectorates((currentSelections) => ({
      ...currentSelections,
      [electorateGroup]: electorateNumber,
    }));
  }

  function handleCloseMobileElectorate() {
    setSelectedElectorates((currentSelections) => ({
      ...currentSelections,
      [electorateGroup]: null,
    }));
  }

  function handleMapViewSnapshot(nextView) {
    savedMapViewsRef.current[electorateGroup][mapViewMode] = nextView;
  }

  function handleMapViewModeChange(nextViewMode) {
    if (nextViewMode === mapViewMode) {
      return;
    }

    setMapViewMode(nextViewMode);
  }

  function handleElectorateGroupChange(nextElectorateGroup) {
    if (nextElectorateGroup === electorateGroup) {
      return;
    }

    setElectorateGroup(nextElectorateGroup);
  }

  const liveStatusMessage = error
    ? `Showing latest results as of ${formatRefreshTime(lastSuccessfulAt)}`
    : `Live updating every ${Math.round(refreshIntervalMs / 1000)} seconds`;
  const lastNewVotesTimestamp = findLastNewVotesTimestamp(partyVoteSnapshots);

  if (isLoading && !results) {
    return (
      <main className="dashboard-shell">
        <section className="chart-panel chart-panel--full">
          <h2>Loading latest results…</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="chart-panel chart-panel--full">
        <div className="dashboard-live-status-group" role="status" aria-live="polite">
          <div className={`dashboard-live-status${error ? " is-stale" : " is-live"}`}>
            <span className="dashboard-live-status__dot" aria-hidden="true" />
            <span>{liveStatusMessage}</span>
          </div>
          <p className="dashboard-live-status__update-time">
            Last new votes reported: {formatVoteUpdateTime(lastNewVotesTimestamp)}
          </p>
        </div>
      </section>

      <section className="chart-panel chart-panel--full">
        <div className="chart-header">
          <h2>Votes counted</h2>
          {totalVotesCounted > 0 && (
            <p className="chart-header__meta">
              {formatNumber(totalVotesCounted)} votes
            </p>
          )}
        </div>
        {votesCountedData.length > 0 && (
          <VoteCountBar
            data={votesCountedData}
            barHeight={15}
            valueFontSize={14}
          />
        )}
      </section>

      <section className="chart-panel">
        <div className="chart-header">
          <h2>Party vote</h2>
          <div className="chart-toggle" role="tablist" aria-label="Party vote chart mode">
            <button
              type="button"
              className={`chart-toggle__button${partyVoteMode === "share" ? " is-active" : ""}`}
              onClick={() => setPartyVoteMode("share")}
            >
              Vote share
            </button>
            <button
              type="button"
              className={`chart-toggle__button${partyVoteMode === "change" ? " is-active" : ""}`}
              onClick={() => setPartyVoteMode("change")}
            >
              Change
            </button>
          </div>
        </div>
        {showAllParties ? (
          <>
            {allPartyVoteData.length > 0 && (
              <HorizontalPartyVoteChart
                data={allPartyVoteData}
                mode={partyVoteMode}
                maxHeight={560}
              />
            )}
            <button
              type="button"
              className="chart-expand-button"
              onClick={() => setShowAllParties(false)}
            >
              Show main parties
            </button>
          </>
        ) : (
          <>
            {partyVoteData.length > 0 && (
              <VerticalBarChart
                data={partyVoteData}
                height={560}
                mode={partyVoteMode}
              />
            )}
            <button
              type="button"
              className="chart-expand-button"
              onClick={() => setShowAllParties(true)}
            >
              Show all parties
            </button>
          </>
        )}
      </section>

      <section className="chart-panel">
        <h2>Seat count</h2>
        {seatData.length > 0 && <SemiDonutChart data={seatData} />}
      </section>

      <section className="chart-panel chart-panel--full">
        <div className="chart-header">
          <h2>Electorates</h2>
          <div className="chart-toggle" role="tablist" aria-label="Electorate map type">
            <button
              type="button"
              className={`chart-toggle__button${electorateGroup === GENERAL_ELECTORATES ? " is-active" : ""}`}
              onClick={() => handleElectorateGroupChange(GENERAL_ELECTORATES)}
            >
              General Electorates
            </button>
            <button
              type="button"
              className={`chart-toggle__button${electorateGroup === MAORI_ELECTORATES ? " is-active" : ""}`}
              onClick={() => handleElectorateGroupChange(MAORI_ELECTORATES)}
            >
              Māori Electorates
            </button>
          </div>
        </div>
        <div className="map-explorer">
          {isMobile ? (
            <div className="map-explorer__mobile">
              <InteractiveMap
                electorateWinners={filteredElectorateWinners}
                electorateDetails={filteredElectorateDetails}
                cartographicMapMarkup={activeCartographicMapMarkup}
                hexMapMarkup={activeHexMapMarkup}
                electorateGroup={electorateGroup}
                selectedElectorateNumber={selectedElectorateNumber}
                onSelectElectorate={handleSelectElectorate}
                viewMode={mapViewMode}
                onViewModeChange={handleMapViewModeChange}
                savedView={savedMapViewsRef.current[electorateGroup][mapViewMode]}
                onViewSnapshot={handleMapViewSnapshot}
              />
              {selectedElectorate && filteredElectorateDetails && (
                <div className="map-explorer__mobile-overlay">
                  <ElectorateDetailPanel
                    electorate={selectedElectorate}
                    onClose={handleCloseMobileElectorate}
                    showCloseButton
                    closeLabel="Back to map"
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <InteractiveMap
                electorateWinners={filteredElectorateWinners}
                electorateDetails={filteredElectorateDetails}
                cartographicMapMarkup={activeCartographicMapMarkup}
                hexMapMarkup={activeHexMapMarkup}
                electorateGroup={electorateGroup}
                selectedElectorateNumber={selectedElectorateNumber}
                onSelectElectorate={handleSelectElectorate}
                viewMode={mapViewMode}
                onViewModeChange={handleMapViewModeChange}
                savedView={savedMapViewsRef.current[electorateGroup][mapViewMode]}
                onViewSnapshot={handleMapViewSnapshot}
              />
              <ElectorateDetailPanel electorate={selectedElectorate} />
            </>
          )}
        </div>
        <RegionVoteCarousel
          regions={regionalPartyVoteData}
          regionMapMarkup={regionMapMarkup}
        />
      </section>

      <section className="chart-panel chart-panel--full">
        <VoteProgressionChart history={partyVoteSnapshots} />
      </section>

      <section className="chart-panel chart-panel--full">
        <PartyHistoryChart results={results} turnout={voteCount} />
      </section>
    </main>
  );
}
