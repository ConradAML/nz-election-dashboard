import { useState } from "react";
import useIsMobile from "../hooks/useIsMobile";

function formatChange(change) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}`;
}

function formatChangeLabel(change) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}`;
}

function changeColor(change) {
  if (change > 0) {
    return "#15803d";
  }

  if (change < 0) {
    return "#c62828";
  }

  return "#666666";
}

export default function VerticalBarChart({
  data,
  height = 440,
  maxValue,
  mode = "share",
}) {
  const [tooltip, setTooltip] = useState(null);
  const isMobile = useIsMobile();
  const margin = {
    top: isMobile ? 0 : 0,
    right: isMobile ? 82 : 110,
    bottom: isMobile ? 104 : 92,
    left: isMobile ? 12 : 20,
  };

  const isChangeMode = mode === "change";
  const width = isMobile ? 430 : 760;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const labelReserve = isMobile ? 66 : 56;
  const changeLabelBuffer = 24;
  const plotHeight = isChangeMode
    ? chartHeight - labelReserve - changeLabelBuffer
    : chartHeight - labelReserve;
  const changeValues = data.map((item) => item.change ?? 0);
  const maxShareValue = maxValue ?? Math.max(...data.map((item) => item.value), 1);
  const maxAbsChange = Math.max(...changeValues.map((value) => Math.abs(value)), 1);
  const changeScaleMax = Math.max(5, Math.ceil(maxAbsChange / 5) * 5);
  const shareGridMax = Math.max(5, Math.ceil(maxShareValue / 5) * 5);
  const shareGridValues = Array.from(
    { length: Math.floor(shareGridMax / 5) },
    (_, index) => (index + 1) * 5,
  );
  const changeGridValues = Array.from(
    { length: (changeScaleMax / 5) * 2 + 1 },
    (_, index) => index * 5 - changeScaleMax,
  ).filter((value) => value !== 0);
  const barGap = 18;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;
  const changeZeroY = labelReserve + plotHeight / 2;

  function yForChangeValue(value) {
    return labelReserve + ((changeScaleMax - value) / (changeScaleMax * 2)) * plotHeight;
  }

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={isChangeMode ? "Party vote change in percentage points" : "Party vote percentages"}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {isChangeMode
            ? changeGridValues.map((gridValue) => {
                const y = yForChangeValue(gridValue);

                return (
                  <g key={`grid-${gridValue}`}>
                    <line
                      x1="0"
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke="#d9d9d9"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                  </g>
                );
              })
            : shareGridValues.map((gridValue) => {
                const y = labelReserve + (plotHeight - (gridValue / maxShareValue) * plotHeight);
                const isThreshold = gridValue === 5;

                return (
                  <g key={`grid-${gridValue}`}>
                    <line
                      x1="0"
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke={isThreshold ? "#8a8a8a" : "#d9d9d9"}
                      strokeWidth={isThreshold ? "2" : "1"}
                      strokeDasharray={isThreshold ? "0" : "4 4"}
                    />
                    {isThreshold && (
                      <text
                        x={chartWidth + 12}
                        y={y + 5}
                        textAnchor="start"
                        fontSize={isMobile ? "13" : "14"}
                        fontWeight="600"
                        fill="#666666"
                      >
                        5% threshold
                      </text>
                    )}
                  </g>
                );
              })}

          {isChangeMode && (
            <line
              x1="0"
              y1={changeZeroY}
              x2={chartWidth}
              y2={changeZeroY}
              stroke="#666666"
              strokeWidth="2"
            />
          )}

          {data.map((item, index) => {
            const x = index * (barWidth + barGap);
            const changeValue = item.change ?? 0;
            const shareColumnHeight = (item.value / maxShareValue) * plotHeight;
            const shareY = labelReserve + (plotHeight - shareColumnHeight);
            const changeY = yForChangeValue(changeValue);
            const columnHeight = isChangeMode
              ? Math.abs(changeZeroY - changeY)
              : shareColumnHeight;
            const y = isChangeMode
              ? (changeValue >= 0 ? changeY : changeZeroY)
              : shareY;

            return (
              <g key={item.label}>
                <text
                  x={x + barWidth / 2}
                  y={isChangeMode ? (changeValue >= 0 ? y - 14 : y + columnHeight + 24) : y - 26}
                  textAnchor="middle"
                  fontSize={isMobile ? "22" : "28"}
                  fontWeight="400"
                  fill={isChangeMode ? changeColor(changeValue) : "#444444"}
                >
                  {isChangeMode ? formatChangeLabel(changeValue) : `${item.value.toFixed(1)}%`}
                </text>

                {!isChangeMode && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fontSize={isMobile ? "14" : "16"}
                    fontWeight="600"
                    fill={changeColor(changeValue)}
                  >
                    {formatChange(changeValue)}
                  </text>
                )}

                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={columnHeight}
                  rx="8"
                  fill={item.color}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(event) => {
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      label: item.label,
                      mode,
                      value: item.value,
                      change: changeValue,
                      color: item.color,
                    });
                  }}
                  onMouseMove={(event) => {
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      label: item.label,
                      mode,
                      value: item.value,
                      change: changeValue,
                      color: item.color,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />

                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 28}
                  textAnchor={isMobile ? "start" : "middle"}
                  transform={
                    isMobile
                      ? `rotate(45 ${x + barWidth / 2} ${chartHeight + 28})`
                      : undefined
                  }
                  fontSize={isMobile ? "16" : "20"}
                  fontWeight="600"
                  fill="#444444"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            padding: "8px 10px",
            borderRadius: "8px",
            background: "rgba(34, 34, 34, 0.94)",
            color: "#ffffff",
            fontSize: "15px",
            lineHeight: 1.2,
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 8px 18px rgba(0, 0, 0, 0.18)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              marginRight: "8px",
              borderRadius: "999px",
              background: tooltip.color,
              verticalAlign: "middle",
            }}
          />
          <strong>{tooltip.label}</strong>: {tooltip.value.toFixed(1)}%
          <div style={{ marginTop: "4px", color: changeColor(tooltip.change) }}>
            Change: {formatChange(tooltip.change)}pp
          </div>
        </div>
      )}
    </>
  );
}
