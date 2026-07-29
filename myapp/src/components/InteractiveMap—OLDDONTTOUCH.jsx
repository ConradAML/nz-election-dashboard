import { useEffect, useMemo, useRef, useState } from "react";
import {
  NEUTRAL_MAP_FILL,
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";

const DEFAULT_MIN_SCALE = 0.45;
const HEX_MIN_SCALE = 0.3;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.08;
const CLICK_DRAG_THRESHOLD = 8;
const MIN_VISIBLE_PX = 96;
const HIGHLIGHT_STROKE_COLOR = "#f4f1eb";
const HIGHLIGHT_STROKE_WIDTH = "5px";
const HIGHLIGHT_FILL_LIGHTEN = 0.4;
const DEFAULT_FIT_PADDING = 20;
const HEX_FIT_PADDING = 34;
const HEX_FIT_SCALE_MULTIPLIER = 0.8;
const CITY_PRESETS = {
  Auckland: [
    "Auckland_Central",
    "Botany",
    "Epsom",
    "Mangere",
    "Manurewa",
    "Maungakiekie",
    "Mt_Albert",
    "Mt_Roskill",
    "North_Shore",
    "Northcote",
    "Pakuranga",
    "Papakura",
    "Takanini",
    "Tamaki",
    "Upper_Harbour",
    "Whangaparaoa",
  ],
  Christchurch: [
    "Banks_Peninsula",
    "Christchurch_Central",
    "Christchurch_East",
    "Ilam",
    "Selwyn",
    "Wigram",
  ],
  Wellington: [
    "Hutt_South",
    "Kenepuru",
    "Remutaka",
    "Wellington_Bays",
    "Wellington_North",
  ],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMinScale(viewMode) {
  return viewMode === "hex" ? HEX_MIN_SCALE : DEFAULT_MIN_SCALE;
}

function styleWithRule(existingStyle, rule) {
  return existingStyle ? `${existingStyle} ${rule}` : rule;
}

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
    .replace(/_/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
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
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredElectorateNumber, setHoveredElectorateNumber] = useState(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const svgRootRef = useRef(null);
  const highlightLayersRef = useRef(new Map());
  const tooltipRef = useRef(null);
  const tooltipPositionRef = useRef({ x: 0, y: 0 });
  const hoveredElectorateNumberRef = useRef(null);
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const frameRef = useRef(null);
  const hasAutoFittedRef = useRef(false);
  const previousHighlightRef = useRef({
    hoveredElectorateNumber: null,
    selectedElectorateNumber: null,
  });
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
    const highlightRoot = documentRoot.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );

    highlightRoot.setAttribute("data-highlight-root", "true");
    highlightRoot.setAttribute("pointer-events", "none");

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
      const baseFill =
        PARTY_COLORS[mapEntry?.winner_party_code] ??
        (mapEntry?.has_svg_match ? NEUTRAL_PARTY_COLOR : NEUTRAL_MAP_FILL);
      const highlightFill = lightenColor(baseFill, HIGHLIGHT_FILL_LIGHTEN);

      if (electorateNumber) {
        layer.setAttribute("data-electorate-no", electorateNumber);
      }

      layer.setAttribute("data-base-fill", baseFill);

      const shapes =
        layer.tagName.toLowerCase() === "path"
          ? [layer]
          : layer.querySelectorAll("path");

      for (const shape of shapes) {
        let nextStyle = shape.getAttribute("style") || "";
        nextStyle = styleWithRule(nextStyle, `fill: ${baseFill};`);
        nextStyle = styleWithRule(nextStyle, "pointer-events: auto;");

        shape.setAttribute("style", nextStyle.trim());
        shape.setAttribute("fill", baseFill);
      }

      if (!electorateNumber) {
        continue;
      }

      const highlightLayer = layer.cloneNode(true);

      highlightLayer.removeAttribute("id");
      highlightLayer.setAttribute("data-highlight-for", electorateNumber);
      highlightLayer.setAttribute(
        "style",
        "pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 120ms ease;",
      );

      const highlightShapes =
        highlightLayer.tagName.toLowerCase() === "path"
          ? [highlightLayer]
          : highlightLayer.querySelectorAll("path");

      for (const shape of highlightShapes) {
        shape.removeAttribute("id");

        let nextStyle = shape.getAttribute("style") || "";
        nextStyle = styleWithRule(nextStyle, `fill: ${highlightFill};`);
        nextStyle = styleWithRule(nextStyle, `stroke: ${HIGHLIGHT_STROKE_COLOR};`);
        nextStyle = styleWithRule(nextStyle, `stroke-width: ${HIGHLIGHT_STROKE_WIDTH};`);
        nextStyle = styleWithRule(nextStyle, "stroke-linejoin: round;");
        nextStyle = styleWithRule(nextStyle, "stroke-linecap: round;");
        nextStyle = styleWithRule(nextStyle, "vector-effect: non-scaling-stroke;");
        nextStyle = styleWithRule(nextStyle, "paint-order: stroke;");
        nextStyle = styleWithRule(nextStyle, "pointer-events: none;");

        shape.setAttribute("style", nextStyle.trim());
        shape.setAttribute("fill", highlightFill);
        shape.setAttribute("stroke", HIGHLIGHT_STROKE_COLOR);
        shape.setAttribute("stroke-width", HIGHLIGHT_STROKE_WIDTH);
      }

      highlightRoot.appendChild(highlightLayer);
    }

    svgElement.appendChild(highlightRoot);

    return new XMLSerializer().serializeToString(svgElement);
  }, [electorateWinners, nzMapMarkup]);

  useEffect(() => {
    hasAutoFittedRef.current = false;
  }, [nzMapMarkup]);

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

  useEffect(() => {
    const tooltip = tooltipRef.current;

    if (!tooltip) {
      return;
    }

    tooltip.style.left = `${tooltipPositionRef.current.x}px`;
    tooltip.style.top = `${tooltipPositionRef.current.y}px`;
  }, [hoveredElectorateNumber]);

  useEffect(() => {
    previousHighlightRef.current = {
      hoveredElectorateNumber: null,
      selectedElectorateNumber: null,
    };
    hoveredElectorateNumberRef.current = null;
    highlightLayersRef.current = new Map();
  }, [svgMarkup]);

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

    canvas.dataset.scheduleTransform = "ready";
    canvas.__scheduleTransform = scheduleTransform;
    svgRootRef.current = canvas.querySelector("svg");

    const nextHighlightLayers = new Map();

    for (const layer of svgRootRef.current?.querySelectorAll(
      "[data-highlight-for]",
    ) ?? []) {
      const electorateNumber = layer.getAttribute("data-highlight-for");

      if (!electorateNumber) {
        continue;
      }

      const currentLayers = nextHighlightLayers.get(electorateNumber) ?? [];
      currentLayers.push(layer);
      nextHighlightLayers.set(electorateNumber, currentLayers);
    }

    highlightLayersRef.current = nextHighlightLayers;
    scheduleTransform();

    if (!hasAutoFittedRef.current) {
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
        svgRootRef.current = null;
        highlightLayersRef.current = new Map();
        delete canvas.__scheduleTransform;
      };
    }

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      svgRootRef.current = null;
      highlightLayersRef.current = new Map();
      delete canvas.__scheduleTransform;
    };
  }, [svgMarkup]);

  useEffect(() => {
    if (!svgRootRef.current) {
      return;
    }

    const previousHighlight = previousHighlightRef.current;

    function getHighlightLayers(electorateNumber) {
      if (!electorateNumber) {
        return [];
      }

      return highlightLayersRef.current.get(String(electorateNumber)) ?? [];
    }

    function hideElectorateHighlight(electorateNumber) {
      for (const layer of getHighlightLayers(electorateNumber)) {
        layer.style.opacity = "0";
        layer.style.visibility = "hidden";
      }
    }

    function showElectorateHighlight(electorateNumber) {
      for (const layer of getHighlightLayers(electorateNumber)) {
        layer.parentNode?.appendChild(layer);
        layer.style.opacity = "1";
        layer.style.visibility = "visible";
      }
    }

    const resetTargets = new Set([
      previousHighlight.hoveredElectorateNumber,
      previousHighlight.selectedElectorateNumber,
    ]);

    for (const electorateNumber of resetTargets) {
      if (
        electorateNumber &&
        electorateNumber !== hoveredElectorateNumber &&
        electorateNumber !== selectedElectorateNumber
      ) {
        hideElectorateHighlight(electorateNumber);
      }
    }

    if (hoveredElectorateNumber) {
      hideElectorateHighlight(hoveredElectorateNumber);
    }

    if (selectedElectorateNumber) {
      hideElectorateHighlight(selectedElectorateNumber);
    }

    if (selectedElectorateNumber) {
      showElectorateHighlight(selectedElectorateNumber);
    }

    if (
      hoveredElectorateNumber &&
      hoveredElectorateNumber !== selectedElectorateNumber
    ) {
      showElectorateHighlight(hoveredElectorateNumber);
    }

    previousHighlightRef.current = {
      hoveredElectorateNumber,
      selectedElectorateNumber,
    };
  }, [hoveredElectorateNumber, selectedElectorateNumber, svgMarkup]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return undefined;
    }

    function handleViewportWheel(event) {
      event.preventDefault();

      const containerRect = viewport.getBoundingClientRect();
      const direction = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

      zoomAtPoint(
        event.clientX,
        event.clientY,
        viewRef.current.scale * direction,
        containerRect,
      );
    }

    viewport.addEventListener("wheel", handleViewportWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleViewportWheel);
    };
  }, [viewMode]);

  function scheduleTransform() {
    const canvas = canvasRef.current;
    canvas?.__scheduleTransform?.();
  }

  function updateTooltipPosition(clientX, clientY, viewportRect) {
    const nextPosition = {
      x: clientX - viewportRect.left,
      y: clientY - viewportRect.top,
    };

    tooltipPositionRef.current = nextPosition;

    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${nextPosition.x}px`;
      tooltipRef.current.style.top = `${nextPosition.y}px`;
    }
  }

  function updateView(nextView) {
    viewRef.current = clampViewToBounds(
      nextView,
      viewportRef.current,
      canvasRef.current,
    );
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
    const fitScaleMultiplier =
      viewMode === "hex" ? HEX_FIT_SCALE_MULTIPLIER : 1;
    const fittedScale = clamp(
      Math.min(
        (viewportWidth - padding * 2) / contentWidth,
        (viewportHeight - padding * 2) / contentHeight,
      ) * fitScaleMultiplier,
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

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;
    const hoveredElectorate = getElectorateNumberFromTarget(event.target);
    const viewportRect = event.currentTarget.getBoundingClientRect();

    updateTooltipPosition(event.clientX, event.clientY, viewportRect);

    if (hoveredElectorate !== hoveredElectorateNumberRef.current) {
      hoveredElectorateNumberRef.current = hoveredElectorate;
      setHoveredElectorateNumber(hoveredElectorate);
    }

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
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragState.moved && dragState.electorateNumber && onSelectElectorate) {
      onSelectElectorate(dragState.electorateNumber);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handlePointerLeave() {
    dragStateRef.current = null;
    setIsDragging(false);
    hoveredElectorateNumberRef.current = null;
    setHoveredElectorateNumber(null);
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
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function zoomToCity(cityName) {
    const viewport = viewportRef.current;
    const svgRoot = svgRootRef.current;

    if (!viewport || !svgRoot) {
      return;
    }

    const targetIds = CITY_PRESETS[cityName] ?? [];
    const boxes = targetIds
      .map((id) => svgRoot.querySelector(`#${CSS.escape(id)}`))
      .filter(Boolean)
      .map((element) => element.getBBox())
      .filter((box) => box.width > 0 && box.height > 0);

    if (boxes.length === 0) {
      return;
    }

    const bounds = boxes.reduce(
      (currentBounds, box) => ({
        minX: Math.min(currentBounds.minX, box.x),
        minY: Math.min(currentBounds.minY, box.y),
        maxX: Math.max(currentBounds.maxX, box.x + box.width),
        maxY: Math.max(currentBounds.maxY, box.y + box.height),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const padding = 36;
    const targetWidth = bounds.maxX - bounds.minX;
    const targetHeight = bounds.maxY - bounds.minY;
    const nextScale = clamp(
      Math.min(
        (viewportWidth - padding * 2) / targetWidth,
        (viewportHeight - padding * 2) / targetHeight,
      ),
      getMinScale(viewMode),
      MAX_SCALE,
    );

    updateView({
      scale: nextScale,
      x: (viewportWidth - targetWidth * nextScale) / 2 - bounds.minX * nextScale,
      y: (viewportHeight - targetHeight * nextScale) / 2 - bounds.minY * nextScale,
    });
    dragStateRef.current = null;
    setIsDragging(false);
  }

  return (
    <div className="map-panel">
      <div className="map-panel__controls">
        <div
          className="map-panel__view-toggle"
          role="tablist"
          aria-label="Map view"
        >
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
        <button
          type="button"
          className="map-panel__button"
          onClick={() => zoomToCity("Auckland")}
        >
          Auckland
        </button>
        <button
          type="button"
          className="map-panel__button"
          onClick={() => zoomToCity("Christchurch")}
        >
          Christchurch
        </button>
        <button
          type="button"
          className="map-panel__button"
          onClick={() => zoomToCity("Wellington")}
        >
          Wellington
        </button>
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        aria-label="Interactive New Zealand electorate map"
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
                ref={tooltipRef}
                style={{
                  left: `${tooltipPositionRef.current.x}px`,
                  top: `${tooltipPositionRef.current.y}px`,
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
