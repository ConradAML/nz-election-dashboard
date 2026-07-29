import { useRef } from "react";

function formatShare(value) {
  return `${value.toFixed(1)}%`;
}

export default function RegionVoteCarousel({ regions }) {
  const trackRef = useRef(null);

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
          <h3 className="region-carousel__title">Regional party vote</h3>
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
        {regions.map((region) => (
          <article
            key={region.regionName}
            className="region-carousel__card"
            aria-label={`${region.regionName} regional party vote`}
          >
            <div className="region-carousel__card-header">
              <h4 className="region-carousel__card-title">{region.regionName}</h4>
              <p className="region-carousel__card-meta">
                {formatShare(region.percentCounted)} counted
              </p>
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
                      {formatShare(party.value)}
                    </span>
                  </div>
                  <div className="region-carousel__bar">
                    <div
                      className="region-carousel__bar-fill"
                      style={{
                        width: `${Math.max(0, Math.min(party.scaledValue ?? 0, 100))}%`,
                        backgroundColor: party.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
