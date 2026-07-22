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

function textColorForBackground(hexColor) {
  const color = hexColor.replace("#", "");

  if (color.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  const brightness = red * 0.299 + green * 0.587 + blue * 0.114;

  return brightness > 170 ? "#1f1f1f" : "#ffffff";
}

function lightenColor(hexColor, amount = 0.78) {
  const color = hexColor.replace("#", "");

  if (color.length !== 6) {
    return hexColor;
  }

  const toChannel = (start) => Number.parseInt(color.slice(start, start + 2), 16);
  const mixWithWhite = (value) =>
    Math.round(value + (255 - value) * amount)
      .toString(16)
      .padStart(2, "0");

  const red = mixWithWhite(toChannel(0));
  const green = mixWithWhite(toChannel(2));
  const blue = mixWithWhite(toChannel(4));

  return `#${red}${green}${blue}`;
}

function formatPartyLabel(shortName, fullName) {
  const sourceLabel = shortName || fullName || "Leading";

  if (sourceLabel === "The Opportunities Party") {
    return "Opportunity";
  }

  return sourceLabel
    .replace(/\s+Party$/i, "")
    .replace(/\s+Movement$/i, "")
    .trim();
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

export default function ElectorateDetailPanel({
  electorate,
  onClose,
  showCloseButton = false,
}) {
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
  const totalVotes = isElectorateTab
    ? electorate.total_valid_candidate_votes
    : electorate.total_valid_party_votes;
  const electorateWinnerColor = partyColor(electorate.winner_party_code);
  const electorateWinnerTextColor = textColorForBackground(electorateWinnerColor);
  const leadingCandidate = electorate.candidate_results?.[0] ?? null;
  const runnerUpCandidate = electorate.candidate_results?.[1] ?? null;
  const leadingPartyVote = electorate.party_vote_results?.[0] ?? null;
  const runnerUpPartyVote = electorate.party_vote_results?.[1] ?? null;
  const electorateMajorityVotes = Math.max(
    (leadingCandidate?.votes ?? 0) - (runnerUpCandidate?.votes ?? 0),
    0,
  );
  const electorateMajorityShare = Math.max(
    (leadingCandidate?.vote_share ?? 0) - (runnerUpCandidate?.vote_share ?? 0),
    0,
  );
  const partyVoteMajorityVotes = Math.max(
    (leadingPartyVote?.votes ?? 0) - (runnerUpPartyVote?.votes ?? 0),
    0,
  );
  const partyVoteMajorityShare = Math.max(
    (leadingPartyVote?.vote_share ?? 0) - (runnerUpPartyVote?.vote_share ?? 0),
    0,
  );
  const majorityPrimary = isElectorateTab
    ? formatNumber(electorateMajorityVotes)
    : `${partyVoteMajorityShare.toFixed(1)}pp`;
  const majoritySecondary = isElectorateTab
    ? `${electorateMajorityShare.toFixed(1)}pp`
    : `${formatNumber(partyVoteMajorityVotes)} votes`;
  const hasMajorityData = isElectorateTab
    ? Boolean(leadingCandidate && runnerUpCandidate)
    : Boolean(leadingPartyVote && runnerUpPartyVote);
  const majorityLeaderCode = isElectorateTab
    ? leadingCandidate?.party_code
    : leadingPartyVote?.party_code;
  const majorityLeaderColor = partyColor(majorityLeaderCode);
  const majorityBackgroundColor = lightenColor(majorityLeaderColor);
  const majorityLeaderLabel = isElectorateTab
    ? formatPartyLabel(leadingCandidate?.party_short_name, leadingCandidate?.party_name)
    : formatPartyLabel(leadingPartyVote?.party_short_name, leadingPartyVote?.party_name);
  const majorityLeaderTextColor = textColorForBackground(majorityLeaderColor);

  return (
    <aside className="electorate-panel">
      {showCloseButton && (
        <div className="electorate-panel__close-row">
          <button
            type="button"
            className="electorate-panel__close-button"
            aria-label="Close electorate details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      )}
      <h2
        className="electorate-panel__name-pill"
        style={{
          background: electorateWinnerColor,
          color: electorateWinnerTextColor,
        }}
      >
        {electorate.electorate_name}
      </h2>
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

      {hasMajorityData && (
        <div
          className="electorate-panel__majority"
          style={{
            background: majorityBackgroundColor,
            borderColor: majorityLeaderColor,
          }}
        >
          <p className="electorate-panel__majority-label">
            <span
              className="electorate-panel__majority-pill"
              style={{
                background: majorityLeaderColor,
                color: majorityLeaderTextColor,
              }}
            >
              {majorityLeaderLabel}
            </span>
            <span>Majority: {majorityPrimary}</span>
          </p>
          <p className="electorate-panel__majority-subvalue">{majoritySecondary}</p>
        </div>
      )}

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
