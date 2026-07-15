export default function HorizontalBarChart({
  data,
  width = 700,
  barHeight = 34,
  gap = 14,
  labelWidth = 120,
  valueWidth = 56,
  maxValue,
}) {
  const chartWidth = width - labelWidth - valueWidth - 24;
  const height = data.length * barHeight + (data.length - 1) * gap;
  const scaleMax = maxValue ?? Math.max(...data.map((item) => item.value), 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img">
      {data.map((item, index) => {
        const y = index * (barHeight + gap);
        const barWidth = (item.value / scaleMax) * chartWidth;

        return (
          <g key={item.label} transform={`translate(0, ${y})`}>
            <text
              x="0"
              y={barHeight / 2}
              dominantBaseline="middle"
              fontSize="14"
              fill="#222"
            >
              {item.label}
            </text>

            <rect
              x={labelWidth}
              y={0}
              width={chartWidth}
              height={barHeight}
              rx="8"
              fill="#ececec"
            />

            <rect
              x={labelWidth}
              y={0}
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
