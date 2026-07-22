import { useEffect, useMemo, useState } from "react";
import {
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";

function formatNumber(value) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
}

function partyColor(partyCode) {
  return PARTY_COLORS[partyCode] ?? NEUTRAL_PARTY_COLOR;
}

function VoteRows({ rows, getKey, getLabel, getPartyLabel }) {
  const maxVotes = useMemo(
    () => Math.max(...rows.map((row) => row.votes), 0),
    [rows],
  );

  return (
    <div className="electorate-share-list">
      {rows.map((row) => (
        <div className="electorate-share-row" key={getKey(row)}>
          <div className="electorate-share-row__top">
            <span className="electorate-share-row__name">{getLabel(row)}</span>
            <span className="electorate-share-row__share">
              {row.vote_share.toFixed(1)}%
            </span>
          </div>
          <div className="electorate-share-row__bar">
            <div
              className="electorate-share-row__fill"
              style={{
                width: `${maxVotes === 0 ? 0 : (row.votes / maxVotes) * 100}%`,
                background: partyColor(row.party_code),
              }}
            />
          </div>
          <div className="electorate-share-row__meta">
            <span className="electorate-share-row__party">{getPartyLabel(row)}</span>
            <span className="electorate-share-row__votes">
              {formatNumber(row.votes)} votes
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ElectorateDetailPanel({ electorate }) {
  const [activeTab, setActiveTab] = useState("electorate");

  useEffect(() => {
    setActiveTab("electorate");
  }, [electorate?.electorate_number]);

  if (!electorate) {
    return (
      <aside className="electorate-panel">
        <h2>Select an electorate</h2>
        <p>Click a coloured electorate on the map to see the vote breakdown.</p>
      </aside>
    );
  }

  const isElectorateTab = activeTab === "electorate";
  const heading = isElectorateTab ? "Electorate vote" : "Party vote";
  const summary = isElectorateTab
    ? `Winner: ${electorate.winner_party_short_name || electorate.winner_party_name}`
    : `Leading party: ${electorate.leading_party_vote_short_name || electorate.leading_party_vote_name}`;
  const totalVotes = isElectorateTab
    ? electorate.total_valid_candidate_votes
    : electorate.total_valid_party_votes;

  return (
    <aside className="electorate-panel">
      <h2>{electorate.electorate_name}</h2>
      <div className="electorate-panel__tabs">
        <button
          type="button"
          className={`electorate-panel__tab${isElectorateTab ? " is-active" : ""}`}
          onClick={() => setActiveTab("electorate")}
        >
          Electorate vote
        </button>
        <button
          type="button"
          className={`electorate-panel__tab${!isElectorateTab ? " is-active" : ""}`}
          onClick={() => setActiveTab("party")}
        >
          Party vote
        </button>
      </div>

      <p className="electorate-panel__summary">{summary}</p>
      <p className="electorate-panel__summary">
        Total valid votes: {formatNumber(totalVotes)}
      </p>

      <div className="electorate-panel__section">
        <h3>{heading}</h3>
        {isElectorateTab ? (
          <VoteRows
            rows={electorate.candidate_results}
            getKey={(row) => row.candidate_number}
            getLabel={(row) => row.candidate_name}
            getPartyLabel={(row) => row.party_short_name || row.party_name}
          />
        ) : (
          <VoteRows
            rows={electorate.party_vote_results}
            getKey={(row) => row.party_code}
            getLabel={(row) => row.party_short_name || row.party_name}
            getPartyLabel={() => ""}
          />
        )}
      </div>
    </aside>
  );
}
