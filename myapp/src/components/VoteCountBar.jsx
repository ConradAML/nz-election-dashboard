import useIsMobile from "../hooks/useIsMobile";

export default function VoteCountBar({
  data,
  width = 760,
  barHeight = 28,
  gap = 12,
  valueWidth = 70,
  maxValue = 100,
  labelFontSize = 18,
  valueFontSize = 18,
}) {
  const isMobile = useIsMobile();
  const chartWidthValue = isMobile ? 430 : width;
  const chartValueWidth = isMobile ? 58 : valueWidth;
  const chartWidth = chartWidthValue - chartValueWidth - 24;
  const height = data.length * barHeight + (data.length - 1) * gap;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${chartWidthValue} ${height}`}
      role="img"
      aria-label="Vote count progress"
    >
      {data.map((item, index) => {
        const y = index * (barHeight + gap);
        const barWidth = (item.value / maxValue) * chartWidth;

        return (
          <g key={item.label} transform={`translate(0, ${y})`}>
            <rect
              x={0}
              y={0}
              width={chartWidth}
              height={barHeight}
              rx="10"
              fill="#ececec"
            />

            <rect
              x={0}
              y={0}
              width={barWidth}
              height={barHeight}
              rx="10"
              fill={item.color}
            />

            <text
              x={0 + chartWidth + 12}
              y={barHeight / 2}
              dominantBaseline="middle"
              fontSize={isMobile ? Math.max(valueFontSize, 16) : valueFontSize}
              fontWeight="600"
              fill="#444444"
            >
              {item.value.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
