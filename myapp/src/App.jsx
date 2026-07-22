import { useState } from "react";
import VerticalBarChart from "./components/VerticalBarChart";
import SemiDonutChart from "./components/SemiDonutChart";
import VoteCountBar from "./components/VoteCountBar";
import InteractiveMap from "./components/InteractiveMap";
import ElectorateDetailPanel from "./components/ElectorateDetailPanel";
import results from "../../results.json";
import voteCount from "../../vote_count.json";
import electorateDetails from "../../electorate_details.json";

// Parties to be included in the charts
const PARTY_CONFIG = [
  {
    label: "National",
    code: "16",
    previousVote: 25.6,
    previousSeats: 33,
    color: "#3399FF",
  },
  {
    label: "Labour",
    code: "13",
    previousVote: 50.0,
    previousSeats: 65,
    color: "#FF0000",
  },
  {
    label: "Green",
    code: "10",
    previousVote: 7.9,
    previousSeats: 10,
    color: "#009900",
  },
  {
    label: "ACT",
    code: "5",
    previousVote: 7.6,
    previousSeats: 10,
    color: "#D3B641",
  },
  {
    label: "NZ First",
    code: "17",
    previousVote: 2.6,
    previousSeats: 0,
    color: "#999999",
  },
  {
    label: "Māori",
    code: "14",
    previousVote: 1.2,
    previousSeats: 2,
    color: "#AA00D4",
  },
  {
    label: "Opportunity",
    code: "24",
    previousVote: 1.5,
    previousSeats: 0,
    color: "#F0E68C",
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

//Builds a lookup map of results by party code
function buildResultsLookup(rows) {
  return new Map(rows.map((row) => [row.p_no, row]));
}

//Builds the party vote data for the chart
function buildPartyVoteData(rows) {
  const lookup = buildResultsLookup(rows);

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

  //This calculates the vote share for Others
  const totalVoteShare = rows.reduce((sum, row) => sum + toNumber(row.percent_votes), 0);
  const trackedVoteShare = trackedParties.reduce((sum, party) => sum + party.value, 0);
  const otherVoteShare = Math.max(totalVoteShare - trackedVoteShare, 0);

  const otherParty = {
    label: OTHER_PARTY.label,
    value: roundToOneDecimal(otherVoteShare),
    change: roundToOneDecimal(otherVoteShare - OTHER_PARTY.previousVote),
    color: OTHER_PARTY.color,
  };

  return sortByValueWithPinnedLast([...trackedParties, otherParty], "Other");
}

//Builds the seat count data for the chart
function buildSeatData(rows) {
  const lookup = buildResultsLookup(rows);
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

  return SEAT_CHART_ORDER.map((label) => seatLookup.get(label)).filter(Boolean);
}

/* This funciton is probably not necessary but keeping it as a comment for now 

function getDefaultElectorateNumber() {
  const details = electorateDetails.by_electorate_number ?? {};
  const exactMapMatch = Object.values(details).find(
    (electorate) => electorate.match_method === "exact",
  );

  return exactMapMatch?.electorate_number ?? "1";
}
  */

//Preparing chart data
const partyVoteData = buildPartyVoteData(results);
const seatData = buildSeatData(results);
const votesCountedData = [
  {
    label: voteCount.label,
    value: toNumber(voteCount.value),
    color: "#EAD349",
  },
];

export default function App() {
  const [selectedElectorateNumber, setSelectedElectorateNumber] = useState("1");
  const selectedElectorate =
    electorateDetails.by_electorate_number?.[selectedElectorateNumber] ?? null;

  return (
    <main className="dashboard-shell">
      <section className="chart-panel chart-panel--full">
        <h2>Percentage of votes counted</h2>
        <VoteCountBar
          data={votesCountedData}
          barHeight={28}
          labelWidth={250}
          labelFontSize={18}
          valueFontSize={18}
        />
      </section>

      <section className="chart-panel">
        <h1>Party vote</h1>
        <VerticalBarChart data={partyVoteData} height={560} />
      </section>

      <section className="chart-panel">
        <h1>Seat count</h1>
        <SemiDonutChart data={seatData} height={650} />
      </section>

      <section className="chart-panel chart-panel--full">
        <h1>Map</h1>
        <div className="map-explorer">
          <InteractiveMap
            selectedElectorateNumber={selectedElectorateNumber}
            onSelectElectorate={setSelectedElectorateNumber}
          />
          <ElectorateDetailPanel electorate={selectedElectorate} />
        </div>
      </section>
    </main>
  );
}
