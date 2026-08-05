import { useEffect, useRef, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";

const TRANSITION_DURATION_MS = 320;

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

function easeInOutCubic(progress) {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - ((-2 * progress + 2) ** 3) / 2;
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

export default function VerticalBarChart({
  data,
  height = 440,
  maxValue,
  mode = "share",
}) {
  const [tooltip, setTooltip] = useState(null);
  const [transitionState, setTransitionState] = useState({
    from: mode,
    to: mode,
    progress: 1,
  });
  const frameRef = useRef(null);
  const previousModeRef = useRef(mode);
  const isMobile = useIsMobile();
  const margin = {
    top: isMobile ? 0 : 0,
    right: isMobile ? 82 : 110,
    bottom: isMobile ? 104 : 92,
    left: isMobile ? 12 : 20,
  };

  const width = isMobile ? 430 : 760;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const labelReserve = isMobile ? 66 : 56;
  const changeLabelBuffer = 24;
  const sharePlotHeight = chartHeight - labelReserve;
  const changePlotHeight = chartHeight - labelReserve - changeLabelBuffer;
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
  const changeZeroY = labelReserve + changePlotHeight / 2;

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return undefined;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const fromMode = previousModeRef.current;
    const startedAt = performance.now();

    previousModeRef.current = mode;
    setTransitionState({
      from: fromMode,
      to: mode,
      progress: 0,
    });

    function step(now) {
      const rawProgress = Math.min((now - startedAt) / TRANSITION_DURATION_MS, 1);

      if (rawProgress >= 1) {
        setTransitionState({
          from: mode,
          to: mode,
          progress: 1,
        });
        frameRef.current = null;
        return;
      }

      setTransitionState({
        from: fromMode,
        to: mode,
        progress: rawProgress,
      });
      frameRef.current = window.requestAnimationFrame(step);
    }

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [mode]);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  const isTransitioning =
    transitionState.from !== transitionState.to && transitionState.progress < 1;
  const easedProgress = easeInOutCubic(transitionState.progress);
  const changeBlend = isTransitioning
    ? (transitionState.to === "change" ? easedProgress : 1 - easedProgress)
    : mode === "change"
      ? 1
      : 0;
  const shareOpacity = isTransitioning
    ? transitionState.to === "share"
      ? easedProgress
      : 1 - easedProgress
    : mode === "share"
      ? 1
      : 0;
  const changeOpacity = isTransitioning
    ? transitionState.to === "change"
      ? easedProgress
      : 1 - easedProgress
    : mode === "change"
      ? 1
      : 0;

  function yForChangeValue(value) {
    return labelReserve + ((changeScaleMax - value) / (changeScaleMax * 2)) * changePlotHeight;
  }

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={mode === "change" ? "Party vote change in percentage points" : "Party vote percentages"}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          <g opacity={shareOpacity}>
            {shareGridValues.map((gridValue) => {
              const y =
                labelReserve + (sharePlotHeight - (gridValue / maxShareValue) * sharePlotHeight);
              const isThreshold = gridValue === 5;

              return (
                <g key={`share-grid-${gridValue}`}>
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
          </g>

          <g opacity={changeOpacity}>
            {changeGridValues.map((gridValue) => {
              const y = yForChangeValue(gridValue);

              return (
                <g key={`change-grid-${gridValue}`}>
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
            })}
          </g>

          <line
            x1="0"
            y1={changeZeroY}
            x2={chartWidth}
            y2={changeZeroY}
            stroke="#666666"
            strokeWidth="2"
            opacity={changeOpacity}
          />

          {data.map((item, index) => {
            const x = index * (barWidth + barGap);
            const changeValue = item.change ?? 0;
            const shareColumnHeight = (item.value / maxShareValue) * sharePlotHeight;
            const shareY = labelReserve + (sharePlotHeight - shareColumnHeight);
            const changeY = yForChangeValue(changeValue);
            const changeColumnHeight = Math.abs(changeZeroY - changeY);
            const changeBarY = changeValue >= 0 ? changeY : changeZeroY;
            const animatedY = lerp(shareY, changeBarY, changeBlend);
            const animatedHeight = lerp(shareColumnHeight, changeColumnHeight, changeBlend);
            const shareValueLabelY = shareY - 26;
            const shareChangeLabelY = shareY - 6;
            const changeValueLabelY =
              changeValue >= 0 ? changeBarY - 14 : changeBarY + changeColumnHeight + 24;

            return (
              <g key={item.label}>
                <text
                  x={x + barWidth / 2}
                  y={shareValueLabelY}
                  textAnchor="middle"
                  fontSize={isMobile ? "22" : "28"}
                  fontWeight="400"
                  fill="#444444"
                  opacity={shareOpacity}
                >
                  {`${item.value.toFixed(1)}%`}
                </text>

                <text
                  x={x + barWidth / 2}
                  y={shareChangeLabelY}
                  textAnchor="middle"
                  fontSize={isMobile ? "14" : "16"}
                  fontWeight="600"
                  fill={changeColor(changeValue)}
                  opacity={shareOpacity}
                >
                  {formatChange(changeValue)}
                </text>

                <text
                  x={x + barWidth / 2}
                  y={changeValueLabelY}
                  textAnchor="middle"
                  fontSize={isMobile ? "22" : "28"}
                  fontWeight="400"
                  fill={changeColor(changeValue)}
                  opacity={changeOpacity}
                >
                  {formatChangeLabel(changeValue)}
                </text>

                <rect
                  x={x}
                  y={animatedY}
                  width={barWidth}
                  height={animatedHeight}
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
