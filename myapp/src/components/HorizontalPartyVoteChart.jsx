import { useEffect, useRef, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";

const TRANSITION_DURATION_MS = 320;

function formatChange(change) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}`;
}

function formatVotes(value) {
  return new Intl.NumberFormat("en-NZ").format(value ?? 0);
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

export default function HorizontalPartyVoteChart({
  data,
  mode = "share",
  maxHeight = 520,
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
  const maxShareValue = Math.max(...data.map((item) => item.value), 1);
  const maxAbsChange = Math.max(...data.map((item) => Math.abs(item.change ?? 0)), 1);

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

  return (
    <>
      <div
        className="horizontal-party-chart"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {data.map((item) => {
          const shareWidth = (item.value / maxShareValue) * 100;
          const changeValue = item.change ?? 0;
          const changeWidth = (Math.abs(changeValue) / maxAbsChange) * 50;
          const shareLeft = 0;
          const changeLeft = changeValue >= 0 ? 50 : 50 - changeWidth;
          const animatedLeft = lerp(shareLeft, changeLeft, changeBlend);
          const animatedWidth = lerp(shareWidth, changeWidth, changeBlend);
          const valueColor = changeBlend > 0.5 ? item.color : "#444444";

          return (
            <div className="horizontal-party-chart__row" key={item.partyCode ?? item.label}>
              <div className="horizontal-party-chart__top">
                <div className="horizontal-party-chart__label-block">
                  <span className="horizontal-party-chart__label">{item.label}</span>
                  <span className="horizontal-party-chart__votes">
                    {formatVotes(item.votes)} votes
                  </span>
                </div>
                <span
                  className="horizontal-party-chart__value"
                  style={{ color: valueColor }}
                >
                  {changeBlend > 0.5 ? formatChange(changeValue) : `${item.value.toFixed(1)}%`}
                </span>
              </div>

              <div
                className={`horizontal-party-chart__bar${changeBlend > 0.5 ? " is-change" : ""}`}
                onMouseEnter={(event) => {
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    label: item.label,
                    votes: item.votes,
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
                    votes: item.votes,
                    value: item.value,
                    change: changeValue,
                    color: item.color,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <div className="horizontal-party-chart__track" />
                <div className="horizontal-party-chart__zero-line" />
                <div
                  className="horizontal-party-chart__fill"
                  style={{
                    left: `${Math.max(0, Math.min(animatedLeft, 100))}%`,
                    width: `${Math.max(0, Math.min(animatedWidth, 100))}%`,
                    background: item.color,
                  }}
                />
              </div>
            </div>
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
            fontSize: isMobile ? "14px" : "15px",
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
          <div style={{ marginTop: "4px", color: "#d6d6d6" }}>
            Votes: {formatVotes(tooltip.votes)}
          </div>
          <div style={{ marginTop: "4px", color: tooltip.color }}>
            Change: {formatChange(tooltip.change)}pp
          </div>
        </div>
      )}
    </>
  );
}
