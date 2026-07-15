export default function VerticalBarChart({
  data,
  width = 760,
  height = 440,
  maxValue,
}) {
  const margin = {
    top: 44,
    right: 20,
    bottom: 92,
    left: 20,
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const scaleMax = maxValue ?? Math.max(...data.map((item) => item.value), 1);
  const barGap = 18;
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Party vote percentages"
    >
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        <line
          x1="0"
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke="#cfcfcf"
          strokeWidth="1"
        />

        {data.map((item, index) => {
          const x = index * (barWidth + barGap);
          const columnHeight = (item.value / scaleMax) * chartHeight;
          const y = chartHeight - columnHeight;

          return (
            <g key={item.label}>
              <text
                x={x + barWidth / 2}
                y={y - 10}
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                fill="#222"
              >
                {item.value.toFixed(1)}%
              </text>

              <rect
                x={x}
                y={y}
                width={barWidth}
                height={columnHeight}
                rx="8"
                fill={item.color}
              />

              <text
                x={x + barWidth / 2}
                y={chartHeight + 24}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="#222"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
