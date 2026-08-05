import { useMemo, useRef, useState } from "react";

const ALL_REGION_MAP_IDS = [
  "Auckland",
  "Bay_of_Plenty",
  "Canterbury",
  "Gisborne",
  "Hawkes_Bay",
  "Manawatu-Wanganui",
  "Marlborough",
  "Nelson",
  "Northland",
  "Otago",
  "Southland",
  "Taranki",
  "Tasman",
  "Waikato",
  "Wellington",
  "West_Coast",
];

const REGION_MAP_ID_LOOKUP = {
  "Auckland Region": ["Auckland"],
  "Bay of Plenty Region": ["Bay_of_Plenty"],
  "Canterbury Region": ["Canterbury"],
  "Gisborne Region": ["Gisborne"],
  "Hawke's Bay Region": ["Hawkes_Bay"],
  "Manawatū-Whanganui Region": ["Manawatu-Wanganui"],
  "Marlborough Region": ["Marlborough"],
  "Nelson Region": ["Nelson"],
  "Northland Region": ["Northland"],
  "Otago Region": ["Otago"],
  "Southland Region": ["Southland"],
  "Taranaki Region": ["Taranki"],
  "Waikato Region": ["Waikato"],
  "Wellington Region": ["Wellington"],
  "West Coast/Tasman Region": ["West_Coast", "Tasman"],
};

const TARGET_REGION_WIDTH_FRACTION = 0.55;
const TARGET_REGION_HEIGHT_FRACTION = 0.55;

function formatShare(value) {
  return `${value.toFixed(1)}%`;
}

function formatChange(value) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function changeColor(value) {
  if (value > 0) return "#15803d";
  if (value < 0) return "#c62828";
  return "#666666";
}

function formatRegionTitle(regionName) {
  return regionName.replace(/ Region$/, "");
}

function parseViewBox(viewBoxValue) {
  const parts = (viewBoxValue || "0 0 295.47 421.98")
    .trim()
    .split(/\s+/)
    .map(Number);

  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return { minX: 0, minY: 0, width: 295.47, height: 421.98 };
  }

  const [minX, minY, width, height] = parts;
  return { minX, minY, width, height };
}

function parsePoints(pointsValue) {
  const values = (pointsValue || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => !Number.isNaN(value));

  const points = [];
  for (let index = 0; index < values.length - 1; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }

  return points;
}

function collectRegionBounds(regionNode) {
  const shapeNodes = [
    regionNode,
    ...regionNode.querySelectorAll("polygon, polyline"),
  ].filter((node) => ["polygon", "polyline"].includes(node.tagName?.toLowerCase()));

  const allPoints = shapeNodes.flatMap((node) => parsePoints(node.getAttribute("points")));

  if (!allPoints.length) {
    return null;
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function getCombinedRegionBounds(document, regionIds) {
  const boundsList = regionIds
    .map((regionId) => document.getElementById(regionId))
    .filter(Boolean)
    .map(collectRegionBounds)
    .filter(Boolean);

  if (!boundsList.length) {
    return null;
  }

  const minX = Math.min(...boundsList.map((bounds) => bounds.minX));
  const maxX = Math.max(...boundsList.map((bounds) => bounds.maxX));
  const minY = Math.min(...boundsList.map((bounds) => bounds.minY));
  const maxY = Math.max(...boundsList.map((bounds) => bounds.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function buildFocusedViewBox(regionBounds, fullViewBox) {
  const aspectRatio = fullViewBox.width / fullViewBox.height;
  let width = regionBounds.width / TARGET_REGION_WIDTH_FRACTION;
  let height = regionBounds.height / TARGET_REGION_HEIGHT_FRACTION;

  if (width / height > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }

  width = Math.min(width, fullViewBox.width);
  height = Math.min(height, fullViewBox.height);

  let minX = regionBounds.centerX - width / 2;
  let minY = regionBounds.centerY - height / 2;

  minX = Math.max(fullViewBox.minX, Math.min(minX, fullViewBox.minX + fullViewBox.width - width));
  minY = Math.max(fullViewBox.minY, Math.min(minY, fullViewBox.minY + fullViewBox.height - height));

  return [minX, minY, width, height].map((value) => value.toFixed(2)).join(" ");
}

function applyRegionStyle(regionNode, fillColor) {
  const styleValue = [
    `fill: ${fillColor}`,
    "stroke: rgba(255, 255, 255, 0.96)",
    "stroke-width: 0.5px",
    "vector-effect: non-scaling-stroke",
  ].join("; ");

  regionNode.setAttribute("style", styleValue);
  regionNode.querySelectorAll("path, polygon, polyline, rect, ellipse, circle").forEach((childNode) => {
    childNode.setAttribute("style", styleValue);
  });
}

function buildRegionMapMarkup(regionName, regionMapMarkup) {
  if (!regionName || !regionMapMarkup || regionName === "Māori electorates") {
    return null;
  }

  const activeRegionIds = REGION_MAP_ID_LOOKUP[regionName];

  if (!activeRegionIds?.length || typeof DOMParser === "undefined") {
    return null;
  }

  const cleanedMarkup = regionMapMarkup.replace(/<\?xml[\s\S]*?\?>\s*/, "");
  const parser = new DOMParser();
  const document = parser.parseFromString(cleanedMarkup, "image/svg+xml");
  const fullViewBox = parseViewBox(document.documentElement.getAttribute("viewBox"));
  const regionBounds = getCombinedRegionBounds(document, activeRegionIds);

  ALL_REGION_MAP_IDS.forEach((regionId) => {
    const regionNode = document.getElementById(regionId);

    if (!regionNode) {
      return;
    }

    applyRegionStyle(regionNode, "#e6e1d6");
  });

  activeRegionIds.forEach((regionId) => {
    const regionNode = document.getElementById(regionId);

    if (!regionNode) {
      return;
    }

    applyRegionStyle(regionNode, "#9eb37a");
  });

  if (regionBounds) {
    document.documentElement.setAttribute(
      "viewBox",
      buildFocusedViewBox(regionBounds, fullViewBox),
    );
  }

  return document.documentElement.outerHTML;
}

export default function RegionVoteCarousel({ regions, regionMapMarkup }) {
  const trackRef = useRef(null);
  const [mode, setMode] = useState("share");
  const regionMapMarkups = useMemo(
    () => new Map(
      (regions ?? []).map((region) => [
        region.regionName,
        buildRegionMapMarkup(region.regionName, regionMapMarkup),
      ]),
    ),
    [regions, regionMapMarkup],
  );
  const showingChange = mode === "change";

  function scrollByAmount(direction) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const card = track.querySelector(".region-carousel__card");
    const scrollAmount = card
      ? card.getBoundingClientRect().width + 16
      : track.clientWidth * 0.8;

    track.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  }

  if (!regions?.length) {
    return null;
  }

  return (
    <section className="region-carousel" aria-label="Regional party vote shares">
      <div className="region-carousel__header">
        <div>
          <div className="region-carousel__heading-row">
            <h3 className="region-carousel__title">Regional party vote</h3>
            <div className="chart-toggle" role="tablist" aria-label="Regional party vote mode">
              <button
                type="button"
                className={`chart-toggle__button${mode === "share" ? " is-active" : ""}`}
                onClick={() => setMode("share")}
              >
                Party vote
              </button>
              <button
                type="button"
                className={`chart-toggle__button${mode === "change" ? " is-active" : ""}`}
                onClick={() => setMode("change")}
              >
                Change
              </button>
            </div>
          </div>
          <p className="region-carousel__subtitle">
            Aggregate party vote share by region <br></br>Note: This is purely for informational purposes. Seats are calculated at a national level.
          </p>
        </div>
        <div className="region-carousel__controls" aria-hidden="true">
          <button
            type="button"
            className="region-carousel__button"
            onClick={() => scrollByAmount(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="region-carousel__button"
            onClick={() => scrollByAmount(1)}
          >
            →
          </button>
        </div>
      </div>

      <div className="region-carousel__track" ref={trackRef}>
        {regions.map((region) => {
          const cardRegionMapMarkup = regionMapMarkups.get(region.regionName);
          const maxAbsChange = Math.max(
            ...region.parties.map((party) => Math.abs(party.change ?? 0)),
            1,
          );

          return (
            <article
              key={region.regionName}
              className="region-carousel__card"
              aria-label={`${region.regionName} regional party vote`}
            >
              <div className="region-carousel__card-header">
                <div className="region-carousel__card-copy">
                  <h4 className="region-carousel__card-title">
                    {formatRegionTitle(region.regionName)}
                  </h4>
                  <p className="region-carousel__card-meta">
                    {formatShare(region.percentCounted)} counted
                  </p>
                </div>
                {cardRegionMapMarkup && (
                  <div
                    className="region-carousel__mini-map"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: cardRegionMapMarkup }}
                  />
                )}
              </div>

              <div className="region-carousel__rows">
                {region.parties.map((party) => (
                  <div key={party.label} className="region-carousel__row">
                    <div className="region-carousel__row-top">
                      <span className="region-carousel__party">
                        <span
                          className="region-carousel__party-dot"
                          style={{ backgroundColor: party.color }}
                          aria-hidden="true"
                        />
                        {party.label}
                      </span>
                      <span className="region-carousel__value">
                        <span
                          className="region-carousel__value-share"
                          style={{ opacity: showingChange ? 0 : 1 }}
                        >
                          {formatShare(party.value)}
                        </span>
                        <span
                          className="region-carousel__value-change"
                          style={{
                            color: changeColor(party.change ?? 0),
                            opacity: showingChange ? 1 : 0,
                          }}
                        >
                          {formatChange(party.change ?? 0)}
                        </span>
                      </span>
                    </div>
                    <div className={`region-carousel__bar${showingChange ? " is-change" : ""}`}>
                      <div
                        className="region-carousel__zero-line"
                        style={{ opacity: showingChange ? 1 : 0 }}
                      />
                      <div
                        className="region-carousel__bar-fill"
                        style={{
                          left: showingChange
                            ? `${party.change >= 0
                              ? 50
                              : 50 - (Math.abs(party.change ?? 0) / maxAbsChange) * 50}%`
                            : "0%",
                          width: showingChange
                            ? `${(Math.abs(party.change ?? 0) / maxAbsChange) * 50}%`
                            : `${Math.max(0, Math.min(party.scaledValue ?? 0, 100))}%`,
                          backgroundColor: party.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
