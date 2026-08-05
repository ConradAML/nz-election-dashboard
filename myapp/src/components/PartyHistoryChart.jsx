import { useState } from "react";
import { PARTY_HISTORY, PARTY_HISTORY_TABS } from "../constants/partyHistory";

const WIDTH = 1000;
const HEIGHT = 390;
const MARGIN = { top: 24, right: 34, bottom: 48, left: 58 };

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function buildCurrentValue(tab, results, turnout) {
  if (tab.id === "turnout") {
    return Number.parseFloat(turnout?.percent_votes_cast);
  }

  const row = results?.find((result) => result.p_no === tab.partyCode);
  return Number.parseFloat(row?.percent_votes);
}

function buildYearTicks(points, maximumTicks = 5) {
  if (points.length <= maximumTicks) {
    return points.map(([year]) => year);
  }

  return Array.from(
    new Set(
      Array.from({ length: maximumTicks }, (_, index) => {
        const pointIndex = Math.round((index * (points.length - 1)) / (maximumTicks - 1));
        return points[pointIndex][0];
      }),
    ),
  );
}

export default function PartyHistoryChart({ results, turnout }) {
  const [activeId, setActiveId] = useState("national");
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const activeTab = PARTY_HISTORY_TABS.find((tab) => tab.id === activeId)
    ?? PARTY_HISTORY_TABS[0];
  const currentValue = buildCurrentValue(activeTab, results, turnout);
  const historicalPoints = PARTY_HISTORY[activeTab.id];
  const points = Number.isFinite(currentValue)
    ? [...historicalPoints, [2026, currentValue]]
    : historicalPoints;
  const firstYear = points[0][0];
  const lastYear = points.at(-1)[0];
  const maxValue = activeId === "turnout"
    ? 100
    : Math.max(10, Math.ceil(Math.max(...points.map(([, value]) => value)) / 10) * 10);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xScale = (year) => MARGIN.left + ((year - firstYear) / (lastYear - firstYear)) * plotWidth;
  const yScale = (value) => MARGIN.top + (1 - value / maxValue) * plotHeight;
  const path = points
    .map(([year, value], index) => `${index === 0 ? "M" : "L"} ${xScale(year)} ${yScale(value)}`)
    .join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxValue / 4) * index);
  const yearTicks = buildYearTicks(points);

  return (
    <section className="party-history" aria-labelledby="party-history-title">
      <div className="party-history__header">
        <div>
          <h2 id="party-history-title">Vote history</h2>
          <p className="party-history__subtitle">
            General-election vote share by party, plus election turnout. The latest point shows current 2026 results.
          </p>
        </div>
        <div className="party-history__latest" aria-live="polite">
          <span>{activeTab.label} · 2026</span>
          <strong>{formatPercent(points.at(-1)[1])}</strong>
        </div>
      </div>

      <div className="party-history__tabs" role="tablist" aria-label="Vote history series">
        {PARTY_HISTORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeId}
            aria-controls="party-history-chart"
            className={`party-history__tab${tab.id === activeId ? " is-active" : ""}`}
            style={{ "--series-color": tab.color }}
            onClick={() => {
              setActiveId(tab.id);
              setHoveredPoint(null);
            }}
          >
            <span aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="party-history__chart-wrap" id="party-history-chart" role="tabpanel">
        <svg
          className="party-history__chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${activeTab.label} election history from ${firstYear} to 2026`}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {yTicks.map((value) => (
            <g key={value}>
              <line
                className="party-history__grid-line"
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yScale(value)}
                y2={yScale(value)}
              />
              <text className="party-history__axis-label" x={MARGIN.left - 12} y={yScale(value) + 5} textAnchor="end">
                {value.toFixed(0)}%
              </text>
            </g>
          ))}
          {yearTicks.map((year) => (
            <text key={year} className="party-history__axis-label" x={xScale(year)} y={HEIGHT - 14} textAnchor="middle">
              {year}
            </text>
          ))}
          <path className="party-history__line" d={path} style={{ stroke: activeTab.color }} />
          {points.map(([year, value]) => (
            <circle
              key={year}
              className={`party-history__point${year === 2026 ? " is-current" : ""}`}
              cx={xScale(year)}
              cy={yScale(value)}
              r={year === 2026 ? 7 : 4.5}
              style={{ fill: activeTab.color }}
              tabIndex="0"
              role="button"
              aria-label={`${year}: ${formatPercent(value)}`}
              onFocus={() => setHoveredPoint({ year, value, x: xScale(year), y: yScale(value) })}
              onBlur={() => setHoveredPoint(null)}
              onMouseEnter={() => setHoveredPoint({ year, value, x: xScale(year), y: yScale(value) })}
            />
          ))}
          <text
            className="party-history__current-label"
            x={xScale(lastYear)}
            y={Math.max(yScale(points.at(-1)[1]) - 34, 16)}
            textAnchor="middle"
          >
            <tspan fontWeight="700">2026</tspan>
            <tspan x={xScale(lastYear)} dy="17">
              {formatPercent(points.at(-1)[1])}
            </tspan>
          </text>
          {hoveredPoint && (
            <g className="party-history__tooltip" pointerEvents="none">
              <rect
                x={Math.min(Math.max(hoveredPoint.x - 52, MARGIN.left), WIDTH - MARGIN.right - 104)}
                y={Math.max(hoveredPoint.y - 62, 4)}
                width="104"
                height="46"
                rx="8"
              />
              <text
                x={Math.min(Math.max(hoveredPoint.x, MARGIN.left + 52), WIDTH - MARGIN.right - 52)}
                y={Math.max(hoveredPoint.y - 43, 23)}
                textAnchor="middle"
              >
                <tspan fontWeight="700">{hoveredPoint.year}</tspan>
                <tspan x={Math.min(Math.max(hoveredPoint.x, MARGIN.left + 52), WIDTH - MARGIN.right - 52)} dy="17">
                  {formatPercent(hoveredPoint.value)}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
