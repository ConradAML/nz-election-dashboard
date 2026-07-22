import { useState } from "react";

function formatChange(change) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)} pp`;
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
}) {
  const [tooltip, setTooltip] = useState(null);
  const margin = {
    top: 44,
    right: 110,
    bottom: 92,
    left: 20,
  };

  const width = 760;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const labelReserve = 56;
  const plotHeight = chartHeight - labelReserve;
  const scaleMax = maxValue ?? Math.max(...data.map((item) => item.value), 1);
  const gridMax = Math.max(5, Math.ceil(scaleMax / 5) * 5);
  const gridValues = Array.from(
    { length: Math.floor(gridMax / 5) },
    (_, index) => (index + 1) * 5,
  );
  const barGap = 18;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Party vote percentages"
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {gridValues.map((gridValue) => {
            const y = labelReserve + (plotHeight - (gridValue / scaleMax) * plotHeight);
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
                    fontSize="14"
                    fontWeight="600"
                    fill="#666666"
                  >
                    5% threshold
                  </text>
                )}
              </g>
            );
          })}

          {data.map((item, index) => {
            const x = index * (barWidth + barGap);
            const columnHeight = (item.value / scaleMax) * plotHeight;
            const y = labelReserve + (plotHeight - columnHeight);

            return (
              <g key={item.label}>
                <text
                  x={x + barWidth / 2}
                  y={y - 26}
                  textAnchor="middle"
                  fontSize="28"
                  fontWeight="400"
                  fill="#444444"
                >
                  {item.value.toFixed(1)}%
                </text>

                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="600"
                  fill={changeColor(item.change ?? 0)}
                >
                  {formatChange(item.change ?? 0)}
                </text>

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
                      value: item.value,
                      change: item.change ?? 0,
                      color: item.color,
                    });
                  }}
                  onMouseMove={(event) => {
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      label: item.label,
                      value: item.value,
                      change: item.change ?? 0,
                      color: item.color,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />

                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 36}
                  textAnchor="middle"
                  fontSize="25"
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
            Change: {formatChange(tooltip.change)}
          </div>
        </div>
      )}
    </>
  );
}
