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

export default function SemiDonutChart({
  data,
  width = 760,
  height = 420,
  strokeWidth = 110,
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const centerX = width / 2;
  const centerY = height - 200;
  const radius = Math.min(width * 0.36, height * 0.56);
  const legendTop = centerY - radius + 360;

  let currentAngle = 180;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
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

      {data.map((item) => {
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
          />
        );
      })}

      <text
        x={centerX}
        y={centerY - 26}
        textAnchor="middle"
        fontSize="28"
        fontWeight="600"
        fill="#444444"
      >
        {total}
      </text>
      <text
        x={centerX}
        y={centerY + 8}
        textAnchor="middle"
        fontSize="20"
        fontWeight="500"
        fill="#666666"
      >
        total seats
      </text>
      <text
        x={centerX}
        y={centerY + 38}
        textAnchor="middle"
        fontSize="18"
        fontWeight="500"
        fill="#666666"
      >
        Majority: 61
      </text>

      {data.map((item, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const x = 44 + column * 226;
        const y = legendTop + row * 38;

        return (
          <g key={`${item.label}-legend`} transform={`translate(${x}, ${y})`}>
            <rect x="0" y="-12" width="14" height="14" rx="3" fill={item.color} />
            <text x="24" y="0" fontSize="18" fontWeight="600" fill="#444444">
              {item.label} {item.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
