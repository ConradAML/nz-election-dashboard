import { useEffect, useMemo, useRef, useState } from "react";
import {
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";
import { formatPartyDisplayLabel } from "../utils/partyDisplay";

const TRANSITION_DURATION_MS = 320;

function formatNumber(value) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
}

function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function formatChange(value) {
  const numericValue = Number(value);
  return `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(1)}pp`;
}

function changeColor(value) {
  if (value > 0) return "#15803d";
  if (value < 0) return "#c62828";
  return "#666666";
}

function easeInOutCubic(progress) {
  if (progress < 0.5) return 4 * progress * progress * progress;
  return 1 - ((-2 * progress + 2) ** 3) / 2;
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
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
  return formatPartyDisplayLabel(shortName, fullName || "Leading");
}

function VoteRows({ rows, getKey, getLabel, getPartyLabel, mode }) {
  const [transitionState, setTransitionState] = useState({
    from: mode,
    to: mode,
    progress: 1,
  });
  const frameRef = useRef(null);
  const previousModeRef = useRef(mode);
  const maxVotes = useMemo(
    () => Math.max(...rows.map((row) => row.votes), 0),
    [rows],
  );

  useEffect(() => {
    if (previousModeRef.current === mode) return undefined;

    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);

    const fromMode = previousModeRef.current;
    const startedAt = performance.now();
    previousModeRef.current = mode;
    setTransitionState({ from: fromMode, to: mode, progress: 0 });

    function step(now) {
      const progress = Math.min((now - startedAt) / TRANSITION_DURATION_MS, 1);

      if (progress >= 1) {
        setTransitionState({ from: mode, to: mode, progress: 1 });
        frameRef.current = null;
        return;
      }

      setTransitionState({ from: fromMode, to: mode, progress });
      frameRef.current = window.requestAnimationFrame(step);
    }

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [mode]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const isTransitioning =
    transitionState.from !== transitionState.to && transitionState.progress < 1;
  const easedProgress = easeInOutCubic(transitionState.progress);
  const changeBlend = isTransitioning
    ? transitionState.to === "change"
      ? easedProgress
      : 1 - easedProgress
    : mode === "change"
      ? 1
      : 0;
  const showingChange = changeBlend > 0.5;
  const maxAbsChange = useMemo(
    () => Math.max(...rows.map((row) => Math.abs(row.change ?? 0)), 1),
    [rows],
  );

  return (
    <div className="electorate-share-list">
      {rows.map((row) => (
        <div className="electorate-share-row" key={getKey(row)}>
          <div className="electorate-share-row__top">
            <span className="electorate-share-row__name">{getLabel(row)}</span>
            {showingChange ? (
              <span
                className="electorate-share-row__share"
                style={{ color: changeColor(row.change) }}
              >
                {Number.isFinite(row.change) ? formatChange(row.change) : "—"}
              </span>
            ) : (
              <span className="electorate-share-row__share-group">
                <span className="electorate-share-row__share">
                  {row.vote_share.toFixed(1)}%
                </span>
                {Number.isFinite(row.change) && (
                  <span
                    className="electorate-share-row__change"
                    style={{ color: changeColor(row.change) }}
                  >
                    {formatChange(row.change)}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className={`electorate-share-row__bar${showingChange ? " is-change" : ""}`}>
            <div
              className="electorate-share-row__zero-line"
              style={{ opacity: changeBlend }}
            />
            <div
              className="electorate-share-row__fill"
              style={{
                left: `${lerp(
                  0,
                  row.change >= 0
                    ? 50
                    : 50 - (Math.abs(row.change ?? 0) / maxAbsChange) * 50,
                  changeBlend,
                )}%`,
                width: `${lerp(
                  maxVotes === 0 ? 0 : (row.votes / maxVotes) * 100,
                  Number.isFinite(row.change)
                    ? (Math.abs(row.change) / maxAbsChange) * 50
                    : 0,
                  changeBlend,
                )}%`,
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
  closeLabel = "Close",
}) {
  const [activeTab, setActiveTab] = useState("electorate");
  const [resultMode, setResultMode] = useState("share");

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
  const percentCounted = Number(electorate.percent_voting_places_counted ?? 0);
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
  const majorityRunnerUpCode = isElectorateTab
    ? runnerUpCandidate?.party_code
    : runnerUpPartyVote?.party_code;
  const majorityRunnerUpColor = partyColor(majorityRunnerUpCode);
  const majorityRunnerUpLabel = isElectorateTab
    ? formatPartyLabel(runnerUpCandidate?.party_short_name, runnerUpCandidate?.party_name)
    : formatPartyLabel(runnerUpPartyVote?.party_short_name, runnerUpPartyVote?.party_name);
  const majorityRunnerUpTextColor = textColorForBackground(majorityRunnerUpColor);

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
            {closeLabel}
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
            <span>Majority: {majorityPrimary} over</span>
            <span
              className="electorate-panel__majority-pill"
              style={{
                background: majorityRunnerUpColor,
                color: majorityRunnerUpTextColor,
              }}
            >
              {majorityRunnerUpLabel}
            </span>
          </p>
          <p className="electorate-panel__majority-subvalue">{majoritySecondary}</p>
        </div>
      )}

      <p className="electorate-panel__summary">
        Total valid votes: {formatNumber(totalVotes)}
      </p>
      <div
        className="electorate-panel__counted"
        aria-label={`${formatPercent(percentCounted)} of voting places counted`}
      >
        <div className="electorate-panel__counted-bar">
          <div
            className="electorate-panel__counted-fill"
            style={{ width: `${Math.max(0, Math.min(percentCounted, 100))}%` }}
          />
        </div>
        <p className="electorate-panel__counted-value">
          {formatPercent(percentCounted)} counted
        </p>
      </div>

      <div className="electorate-panel__section">
        <div className="electorate-panel__section-header">
          <h3>{heading}</h3>
          <div className="chart-toggle" role="tablist" aria-label={`${heading} chart mode`}>
            <button
              type="button"
              className={`chart-toggle__button${resultMode === "share" ? " is-active" : ""}`}
              onClick={() => setResultMode("share")}
            >
              Vote share
            </button>
            <button
              type="button"
              className={`chart-toggle__button${resultMode === "change" ? " is-active" : ""}`}
              onClick={() => setResultMode("change")}
            >
              Change
            </button>
          </div>
        </div>
        {isElectorateTab ? (
          <VoteRows
            rows={electorate.candidate_results}
            mode={resultMode}
            getKey={(row) => row.candidate_number}
            getLabel={(row) => row.candidate_name}
            getPartyLabel={(row) => formatPartyLabel(row.party_short_name, row.party_name)}
          />
        ) : (
          <VoteRows
            rows={electorate.party_vote_results}
            mode={resultMode}
            getKey={(row) => row.party_code}
            getLabel={(row) => formatPartyLabel(row.party_short_name, row.party_name)}
            getPartyLabel={() => ""}
          />
        )}
      </div>
    </aside>
  );
}
