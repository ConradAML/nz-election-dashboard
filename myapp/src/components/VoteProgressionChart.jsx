import { useState } from "react";
import { PARTY_HISTORY_TABS } from "../constants/partyHistory";

const WIDTH = 1000;
const HEIGHT = 420;
const MARGIN = { top: 24, right: 250, bottom: 56, left: 58 };
const PARTY_SERIES = [
  ...PARTY_HISTORY_TABS.filter((party) => party.partyCode),
  { partyCode: "other", label: "Other", color: "#454545" },
].map((party) => ({ ...party, id: party.partyCode, codes: [party.partyCode] }));
const COALITION_SERIES = [
  {
    id: "national-act-nzfirst",
    label: "National + ACT + NZ First",
    codes: ["16", "5", "17"],
    color: "#3399FF",
  },
  {
    id: "national-act-nzfirst-top",
    label: "National + ACT + NZ First + TOP",
    codes: ["16", "5", "17", "24"],
    color: "#3399FF",
    dashed: true,
  },
  {
    id: "labour-green-tpm",
    label: "Labour + Green + TPM",
    codes: ["13", "10", "14"],
    color: "#FF0000",
  },
  {
    id: "labour-green-tpm-top",
    label: "Labour + Green + TPM + TOP",
    codes: ["13", "10", "14", "24"],
    color: "#FF0000",
    dashed: true,
  },
];

function formatShare(value) {
  return `${value.toFixed(1)}%`;
}

function formatMetric(value, metricMode) {
  return metricMode === "share" ? formatShare(value) : `${value} seats`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(new Date(timestamp));
}

function sampleSnapshots(snapshots, maximumTicks = 5) {
  if (snapshots.length <= maximumTicks) {
    return snapshots;
  }

  return Array.from(
    new Set(
      Array.from({ length: maximumTicks }, (_, index) =>
        Math.round((index * (snapshots.length - 1)) / (maximumTicks - 1))),
    ),
  ).map((index) => snapshots[index]);
}

function positionEndLabels(labels, minimumY, maximumY, gap = 18) {
  const positioned = [];

  [...labels]
    .sort((left, right) => left.targetY - right.targetY)
    .forEach((label) => {
      const previousY = positioned.at(-1)?.y ?? minimumY - gap;
      positioned.push({
        ...label,
        y: Math.max(label.targetY, previousY + gap, minimumY),
      });
    });

  const overflow = Math.max((positioned.at(-1)?.y ?? maximumY) - maximumY, 0);

  return new Map(
    positioned.map((label) => [label.seriesId, label.y - overflow]),
  );
}

export default function VoteProgressionChart({ history }) {
  const [axisMode, setAxisMode] = useState("progress");
  const [metricMode, setMetricMode] = useState("share");
  const [seriesMode, setSeriesMode] = useState("parties");
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const snapshots = history?.snapshots ?? [];

  if (!snapshots.length) {
    return (
      <section className="vote-progression" aria-labelledby="vote-progression-title">
        <h2 id="vote-progression-title">Vote share as counting progresses</h2>
        <p className="dashboard-notice">No result snapshots have been collected yet.</p>
      </section>
    );
  }

  const activeSeries = seriesMode === "parties" ? PARTY_SERIES : COALITION_SERIES;
  const getValue = (snapshot, series) => {
    const values = series.codes.map((partyCode) => metricMode === "share"
      ? snapshot.parties?.[partyCode]?.voteShare
      : snapshot.projectedSeats?.[partyCode]);

    return values.every(Number.isFinite)
      ? values.reduce((sum, value) => sum + value, 0)
      : undefined;
  };
  const seriesValues = snapshots.flatMap((snapshot) =>
    activeSeries.map((series) => getValue(snapshot, series) ?? 0),
  );
  const maxValue = Math.max(10, Math.ceil(Math.max(...seriesValues, 0) / 10) * 10);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const timestamps = snapshots.map((snapshot) => new Date(snapshot.timestamp).getTime());
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const timeSpan = lastTimestamp - firstTimestamp;
  const xScale = (snapshot) => {
    if (axisMode === "progress") {
      return MARGIN.left + (snapshot.percentCounted / 100) * plotWidth;
    }

    if (timeSpan === 0) {
      return MARGIN.left + plotWidth / 2;
    }

    const timestamp = new Date(snapshot.timestamp).getTime();
    return MARGIN.left + ((timestamp - firstTimestamp) / timeSpan) * plotWidth;
  };
  const yScale = (value) => MARGIN.top + (1 - value / maxValue) * plotHeight;
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxValue / 4) * index);
  const xTicks = axisMode === "progress"
    ? [0, 25, 50, 75, 100]
    : sampleSnapshots(snapshots);
  const latestSnapshot = snapshots.at(-1);
  const endLabelPositions = positionEndLabels(
    activeSeries.map((series) => ({
      seriesId: series.id,
      targetY: yScale(getValue(latestSnapshot, series) ?? 0),
    })),
    MARGIN.top + 8,
    MARGIN.top + plotHeight - 4,
  );

  return (
    <section className="vote-progression" aria-labelledby="vote-progression-title">
      <div className="vote-progression__header">
        <div>
          <div className="vote-progression__title-row">
            <h2 id="vote-progression-title">
              {seriesMode === "coalitions"
                ? `Coalition ${metricMode === "share" ? "vote share" : "projected seats"}`
                : metricMode === "share"
                  ? "Vote share"
                  : "Projected seats"} as counting progresses
            </h2>
            {history?.synthetic === true && (
              <span className="vote-progression__synthetic-label" role="status">
                Currently showing synthetic data
              </span>
            )}
            <div className="chart-toggle" role="tablist" aria-label="Progression chart horizontal axis">
              <button
                type="button"
                role="tab"
                aria-selected={axisMode === "progress"}
                className={`chart-toggle__button${axisMode === "progress" ? " is-active" : ""}`}
                onClick={() => setAxisMode("progress")}
              >
                Votes counted
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={axisMode === "time"}
                className={`chart-toggle__button${axisMode === "time" ? " is-active" : ""}`}
                onClick={() => setAxisMode("time")}
              >
                Time
              </button>
            </div>
          </div>
          <p className="vote-progression__subtitle">
            Each point is a saved results update. All {seriesMode === "parties" ? "party groups" : "coalition options"} remain visible for direct comparison.
          </p>
        </div>
      </div>

      {snapshots.length === 1 && (
        <p className="vote-progression__collection-note">
          Snapshot collection has started. A line will form as new result updates are saved.
        </p>
      )}

      <div className="vote-progression__chart-wrap">
        <div className="vote-progression__metric-row">
          <div className="chart-toggle" role="tablist" aria-label="Progression chart metric">
            <button
              type="button"
              role="tab"
              aria-selected={metricMode === "share"}
              className={`chart-toggle__button${metricMode === "share" ? " is-active" : ""}`}
              onClick={() => {
                setMetricMode("share");
                setHoveredPoint(null);
              }}
            >
              Vote share
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={metricMode === "seats"}
              className={`chart-toggle__button${metricMode === "seats" ? " is-active" : ""}`}
              onClick={() => {
                setMetricMode("seats");
                setHoveredPoint(null);
              }}
            >
              Projected seats
            </button>
          </div>
          <div className="chart-toggle" role="tablist" aria-label="Progression chart series">
            <button
              type="button"
              role="tab"
              aria-selected={seriesMode === "parties"}
              className={`chart-toggle__button${seriesMode === "parties" ? " is-active" : ""}`}
              onClick={() => {
                setSeriesMode("parties");
                setHoveredPoint(null);
              }}
            >
              Parties
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={seriesMode === "coalitions"}
              className={`chart-toggle__button${seriesMode === "coalitions" ? " is-active" : ""}`}
              onClick={() => {
                setSeriesMode("coalitions");
                setHoveredPoint(null);
              }}
            >
              Coalitions
            </button>
          </div>
        </div>
        <div className="vote-progression__legend" aria-label={`${seriesMode === "parties" ? "Party" : "Coalition"} lines`}>
          {activeSeries.map((series) => (
            <span
              key={series.id}
              className="vote-progression__party-key"
              style={{ "--series-color": series.color }}
            >
              <span className={series.dashed ? "is-dashed" : ""} aria-hidden="true" />
              {series.label}
            </span>
          ))}
        </div>
        <svg
          className="vote-progression__chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${seriesMode === "parties" ? "Party" : "Coalition"} ${metricMode === "share" ? "vote shares" : "projected seats"} across ${snapshots.length} saved result ${snapshots.length === 1 ? "snapshot" : "snapshots"}`}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {yTicks.map((value) => (
            <g key={value}>
              <line className="vote-progression__grid-line" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yScale(value)} y2={yScale(value)} />
              <text className="vote-progression__axis-label" x={MARGIN.left - 12} y={yScale(value) + 5} textAnchor="end">
                {metricMode === "share" ? `${value.toFixed(0)}%` : value.toFixed(0)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => {
            const isProgressTick = typeof tick === "number";
            const x = isProgressTick
              ? MARGIN.left + (tick / 100) * plotWidth
              : xScale(tick);
            const label = isProgressTick ? `${tick}%` : formatTime(tick.timestamp);

            return (
              <text key={isProgressTick ? tick : tick.timestamp} className="vote-progression__axis-label" x={x} y={HEIGHT - 16} textAnchor="middle">
                {label}
              </text>
            );
          })}
          {activeSeries.map((series) => {
            const seriesPoints = snapshots
              .map((snapshot) => ({
                snapshot,
                value: getValue(snapshot, series),
              }))
              .filter((point) => Number.isFinite(point.value));
            const path = seriesPoints
              .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.snapshot)} ${yScale(point.value)}`)
              .join(" ");

            return (
              <g key={series.id}>
                <path
                  className="vote-progression__line"
                  d={path}
                  style={{
                    stroke: series.color,
                    strokeDasharray: series.dashed ? "10 8" : undefined,
                  }}
                />
                {seriesPoints.map(({ snapshot, value }) => (
                  <circle
                    key={snapshot.timestamp}
                    className="vote-progression__point"
                    cx={xScale(snapshot)}
                    cy={yScale(value)}
                    r="3.25"
                    style={{ fill: series.color }}
                    tabIndex="0"
                    role="button"
                    aria-label={`${series.label}, ${formatMetric(value, metricMode)}, ${snapshot.percentCounted.toFixed(1)}% counted at ${formatTime(snapshot.timestamp)}`}
                    onFocus={() => setHoveredPoint({ series, snapshot, value, x: xScale(snapshot), y: yScale(value) })}
                    onBlur={() => setHoveredPoint(null)}
                    onMouseEnter={() => setHoveredPoint({ series, snapshot, value, x: xScale(snapshot), y: yScale(value) })}
                  />
                ))}
              </g>
            );
          })}
          {activeSeries.map((series) => {
            const value = getValue(latestSnapshot, series);

            if (!Number.isFinite(value)) {
              return null;
            }

            return (
              <text
                key={`${series.id}-label`}
                className="vote-progression__end-label"
                x={WIDTH - MARGIN.right + 12}
                y={endLabelPositions.get(series.id)}
                style={{ fill: series.color }}
              >
                {series.label}
              </text>
            );
          })}
          {hoveredPoint && (
            <g className="vote-progression__tooltip" pointerEvents="none">
              <rect
                x={Math.min(Math.max(hoveredPoint.x - 72, MARGIN.left), WIDTH - MARGIN.right - 144)}
                y={Math.max(hoveredPoint.y - 82, 4)}
                width="144"
                height="66"
                rx="8"
              />
              <text
                x={Math.min(Math.max(hoveredPoint.x, MARGIN.left + 72), WIDTH - MARGIN.right - 72)}
                y={Math.max(hoveredPoint.y - 61, 25)}
                textAnchor="middle"
              >
                <tspan fontWeight="700">{hoveredPoint.series.label} {formatMetric(hoveredPoint.value, metricMode)}</tspan>
                <tspan x={Math.min(Math.max(hoveredPoint.x, MARGIN.left + 72), WIDTH - MARGIN.right - 72)} dy="18">
                  {hoveredPoint.snapshot.percentCounted.toFixed(1)}% counted
                </tspan>
                <tspan x={Math.min(Math.max(hoveredPoint.x, MARGIN.left + 72), WIDTH - MARGIN.right - 72)} dy="17">
                  {formatTime(hoveredPoint.snapshot.timestamp)}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className="vote-progression__footer">
        Latest snapshot: {latestSnapshot.percentCounted.toFixed(1)}% counted · {formatTime(latestSnapshot.timestamp)}
      </p>
    </section>
  );
}
