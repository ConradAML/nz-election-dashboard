import { useEffect, useMemo, useRef, useState } from "react";
import {
  NEUTRAL_MAP_FILL,
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";

const DEFAULT_MIN_SCALE = 0.45;
const HEX_MIN_SCALE = 0.28;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.08;
const CLICK_DRAG_THRESHOLD = 8;
const MIN_VISIBLE_PX = 96;
const SELECTED_STROKE_COLOR = "#f4f1eb";
const DEFAULT_SELECTED_STROKE_WIDTH = "2.8px";
const HEX_SELECTED_STROKE_WIDTH = "8px";
const SELECTED_FILL_LIGHTEN = 0.22;
const DEFAULT_FIT_PADDING = 20;
const HEX_FIT_PADDING = 40;
const HEX_FIT_SCALE_MULTIPLIER = 0.5;

function normalizeElectorateKey(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^_+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^mt_/g, "mt_")
    .replace(/^st_/g, "st_")
    .replace(/papkura/g, "papakura")
    .replace(/invercargil/g, "invercargill")
    .replace(/whangarei/g, "whangarei")
    .replace(/whangaparaoa/g, "whangaparaoa")
    .replace(/rangitikei/g, "rangitikei")
    .replace(/taupo/g, "taupo")
    .replace(/tamaki/g, "tamaki")
    .replace(/mangere/g, "mangere")
    .replace(/otahuhu/g, "otahuhu")
    .replace(/kaikoura/g, "kaikoura")
    .replace(/waitakere/g, "waitakere")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function styleWithRule(existingStyle, rule) {
  return existingStyle ? `${existingStyle} ${rule}` : rule;
}

function lightenColor(hexColor, amount) {
  const normalized = hexColor.replace("#", "");

  if (!/^[\da-fA-F]{6}$/.test(normalized)) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  const mixChannel = (channel) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${mixChannel(red)}${mixChannel(green)}${mixChannel(blue)}`;
}

function getElectorateNumberFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const layer = target.closest("[data-electorate-no]");
  return layer?.getAttribute("data-electorate-no") ?? null;
}

function getShapesForLayer(layer) {
  return layer.tagName.toLowerCase() === "path"
    ? [layer]
    : layer.querySelectorAll("path");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMinScale(viewMode) {
  return viewMode === "hex" ? HEX_MIN_SCALE : DEFAULT_MIN_SCALE;
}

function getSelectedStrokeWidth(viewMode) {
  return viewMode === "hex"
    ? HEX_SELECTED_STROKE_WIDTH
    : DEFAULT_SELECTED_STROKE_WIDTH;
}

function getPointerGestureState(activePointers, viewportRect) {
  if (activePointers.size < 2) {
    return null;
  }

  const [firstPointer, secondPointer] = [...activePointers.values()];
  const deltaX = secondPointer.clientX - firstPointer.clientX;
  const deltaY = secondPointer.clientY - firstPointer.clientY;

  return {
    distance: Math.hypot(deltaX, deltaY),
    midpointClientX: (firstPointer.clientX + secondPointer.clientX) / 2,
    midpointClientY: (firstPointer.clientY + secondPointer.clientY) / 2,
    midpointX:
      (firstPointer.clientX + secondPointer.clientX) / 2 - viewportRect.left,
    midpointY:
      (firstPointer.clientY + secondPointer.clientY) / 2 - viewportRect.top,
  };
}

function clampViewToBounds(nextView, viewport, canvas) {
  if (!viewport || !canvas) {
    return nextView;
  }

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  const contentWidth = canvas.offsetWidth * nextView.scale;
  const contentHeight = canvas.offsetHeight * nextView.scale;
  const minVisibleX = Math.min(MIN_VISIBLE_PX, viewportWidth, contentWidth);
  const minVisibleY = Math.min(MIN_VISIBLE_PX, viewportHeight, contentHeight);
  const minX = minVisibleX - contentWidth;
  const maxX = viewportWidth - minVisibleX;
  const minY = minVisibleY - contentHeight;
  const maxY = viewportHeight - minVisibleY;

  return {
    ...nextView,
    x: clamp(nextView.x, minX, maxX),
    y: clamp(nextView.y, minY, maxY),
  };
}

export default function InteractiveMap({
  electorateWinners,
  electorateDetails,
  nzMapMarkup,
  selectedElectorateNumber,
  onSelectElectorate,
  viewMode = "cartographic",
  onViewModeChange,
  savedView,
  onViewSnapshot,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredElectorateNumber, setHoveredElectorateNumber] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const pinchStateRef = useRef(null);
  const frameRef = useRef(null);
  const hasAutoFittedRef = useRef(false);
  const electorateDetailsLookup =
    electorateDetails?.by_electorate_number ?? {};

  const svgMarkup = useMemo(() => {
    if (!nzMapMarkup || !electorateWinners) {
      return "";
    }

    const cleanedMarkup = nzMapMarkup.replace(/<\?xml[\s\S]*?\?>/, "").trim();
    const parser = new DOMParser();
    const documentRoot = parser.parseFromString(cleanedMarkup, "image/svg+xml");
    const svgElement = documentRoot.documentElement;
    const byElectorateNumber = electorateWinners.by_electorate_number ?? {};
    const bySvgId = electorateWinners.by_svg_id ?? {};
    const byNormalizedKey = new Map();
    const selectedStrokeWidth = getSelectedStrokeWidth(viewMode);
    let hoveredLayer = null;
    let selectedLayer = null;

    for (const [svgId, entry] of Object.entries(bySvgId)) {
      byNormalizedKey.set(normalizeElectorateKey(svgId), entry);
    }

    for (const entry of Object.values(byElectorateNumber)) {
      byNormalizedKey.set(normalizeElectorateKey(entry?.electorate_name), entry);
    }

    for (const layer of svgElement.querySelectorAll("g[id], path[id]")) {
      const seededElectorateNumber = layer.getAttribute("data-electorate-no");
      const normalizedLayerId = normalizeElectorateKey(layer.id);
      const mapEntry =
        (seededElectorateNumber && byElectorateNumber[seededElectorateNumber]) ||
        bySvgId[layer.id] ||
        byNormalizedKey.get(normalizedLayerId);
      const electorateNumber =
        mapEntry?.electorate_number ?? seededElectorateNumber ?? null;
      const hasElectorateMatch = Boolean(electorateNumber);
      const isSelected =
        hasElectorateMatch && electorateNumber === selectedElectorateNumber;
      const isHovered =
        hasElectorateMatch &&
        electorateNumber === hoveredElectorateNumber &&
        electorateNumber !== selectedElectorateNumber;
      const isActive = isSelected || isHovered;
      const baseFill =
        PARTY_COLORS[mapEntry?.winner_party_code] ??
        (mapEntry?.has_svg_match ? NEUTRAL_PARTY_COLOR : NEUTRAL_MAP_FILL);
      const fill = isActive
        ? lightenColor(baseFill, SELECTED_FILL_LIGHTEN)
        : baseFill;

      if (!hasElectorateMatch && layer.tagName.toLowerCase() === "g") {
        continue;
      }

      if (electorateNumber) {
        layer.setAttribute("data-electorate-no", electorateNumber);
      }

      const shapes = getShapesForLayer(layer);

      for (const shape of shapes) {
        let nextStyle = shape.getAttribute("style") || "";
        nextStyle = styleWithRule(nextStyle, `fill: ${fill};`);
        nextStyle = styleWithRule(nextStyle, "pointer-events: auto;");

        if (isActive) {
          nextStyle = styleWithRule(nextStyle, `stroke: ${SELECTED_STROKE_COLOR};`);
          nextStyle = styleWithRule(
            nextStyle,
            `stroke-width: ${selectedStrokeWidth};`,
          );
          nextStyle = styleWithRule(nextStyle, "stroke-linejoin: round;");
          nextStyle = styleWithRule(nextStyle, "stroke-linecap: round;");
          nextStyle = styleWithRule(nextStyle, "vector-effect: non-scaling-stroke;");
          shape.setAttribute("stroke", SELECTED_STROKE_COLOR);
          shape.setAttribute("stroke-width", selectedStrokeWidth);
        }

        shape.setAttribute("style", nextStyle.trim());
        shape.setAttribute("fill", fill);
      }

      if (isHovered) {
        hoveredLayer = layer;
      }

      if (isSelected) {
        selectedLayer = layer;
      }
    }

    if (hoveredLayer) {
      svgElement.appendChild(hoveredLayer);
    }

    if (selectedLayer) {
      svgElement.appendChild(selectedLayer);
    }

    return new XMLSerializer().serializeToString(svgElement);
  }, [
    electorateWinners,
    hoveredElectorateNumber,
    nzMapMarkup,
    selectedElectorateNumber,
    viewMode,
  ]);

  useEffect(() => {
    hasAutoFittedRef.current = false;
  }, [nzMapMarkup]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    function applyTransform() {
      const { x, y, scale } = viewRef.current;
      canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      frameRef.current = null;
    }

    function scheduleTransform() {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(applyTransform);
    }

    canvas.__scheduleTransform = scheduleTransform;
    scheduleTransform();

    if (savedView) {
      viewRef.current = { ...savedView };
      hasAutoFittedRef.current = true;
      scheduleTransform();
    } else if (!hasAutoFittedRef.current) {
      const fitFrameId = window.requestAnimationFrame(() => {
        fitViewToViewport();
        hasAutoFittedRef.current = true;
      });

      return () => {
        window.cancelAnimationFrame(fitFrameId);
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        delete canvas.__scheduleTransform;
      };
    }

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      delete canvas.__scheduleTransform;
    };
  }, [savedView, svgMarkup]);

  const hoveredElectorate = hoveredElectorateNumber
    ? electorateDetailsLookup[hoveredElectorateNumber] ?? null
    : null;
  const hoveredCandidateResults = hoveredElectorate?.candidate_results ?? [];
  const sortedHoveredCandidates = [...hoveredCandidateResults].sort(
    (left, right) => (right?.votes ?? 0) - (left?.votes ?? 0),
  );
  const hoveredLeader = sortedHoveredCandidates[0] ?? null;
  const hoveredRunnerUp = sortedHoveredCandidates[1] ?? null;
  const hoveredMajority = hoveredLeader
    ? Math.max((hoveredLeader.votes ?? 0) - (hoveredRunnerUp?.votes ?? 0), 0)
    : null;
  const hoveredLeaderPartyColor =
    PARTY_COLORS[hoveredLeader?.party_code] ??
    PARTY_COLORS[hoveredElectorate?.winner_party_code] ??
    NEUTRAL_PARTY_COLOR;
  const hoveredLeaderPartyName = hoveredLeader?.party_short_name
    || hoveredElectorate?.winner_party_short_name
    || hoveredElectorate?.winner_party_name
    || "Independent";

  function scheduleTransform() {
    const canvas = canvasRef.current;
    canvas?.__scheduleTransform?.();
  }

  function updateView(nextView) {
    viewRef.current = clampViewToBounds(
      nextView,
      viewportRef.current,
      canvasRef.current,
    );
    onViewSnapshot?.({ ...viewRef.current });
    scheduleTransform();
  }

  function fitViewToViewport() {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;

    if (!viewport || !canvas) {
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const contentWidth = canvas.offsetWidth;
    const contentHeight = canvas.offsetHeight;

    if (contentWidth === 0 || contentHeight === 0) {
      return;
    }

    const padding = viewMode === "hex" ? HEX_FIT_PADDING : DEFAULT_FIT_PADDING;
    const fittedScale = clamp(
      Math.min(
        (viewportWidth - padding * 2) / contentWidth,
        (viewportHeight - padding * 2) / contentHeight,
      ) * (viewMode === "hex" ? HEX_FIT_SCALE_MULTIPLIER : 1),
      getMinScale(viewMode),
      MAX_SCALE,
    );

    updateView({
      scale: fittedScale,
      x: (viewportWidth - contentWidth * fittedScale) / 2,
      y: (viewportHeight - contentHeight * fittedScale) / 2,
    });
  }

  function zoomAtPoint(clientX, clientY, nextScale, containerRect) {
    const currentView = viewRef.current;
    const boundedScale = clamp(nextScale, getMinScale(viewMode), MAX_SCALE);

    if (boundedScale === currentView.scale) {
      return;
    }

    const pointX = clientX - containerRect.left;
    const pointY = clientY - containerRect.top;
    const contentX = (pointX - currentView.x) / currentView.scale;
    const contentY = (pointY - currentView.y) / currentView.scale;

    updateView({
      scale: boundedScale,
      x: pointX - contentX * boundedScale,
      y: pointY - contentY * boundedScale,
    });
  }

  function handlePointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (event.pointerType === "touch") {
      setHoveredElectorateNumber(null);
    }

    if (activePointersRef.current.size >= 2) {
      const viewportRect = event.currentTarget.getBoundingClientRect();
      const gestureState = getPointerGestureState(
        activePointersRef.current,
        viewportRect,
      );

      dragStateRef.current = null;
      setIsDragging(true);

      if (gestureState) {
        const currentView = viewRef.current;

        pinchStateRef.current = {
          startDistance: gestureState.distance,
          anchorContentX:
            (gestureState.midpointX - currentView.x) / currentView.scale,
          anchorContentY:
            (gestureState.midpointY - currentView.y) / currentView.scale,
          startScale: viewRef.current.scale,
        };
      }

      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewRef.current.x,
      startY: viewRef.current.y,
      moved: false,
      electorateNumber: getElectorateNumberFromTarget(event.target),
    };

    setIsDragging(false);
  }

  function handleMapPointerMove(event) {
    const viewportRect = event.currentTarget.getBoundingClientRect();
    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (event.pointerType === "touch") {
      setHoveredElectorateNumber(null);
    } else {
      setHoveredElectorateNumber(getElectorateNumberFromTarget(event.target));
      setTooltipPosition({
        x: event.clientX - viewportRect.left,
        y: event.clientY - viewportRect.top,
      });
    }

    if (activePointersRef.current.size >= 2 && pinchStateRef.current) {
      const gestureState = getPointerGestureState(
        activePointersRef.current,
        viewportRect,
      );
      const pinchState = pinchStateRef.current;

      if (!gestureState || pinchState.startDistance <= 0) {
        return;
      }

      const nextScale =
        pinchState.startScale * (gestureState.distance / pinchState.startDistance);
      const boundedScale = clamp(nextScale, getMinScale(viewMode), MAX_SCALE);

      setIsDragging(true);
      updateView({
        scale: boundedScale,
        x: gestureState.midpointX - pinchState.anchorContentX * boundedScale,
        y: gestureState.midpointY - pinchState.anchorContentY * boundedScale,
      });
      return;
    }

    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    const hasMoved =
      Math.abs(deltaX) > CLICK_DRAG_THRESHOLD ||
      Math.abs(deltaY) > CLICK_DRAG_THRESHOLD;

    dragStateRef.current = {
      ...dragState,
      moved: dragState.moved || hasMoved,
    };

    if (hasMoved) {
      setIsDragging(true);
    }

    updateView({
      ...viewRef.current,
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
    });
  }

  function handlePointerUp(event) {
    activePointersRef.current.delete(event.pointerId);
    const dragState = dragStateRef.current;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pinchStateRef.current) {
      pinchStateRef.current = null;

      const remainingPointers = [...activePointersRef.current.entries()];

      if (remainingPointers.length === 1) {
        const [remainingPointerId, remainingPointer] = remainingPointers[0];

        dragStateRef.current = {
          pointerId: remainingPointerId,
          startClientX: remainingPointer.clientX,
          startClientY: remainingPointer.clientY,
          startX: viewRef.current.x,
          startY: viewRef.current.y,
          moved: false,
          electorateNumber: null,
        };
        setIsDragging(false);
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
      return;
    }

    if (!dragState.moved && dragState.electorateNumber && onSelectElectorate) {
      onSelectElectorate(dragState.electorateNumber);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handleMapPointerLeave() {
    setHoveredElectorateNumber(null);
  }

  function handlePointerCancel(event) {
    activePointersRef.current.delete(event.pointerId);
    pinchStateRef.current = null;
    dragStateRef.current = null;
    setIsDragging(activePointersRef.current.size >= 2);
  }

  function handleWheel(event) {
    event.preventDefault();
    event.stopPropagation();

    const containerRect = event.currentTarget.getBoundingClientRect();
    const direction = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

    zoomAtPoint(
      event.clientX,
      event.clientY,
      viewRef.current.scale * direction,
      containerRect,
    );
  }

  function zoomIn() {
    const container = viewportRef.current;

    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    zoomAtPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      viewRef.current.scale * ZOOM_FACTOR,
      rect,
    );
  }

  function zoomOut() {
    const container = viewportRef.current;

    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    zoomAtPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      viewRef.current.scale / ZOOM_FACTOR,
      rect,
    );
  }

  function resetView() {
    fitViewToViewport();
    activePointersRef.current.clear();
    pinchStateRef.current = null;
    dragStateRef.current = null;
    setIsDragging(false);
  }

  return (
    <div className="map-panel">
      <div className="map-panel__controls">
        <div className="map-panel__view-toggle" role="tablist" aria-label="Map view">
          <button
            type="button"
            className={`map-panel__button${viewMode === "cartographic" ? " is-active" : ""}`}
            onClick={() => onViewModeChange?.("cartographic")}
          >
            Cartographic view
          </button>
          <button
            type="button"
            className={`map-panel__button${viewMode === "hex" ? " is-active" : ""}`}
            onClick={() => onViewModeChange?.("hex")}
          >
            Hex view
          </button>
        </div>
      </div>

      <div className="map-panel__controls">
        <button type="button" className="map-panel__button" onClick={zoomIn}>
          +
        </button>
        <button type="button" className="map-panel__button" onClick={zoomOut}>
          -
        </button>
        <button type="button" className="map-panel__button" onClick={resetView}>
          Reset
        </button>
      </div>

      <div
        className={`map-panel__viewport${isDragging ? " is-dragging" : ""}`}
        ref={viewportRef}
        aria-label="New Zealand electorate map"
        onPointerDown={handlePointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handleMapPointerLeave}
        onWheel={handleWheel}
      >
        {svgMarkup ? (
          <>
            <div
              className="map-panel__canvas"
              ref={canvasRef}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            {hoveredElectorate && !isDragging && (
              <div
                className="map-panel__tooltip"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                }}
              >
                <p className="map-panel__tooltip-title">
                  {hoveredElectorate.electorate_name}
                </p>
                <p className="map-panel__tooltip-body">
                  <span
                    className="map-panel__tooltip-party-dot"
                    style={{ backgroundColor: hoveredLeaderPartyColor }}
                    aria-hidden="true"
                  />
                  <span>{hoveredLeaderPartyName}</span>
                  <span className="map-panel__tooltip-separator">·</span>
                  <span>
                    Majority {hoveredMajority?.toLocaleString() ?? "0"}
                  </span>
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="map-panel__loading">Loading map…</div>
        )}
      </div>
    </div>
  );
}
