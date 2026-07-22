import { useEffect, useMemo, useRef, useState } from "react";
import nzMapMarkup from "../../../nzmap.svg?raw";
import electorateWinners from "../../../electorate_winners.json";
import {
  NEUTRAL_MAP_FILL,
  NEUTRAL_PARTY_COLOR,
  PARTY_COLORS,
} from "../constants/partyColors";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.08;
const CLICK_DRAG_THRESHOLD = 8;
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

function styleWithRule(existingStyle, rule) {
  return existingStyle ? `${existingStyle} ${rule}` : rule;
}

function getElectorateNumberFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const layer = target.closest("[data-electorate-no]");
  return layer?.getAttribute("data-electorate-no") ?? null;
}

export default function InteractiveMap({
  selectedElectorateNumber,
  onSelectElectorate,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const svgRootRef = useRef(null);
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const frameRef = useRef(null);

  const svgMarkup = useMemo(() => {
    const cleanedMarkup = nzMapMarkup.replace(/<\?xml[\s\S]*?\?>/, "").trim();
    const parser = new DOMParser();
    const documentRoot = parser.parseFromString(cleanedMarkup, "image/svg+xml");
    const svgElement = documentRoot.documentElement;
    const byElectorateNumber = electorateWinners.by_electorate_number ?? {};
    const bySvgId = electorateWinners.by_svg_id ?? {};

    for (const layer of svgElement.querySelectorAll("g[id], path[id]")) {
      const seededElectorateNumber = layer.getAttribute("data-electorate-no");
      const mapEntry =
        (seededElectorateNumber && byElectorateNumber[seededElectorateNumber]) ||
        bySvgId[layer.id];
      const electorateNumber =
        mapEntry?.electorate_number ?? seededElectorateNumber ?? null;
      const isSelected = electorateNumber === selectedElectorateNumber;
      const fill =
        PARTY_COLORS[mapEntry?.winner_party_code] ??
        (mapEntry?.has_svg_match ? NEUTRAL_PARTY_COLOR : NEUTRAL_MAP_FILL);
      const label = mapEntry?.electorate_name
        ? `${mapEntry.electorate_name}: ${mapEntry.winner_party_short_name || mapEntry.winner_party_name || "No party data"}`
        : `${layer.id.replaceAll("_", " ")}: no matching electorate result`;

      if (electorateNumber) {
        layer.setAttribute("data-electorate-no", electorateNumber);
      }

      const shapes =
        layer.tagName.toLowerCase() === "path"
          ? [layer]
          : layer.querySelectorAll("path");

      for (const shape of shapes) {
        let nextStyle = shape.getAttribute("style") || "";
        nextStyle = styleWithRule(nextStyle, `fill: ${fill};`);
        nextStyle = styleWithRule(nextStyle, "pointer-events: auto;");

        if (isSelected) {
          nextStyle = styleWithRule(nextStyle, "stroke: #111111;");
          nextStyle = styleWithRule(nextStyle, "stroke-width: 2.2px;");
        }

        shape.setAttribute("style", nextStyle.trim());
        shape.setAttribute("fill", fill);
      }

      let title = layer.querySelector("title");
      if (!title) {
        title = documentRoot.createElementNS("http://www.w3.org/2000/svg", "title");
        layer.prepend(title);
      }
      title.textContent = label;
    }

    return new XMLSerializer().serializeToString(svgElement);
  }, [selectedElectorateNumber]);

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
    scheduleTransform();

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      svgRootRef.current = null;
      delete canvas.__scheduleTransform;
    };
  }, [svgMarkup]);

  function scheduleTransform() {
    const canvas = canvasRef.current;
    canvas?.__scheduleTransform?.();
  }

  function zoomAtPoint(clientX, clientY, nextScale, containerRect) {
    const currentView = viewRef.current;
    const boundedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    if (boundedScale === currentView.scale) {
      return;
    }

    const pointX = clientX - containerRect.left;
    const pointY = clientY - containerRect.top;
    const contentX = (pointX - currentView.x) / currentView.scale;
    const contentY = (pointY - currentView.y) / currentView.scale;

    viewRef.current = {
      scale: boundedScale,
      x: pointX - contentX * boundedScale,
      y: pointY - contentY * boundedScale,
    };
    scheduleTransform();
  }

  function handleWheel(event) {
    event.preventDefault();

    const containerRect = event.currentTarget.getBoundingClientRect();
    const direction = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

    zoomAtPoint(
      event.clientX,
      event.clientY,
      viewRef.current.scale * direction,
      containerRect,
    );
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

    viewRef.current = {
      ...viewRef.current,
      x: dragState.startX + deltaX,
      y: dragState.startY + deltaY,
    };
    scheduleTransform();
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
    viewRef.current = { scale: 1, x: 0, y: 0 };
    dragStateRef.current = null;
    setIsDragging(false);
    scheduleTransform();
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
      MIN_SCALE,
      MAX_SCALE,
    );

    viewRef.current = {
      scale: nextScale,
      x: (viewportWidth - targetWidth * nextScale) / 2 - bounds.minX * nextScale,
      y: (viewportHeight - targetHeight * nextScale) / 2 - bounds.minY * nextScale,
    };
    dragStateRef.current = null;
    setIsDragging(false);
    scheduleTransform();
  }

  return (
    <div className="map-panel">
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
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Interactive New Zealand electorate map"
      >
        <div
          className="map-panel__canvas"
          ref={canvasRef}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
}
