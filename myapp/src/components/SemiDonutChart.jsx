import { useEffect, useState } from "react";

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
  ].join(" ");
}

function formatChange(change) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(0)}`;
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

function legendTextColor(isSelected) {
  return isSelected ? "#444444" : "#8a8a8a";
}

const actionButtonStyle = {
  padding: "4px 14px",
  border: "1px solid #d8d8d8",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#444444",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

const legendGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
};

const legendButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "4px 14px",
  borderRadius: "999px",
  background: "#f8f8f8",
  border: "1.5px solid #dddddd",
  color: "#444444",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

export default function SemiDonutChart({
  data,
  width = 760,
  height = 570,
  strokeWidth = 110,
}) {
  const [tooltip, setTooltip] = useState(null);
  const [selectedLabels, setSelectedLabels] = useState(() =>
    data.map((item) => item.label),
  );

  useEffect(() => {
    setSelectedLabels(data.map((item) => item.label));
  }, [data]);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const majorityThreshold = Math.ceil(total / 2);
  const selectedSet = new Set(selectedLabels);
  const selectedData = data.filter((item) => selectedSet.has(item.label));
  const coalitionSeats = data.reduce((sum, item) => {
    return selectedSet.has(item.label) ? sum + item.value : sum;
  }, 0);
  const hasMajority = coalitionSeats >= majorityThreshold;
  const hasAllSeatsSelected = coalitionSeats === total;
  const seatsToMajority = Math.max(majorityThreshold - coalitionSeats, 0);
  const centerX = width / 2;
  const centerY = height - 200;
  const radius = Math.min(width * 0.36, height * 0.56);
  const outerRadius = radius + strokeWidth / 2;
  const innerRadius = radius - strokeWidth / 2;

  function toggleParty(label) {
    setSelectedLabels((currentLabels) => {
      if (currentLabels.includes(label)) {
        return currentLabels.filter((currentLabel) => currentLabel !== label);
      }

      return [...currentLabels, label];
    });
  }

  function selectAllParties() {
    setSelectedLabels(data.map((item) => item.label));
    setTooltip(null);
  }

  function deselectAllParties() {
    setSelectedLabels([]);
    setTooltip(null);
  }

  function updateTooltip(event, item, isSelected) {
    setTooltip({
      x: event.clientX,
      y: event.clientY,
      label: item.label,
      value: item.value,
      change: item.change ?? 0,
      color: item.color,
      isSelected,
    });
  }

  function handlePartyKeyDown(event, label) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleParty(label);
    }
  }

  let currentAngle = 180;

  const svgheight = height - 100;

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${svgheight}`}
        role="img"
        aria-label="Seat count by party"
      >
        <path
          d={describeArc(centerX, centerY, radius, 180, 360)}
          fill="none"
          stroke="#ececec"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />

        {selectedData.map((item) => {
          const sweep = (item.value / total) * 180;
          const startAngle = currentAngle;
          const endAngle = currentAngle + sweep;
          currentAngle = endAngle;

          return (
            <path
              key={item.label}
              d={describeArc(centerX, centerY, radius, startAngle, endAngle)}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              role="button"
              tabIndex={0}
              aria-pressed="true"
              style={{ cursor: "pointer" }}
              onClick={() => toggleParty(item.label)}
              onKeyDown={(event) => handlePartyKeyDown(event, item.label)}
              onMouseEnter={(event) => updateTooltip(event, item, true)}
              onMouseMove={(event) => updateTooltip(event, item, true)}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        <line
          x1={centerX}
          y1={centerY - outerRadius - 6}
          x2={centerX}
          y2={centerY - innerRadius + 6}
          /*stroke="#ffffff"
          strokeWidth="8"
          strokeLinecap="round"*/
        />
        <line
          x1={centerX}
          y1={centerY - outerRadius - 6}
          x2={centerX}
          y2={centerY - innerRadius + 6}
          stroke="#000000"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text
          x={centerX}
          y={centerY - outerRadius - 18}
          textAnchor="middle"
          fontSize="24"
          fontWeight="600"
          fill="#000000"
        >
          Majority
        </text>

        <text
          x={centerX}
          y={centerY - 26}
          textAnchor="middle"
          fontSize="28"
          fontWeight="600"
          fill="#000000"
        >
          {coalitionSeats} seats
        </text>
        {!hasAllSeatsSelected && (
          <text
            x={centerX}
            y={centerY + 38}
            textAnchor="middle"
            fontSize="18"
            fontWeight="500"
            fill={hasMajority ? "#15803d" : "#666666"}
          >
            {hasMajority
              ? "Majority reached"
              : `${seatsToMajority} short of majority`}
          </text>
        )}
        <text
          x={centerX}
          y={centerY + 66}
          textAnchor="middle"
          fontSize="15"
          fontWeight="500"
          fill="#7a7a7a"
        >
          Click parties to build a coalition
        </text>

      </svg>

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <button type="button" style={actionButtonStyle} onClick={selectAllParties}>
          Select all
        </button>
        <button
          type="button"
          style={actionButtonStyle}
          onClick={deselectAllParties}
        >
          Deselect all
        </button>
      </div>

      <div style={legendGridStyle}>
        {data.map((item) => {
          const isSelected = selectedSet.has(item.label);

          return (
            <button
              key={`${item.label}-legend`}
              type="button"
              aria-pressed={isSelected}
              style={{
                ...legendButtonStyle,
                background: isSelected ? "#f4f3ec" : "#f8f8f8",
                borderColor: isSelected ? item.color : "#dddddd",
                color: legendTextColor(isSelected),
              }}
              onClick={() => toggleParty(item.label)}
              onKeyDown={(event) => handlePartyKeyDown(event, item.label)}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "3px",
                  background: isSelected ? item.color : "#cfcfcf",
                  flexShrink: 0,
                }}
              />
              <span>
                {item.label} {item.value}
              </span>
            </button>
          );
        })}
      </div>


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
          <strong>{tooltip.label}</strong>: {tooltip.value} seats
          <div style={{ marginTop: "4px", color: changeColor(tooltip.change) }}>
            Change: {formatChange(tooltip.change)}
          </div>
        </div>
      )}
    </div>
  );
}
