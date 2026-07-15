const partyData = [
  { label: "National", value: 38.1, color: "#3399FF" },
  { label: "Labour", value: 26.9, color: "#FF0000" },
  { label: "Green", value: 11.6, color: "#009900" },
  { label: "ACT", value: 8.6, color: "#D3B641" },
  { label: "NZ First", value: 6.1, color: "#999999" },
  { label: "Māori", value: 3.1, color: "#AA00D4" },
  { label: "Opportunity", value: 2.2, color: "#F0E68C" },
  { label: "Other", value: 3.4, color: "#454545" },
];

function HorizontalBarChart({
  data,
  width = 760,
  barHeight = 34,
  gap = 16,
  labelWidth = 120,
  valueWidth = 60,
  maxValue = 100,
}) {
  const chartWidth = width - labelWidth - valueWidth - 24;
  const height = data.length * barHeight + (data.length - 1) * gap;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Party vote percentages"
    >
      {data.map((item, index) => {
        const y = index * (barHeight + gap);
        const barWidth = (item.value / maxValue) * chartWidth;

        return (
          <g key={item.label} transform={`translate(0, ${y})`}>
            <text
              x="0"
              y={barHeight / 2}
              dominantBaseline="middle"
              fontSize="14"
              fontWeight="600"
              fill="#222"
            >
              {item.label}
            </text>

            <rect
              x={labelWidth}
              y="0"
              width={chartWidth}
              height={barHeight}
              rx="8"
              fill="#ececec"
            />

            <rect
              x={labelWidth}
              y="0"
              width={barWidth}
              height={barHeight}
              rx="8"
              fill={item.color}
            />

            <text
              x={labelWidth + chartWidth + 12}
              y={barHeight / 2}
              dominantBaseline="middle"
              fontSize="14"
              fontWeight="600"
              fill="#222"
            >
              {item.value.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ marginBottom: "10px" }}>Party vote</h1>
      <p style={{ marginBottom: "24px", color: "#555" }}>
        Headline party vote percentages
      </p>
      <HorizontalBarChart data={partyData} />
    </main>
  );
}
