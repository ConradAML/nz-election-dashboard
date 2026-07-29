import { useEffect, useMemo, useRef, useState } from "react";
import {
  NEUTRAL_MAP_FILL,
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";

const CARTOGRAPHIC_VIEW = "cartographic";
const HEX_VIEW = "hex";
const GENERAL_ELECTORATES = "general";
const MAORI_ELECTORATES = "maori";
const DEFAULT_MIN_SCALE = 0.45;
const HEX_MIN_SCALE = 0.28;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.08;
const CLICK_DRAG_THRESHOLD = 8;
const MIN_VISIBLE_PX = 96;
const SELECTED_STROKE_COLOR = "#f4f1eb";
const DEFAULT_SELECTED_STROKE_WIDTH = "2.8px";
const HEX_SELECTED_STROKE_WIDTH = "8px";
const MAORI_HEX_SELECTED_STROKE_WIDTH = "24px";
const SELECTED_FILL_LIGHTEN = 0.22;
const DEFAULT_FIT_PADDING = 20;
const HEX_FIT_PADDING = 40;
const HEX_FIT_SCALE_MULTIPLIER = 0.5;
const MOBILE_BREAKPOINT = 640;
const MOBILE_HEX_FIT_PADDING = 24;
const MOBILE_HEX_FIT_SCALE_MULTIPLIER = 0.68;
const MAP_VIEW_TRANSITION_DURATION_MS = 560;
const MORPH_POINT_COUNT = 36;

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
    .replace(/wakaurau/g, "makaurau")
    .replace(/wairiki/g, "waiariki")
    .replace(/waiariki\d+$/g, "waiariki")
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
  return viewMode === HEX_VIEW ? HEX_MIN_SCALE : DEFAULT_MIN_SCALE;
}

function getSelectedStrokeWidth(viewMode, electorateGroup) {
  if (viewMode === HEX_VIEW && electorateGroup === MAORI_ELECTORATES) {
    return MAORI_HEX_SELECTED_STROKE_WIDTH;
  }

  return viewMode === HEX_VIEW
    ? HEX_SELECTED_STROKE_WIDTH
    : DEFAULT_SELECTED_STROKE_WIDTH;
}

function getDefaultStrokeColor(viewMode, electorateGroup) {
  if (viewMode === CARTOGRAPHIC_VIEW && electorateGroup === MAORI_ELECTORATES) {
    return "#ffffff";
  }

  return null;
}

function getFitOptions(viewMode, viewportWidth) {
  if (viewMode !== HEX_VIEW) {
    return {
      padding: DEFAULT_FIT_PADDING,
      scaleMultiplier: 1,
    };
  }

  if (viewportWidth <= MOBILE_BREAKPOINT) {
    return {
      padding: MOBILE_HEX_FIT_PADDING,
      scaleMultiplier: MOBILE_HEX_FIT_SCALE_MULTIPLIER,
    };
  }

  return {
    padding: HEX_FIT_PADDING,
    scaleMultiplier: HEX_FIT_SCALE_MULTIPLIER,
  };
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

function viewToTransform(view) {
  return `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
}

function computeFittedView({
  viewMode,
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight,
}) {
  const { padding, scaleMultiplier } = getFitOptions(viewMode, viewportWidth);
  const fittedScale = clamp(
    Math.min(
      (viewportWidth - padding * 2) / contentWidth,
      (viewportHeight - padding * 2) / contentHeight,
    ) * scaleMultiplier,
    getMinScale(viewMode),
    MAX_SCALE,
  );

  return {
    scale: fittedScale,
    x: (viewportWidth - contentWidth * fittedScale) / 2,
    y: (viewportHeight - contentHeight * fittedScale) / 2,
  };
}

function easeInOutCubic(progress) {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - ((-2 * progress + 2) ** 3) / 2;
}

function buildStyledSvgMarkup({
  rawMarkup,
  electorateWinners,
  hoveredElectorateNumber,
  selectedElectorateNumber,
  mapKind,
  electorateGroup,
}) {
  if (!rawMarkup || !electorateWinners) {
    return "";
  }

  const cleanedMarkup = rawMarkup.replace(/<\?xml[\s\S]*?\?>/, "").trim();
  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(cleanedMarkup, "image/svg+xml");
  const svgElement = documentRoot.documentElement;
  const byElectorateNumber = electorateWinners.by_electorate_number ?? {};
  const bySvgId = electorateWinners.by_svg_id ?? {};
  const byNormalizedKey = new Map();
  const selectedStrokeWidth = getSelectedStrokeWidth(mapKind, electorateGroup);
  const defaultStrokeColor = getDefaultStrokeColor(mapKind, electorateGroup);
  let hoveredLayer = null;
  let selectedLayer = null;

  for (const [svgId, entry] of Object.entries(bySvgId)) {
    byNormalizedKey.set(normalizeElectorateKey(svgId), entry);
  }

  for (const entry of Object.values(byElectorateNumber)) {
    byNormalizedKey.set(normalizeElectorateKey(entry?.electorate_name), entry);
  }

  for (const layer of svgElement.querySelectorAll("g[id], path[id]")) {
    const parentElectorateLayer =
      layer.parentElement?.closest("[data-electorate-no]");
    const seededElectorateNumber =
      layer.getAttribute("data-electorate-no")
      ?? parentElectorateLayer?.getAttribute("data-electorate-no");
    const normalizedLayerId = normalizeElectorateKey(layer.id);
    const normalizedParentLayerId = normalizeElectorateKey(
      layer.parentElement?.closest("g[id], path[id]")?.id,
    );
    const mapEntry =
      (seededElectorateNumber && byElectorateNumber[seededElectorateNumber]) ||
      bySvgId[layer.id] ||
      byNormalizedKey.get(normalizedLayerId) ||
      byNormalizedKey.get(normalizedParentLayerId);
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

      if (defaultStrokeColor) {
        nextStyle = styleWithRule(nextStyle, `stroke: ${defaultStrokeColor};`);
        nextStyle = styleWithRule(nextStyle, "stroke-linejoin: round;");
        nextStyle = styleWithRule(nextStyle, "stroke-linecap: round;");
        shape.setAttribute("stroke", defaultStrokeColor);
      }

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
}

function getElectorateLayerLookup(svgRoot) {
  const lookup = new Map();

  for (const layer of svgRoot?.querySelectorAll("g[data-electorate-no], path[data-electorate-no]") ?? []) {
    const electorateNumber = layer.getAttribute("data-electorate-no");

    if (electorateNumber) {
      lookup.set(electorateNumber, layer);
    }
  }

  return lookup;
}

function getRepresentativePath(layer) {
  if (!layer) {
    return null;
  }

  if (layer.tagName.toLowerCase() === "path") {
    return layer;
  }

  let longestPath = null;
  let longestLength = -1;

  for (const path of layer.querySelectorAll("path")) {
    try {
      const length = path.getTotalLength();

      if (Number.isFinite(length) && length > longestLength) {
        longestLength = length;
        longestPath = path;
      }
    } catch {
      // Ignore malformed or non-measurable paths.
    }
  }

  return longestPath;
}

function samplePathPoints(path, count, containerRect) {
  if (!path) {
    return [];
  }

  try {
    const totalLength = path.getTotalLength();
    const ctm = path.getScreenCTM();
    const svg = path.ownerSVGElement;

    if (!Number.isFinite(totalLength) || totalLength <= 0 || !ctm || !svg) {
      return [];
    }

    const svgPoint = svg.createSVGPoint();
    const points = [];

    for (let index = 0; index < count; index += 1) {
      const sample =
        path.getPointAtLength((index / count) * totalLength);
      svgPoint.x = sample.x;
      svgPoint.y = sample.y;
      const transformed = svgPoint.matrixTransform(ctm);

      points.push({
        x: transformed.x - containerRect.left,
        y: transformed.y - containerRect.top,
      });
    }

    return points;
  } catch {
    return [];
  }
}

function reversePoints(points) {
  if (points.length === 0) {
    return points;
  }

  return [points[0], ...points.slice(1).reverse()];
}

function rotatePoints(points, offset) {
  if (points.length === 0) {
    return points;
  }

  const normalizedOffset =
    ((offset % points.length) + points.length) % points.length;

  return points
    .slice(normalizedOffset)
    .concat(points.slice(0, normalizedOffset));
}

function squaredDistance(a, b) {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;

  return deltaX * deltaX + deltaY * deltaY;
}

function findBestAlignedPoints(sourcePoints, targetPoints) {
  if (sourcePoints.length !== targetPoints.length || sourcePoints.length === 0) {
    return targetPoints;
  }

  const candidateSets = [targetPoints, reversePoints(targetPoints)];
  let bestPoints = targetPoints;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidateSets) {
    for (let offset = 0; offset < candidate.length; offset += 1) {
      const rotated = rotatePoints(candidate, offset);
      let score = 0;

      for (let index = 0; index < sourcePoints.length; index += 1) {
        score += squaredDistance(sourcePoints[index], rotated[index]);
      }

      if (score < bestScore) {
        bestScore = score;
        bestPoints = rotated;
      }
    }
  }

  return bestPoints;
}

function interpolatePoints(sourcePoints, targetPoints, progress) {
  return sourcePoints.map((point, index) => ({
    x: point.x + (targetPoints[index].x - point.x) * progress,
    y: point.y + (targetPoints[index].y - point.y) * progress,
  }));
}

function buildPathData(points) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
    )
    .join(" ")
    .concat(" Z");
}

function buildMorphItems({
  fromSvgRoot,
  toSvgRoot,
  containerRect,
}) {
  const fromLayers = getElectorateLayerLookup(fromSvgRoot);
  const toLayers = getElectorateLayerLookup(toSvgRoot);
  const electorateNumbers = new Set([
    ...fromLayers.keys(),
    ...toLayers.keys(),
  ]);
  const items = [];

  for (const electorateNumber of electorateNumbers) {
    const fromPath = getRepresentativePath(fromLayers.get(electorateNumber));
    const toPath = getRepresentativePath(toLayers.get(electorateNumber));

    if (!fromPath || !toPath) {
      continue;
    }

    const sourcePoints = samplePathPoints(fromPath, MORPH_POINT_COUNT, containerRect);
    const rawTargetPoints = samplePathPoints(toPath, MORPH_POINT_COUNT, containerRect);

    if (sourcePoints.length !== MORPH_POINT_COUNT || rawTargetPoints.length !== MORPH_POINT_COUNT) {
      continue;
    }

    const targetPoints = findBestAlignedPoints(sourcePoints, rawTargetPoints);
    const sourceStyle = window.getComputedStyle(fromPath);
    const targetStyle = window.getComputedStyle(toPath);

    items.push({
      electorateNumber,
      sourcePoints,
      targetPoints,
      fill: targetStyle.fill || sourceStyle.fill || NEUTRAL_MAP_FILL,
      stroke: targetStyle.stroke || sourceStyle.stroke || SELECTED_STROKE_COLOR,
      strokeWidth: targetStyle.strokeWidth || sourceStyle.strokeWidth || "1px",
    });
  }

  return items;
}

export default function InteractiveMap({
  electorateWinners,
  electorateDetails,
  cartographicMapMarkup,
  hexMapMarkup,
  electorateGroup = GENERAL_ELECTORATES,
  selectedElectorateNumber,
  onSelectElectorate,
  viewMode = CARTOGRAPHIC_VIEW,
  onViewModeChange,
  savedView,
  onViewSnapshot,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredElectorateNumber, setHoveredElectorateNumber] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [displayedViewMode, setDisplayedViewMode] = useState(viewMode);
  const [transitionState, setTransitionState] = useState(null);
  const [morphItems, setMorphItems] = useState([]);
  const [morphProgress, setMorphProgress] = useState(0);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const transitionLayerRef = useRef(null);
  const transitionFromRef = useRef(null);
  const transitionToRef = useRef(null);
  const modeViewCacheRef = useRef({
    [CARTOGRAPHIC_VIEW]: null,
    [HEX_VIEW]: null,
  });
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const pinchStateRef = useRef(null);
  const frameRef = useRef(null);
  const transitionFrameRef = useRef(null);
  const hasAutoFittedRef = useRef(false);
  const electorateDetailsLookup =
    electorateDetails?.by_electorate_number ?? {};

  const styledSvgMarkups = useMemo(() => {
    const resolvedHexMarkup = hexMapMarkup ?? cartographicMapMarkup;

    return {
      [CARTOGRAPHIC_VIEW]: buildStyledSvgMarkup({
        rawMarkup: cartographicMapMarkup,
        electorateWinners,
        hoveredElectorateNumber,
        selectedElectorateNumber,
        mapKind: CARTOGRAPHIC_VIEW,
        electorateGroup,
      }),
      [HEX_VIEW]: buildStyledSvgMarkup({
        rawMarkup: resolvedHexMarkup,
        electorateWinners,
        hoveredElectorateNumber,
        selectedElectorateNumber,
        mapKind: HEX_VIEW,
        electorateGroup,
      }),
    };
  }, [
    cartographicMapMarkup,
    electorateGroup,
    electorateWinners,
    hexMapMarkup,
    hoveredElectorateNumber,
    selectedElectorateNumber,
  ]);

  const baseSvgMarkup = styledSvgMarkups[displayedViewMode] ?? "";
  const isTransitioning = transitionState !== null;

  const morphPathItems = useMemo(() => {
    return morphItems.map((item) => ({
      ...item,
      d: buildPathData(
        interpolatePoints(item.sourcePoints, item.targetPoints, morphProgress),
      ),
    }));
  }, [morphItems, morphProgress]);

  useEffect(() => {
    if (savedView) {
      modeViewCacheRef.current[viewMode] = savedView;
    }
  }, [savedView, viewMode]);

  useEffect(() => {
    hasAutoFittedRef.current = false;
  }, [baseSvgMarkup]);

  useEffect(() => {
    if (!styledSvgMarkups[CARTOGRAPHIC_VIEW] || !styledSvgMarkups[HEX_VIEW]) {
      setDisplayedViewMode(viewMode);
      return;
    }

    if (displayedViewMode === viewMode) {
      return;
    }

    setHoveredElectorateNumber(null);
    setTransitionState({
      fromViewMode: displayedViewMode,
      toViewMode: viewMode,
      key: `${displayedViewMode}-${viewMode}-${Date.now()}`,
    });
  }, [displayedViewMode, styledSvgMarkups, viewMode]);

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

    const cachedView = modeViewCacheRef.current[displayedViewMode];
    const effectiveSavedView = cachedView ?? savedView;

    if (effectiveSavedView) {
      viewRef.current = { ...effectiveSavedView };
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
  }, [baseSvgMarkup, displayedViewMode, savedView]);

  useEffect(() => {
    if (
      !transitionState ||
      !viewportRef.current ||
      !transitionLayerRef.current ||
      !transitionFromRef.current ||
      !transitionToRef.current
    ) {
      return undefined;
    }

    const containerRect = viewportRef.current.getBoundingClientRect();
    const fromSvgRoot = transitionFromRef.current.querySelector("svg");
    const toSvgRoot = transitionToRef.current.querySelector("svg");

    if (!fromSvgRoot || !toSvgRoot) {
      return undefined;
    }

    const currentView = { ...viewRef.current };
    const cachedTargetView =
      modeViewCacheRef.current[transitionState.toViewMode];

    transitionFromRef.current.style.transform = "";
    transitionToRef.current.style.transform = "";

    const targetSvgRect = toSvgRoot.getBoundingClientRect();
    const targetView = cachedTargetView ?? computeFittedView({
      viewMode: transitionState.toViewMode,
      viewportWidth: viewportRef.current.clientWidth,
      viewportHeight: viewportRef.current.clientHeight,
      contentWidth: targetSvgRect.width,
      contentHeight: targetSvgRect.height,
    });

    modeViewCacheRef.current[transitionState.toViewMode] = targetView;
    onViewSnapshot?.({ ...targetView });
    viewRef.current = { ...targetView };
    scheduleTransform();

    transitionFromRef.current.style.transform = viewToTransform(currentView);
    transitionToRef.current.style.transform = viewToTransform(targetView);

    const nextMorphItems = buildMorphItems({
      fromSvgRoot,
      toSvgRoot,
      containerRect,
    });

    setMorphItems(nextMorphItems);
    setMorphProgress(0);

    const startedAt = performance.now();

    function step(now) {
      const rawProgress = Math.min(
        (now - startedAt) / MAP_VIEW_TRANSITION_DURATION_MS,
        1,
      );
      const easedProgress = easeInOutCubic(rawProgress);

      setMorphProgress(easedProgress);

      if (rawProgress < 1) {
        transitionFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      setDisplayedViewMode(transitionState.toViewMode);
      transitionFrameRef.current = window.requestAnimationFrame(() => {
        transitionFrameRef.current = null;
        setTransitionState(null);
        setMorphItems([]);
        setMorphProgress(0);
      });
    }

    transitionFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
    };
  }, [transitionState]);

  useEffect(() => () => {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
    }
  }, []);

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
    modeViewCacheRef.current[displayedViewMode] = { ...viewRef.current };
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

    updateView(
      computeFittedView({
        viewMode: displayedViewMode,
        viewportWidth,
        viewportHeight,
        contentWidth,
        contentHeight,
      }),
    );
  }

  function zoomAtPoint(clientX, clientY, nextScale, containerRect) {
    const currentView = viewRef.current;
    const boundedScale = clamp(
      nextScale,
      getMinScale(displayedViewMode),
      MAX_SCALE,
    );

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
    if (isTransitioning) {
      return;
    }

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
    if (isTransitioning) {
      return;
    }

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
      const boundedScale = clamp(
        nextScale,
        getMinScale(displayedViewMode),
        MAX_SCALE,
      );

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
    if (isTransitioning) {
      return;
    }

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

    if (!dragState || dragState.pointerId !== event.pointerId) {
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
    if (isTransitioning) {
      return;
    }

    activePointersRef.current.delete(event.pointerId);
    pinchStateRef.current = null;
    dragStateRef.current = null;
    setIsDragging(activePointersRef.current.size >= 2);
  }

  function handleWheel(event) {
    if (isTransitioning) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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

    if (!container || isTransitioning) {
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

    if (!container || isTransitioning) {
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
    if (isTransitioning) {
      return;
    }

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
            className={`map-panel__button${viewMode === CARTOGRAPHIC_VIEW ? " is-active" : ""}`}
            onClick={() => onViewModeChange?.(CARTOGRAPHIC_VIEW)}
            disabled={isTransitioning}
          >
            Cartographic view
          </button>
          <button
            type="button"
            className={`map-panel__button${viewMode === HEX_VIEW ? " is-active" : ""}`}
            onClick={() => onViewModeChange?.(HEX_VIEW)}
            disabled={isTransitioning}
          >
            Hex view
          </button>
        </div>
      </div>

      <div className="map-panel__controls">
        <button
          type="button"
          className="map-panel__button"
          onClick={zoomIn}
          disabled={isTransitioning}
        >
          +
        </button>
        <button
          type="button"
          className="map-panel__button"
          onClick={zoomOut}
          disabled={isTransitioning}
        >
          -
        </button>
        <button
          type="button"
          className="map-panel__button"
          onClick={resetView}
          disabled={isTransitioning}
        >
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
        {baseSvgMarkup ? (
          <>
            <div className="map-panel__canvas" ref={canvasRef}>
              <div
                className={`map-panel__svg-layer${isTransitioning ? " is-hidden" : ""}`}
                dangerouslySetInnerHTML={{ __html: baseSvgMarkup }}
              />
            </div>
            {transitionState && (
              <div
                className="map-panel__morph-layer"
                ref={transitionLayerRef}
                aria-hidden="true"
              >
                <div
                  className="map-panel__morph-measure"
                  ref={transitionFromRef}
                  dangerouslySetInnerHTML={{
                    __html: styledSvgMarkups[transitionState.fromViewMode],
                  }}
                />
                <div
                  className="map-panel__morph-measure"
                  ref={transitionToRef}
                  dangerouslySetInnerHTML={{
                    __html: styledSvgMarkups[transitionState.toViewMode],
                  }}
                />
                <svg
                  className="map-panel__morph-svg"
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${Math.max(viewportRef.current?.clientWidth ?? 1, 1)} ${Math.max(viewportRef.current?.clientHeight ?? 1, 1)}`}
                  preserveAspectRatio="none"
                >
                  {morphPathItems.map((item) => (
                    <path
                      key={item.electorateNumber}
                      d={item.d}
                      fill={item.fill}
                      stroke={item.stroke}
                      strokeWidth={item.strokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>
            )}
            {hoveredElectorate && !isDragging && !isTransitioning && (
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
