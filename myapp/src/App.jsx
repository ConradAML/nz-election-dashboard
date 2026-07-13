import "./App.css";

const results = [
  { name: "National", value: 38.1, color: "#165f3c" },
  { name: "Labour", value: 26.9, color: "#c51f3a" },
  { name: "Green", value: 11.6, color: "#3a8f2a" },
  { name: "ACT", value: 8.6, color: "#f2c230" },
  { name: "NZ First", value: 6.1, color: "#111111" },
  { name: "Māori", value: 3.1, color: "#d14b2c" },
  { name: "TOP", value: 2.2, color: "#17a1a8" },
];

export default function App() {
  return (
    <main className="dashboard">
      <span className="eyebrow">NZ Election Dashboard</span>
      <h1>Headline party vote</h1>
      <p className="dek">
        This is a static chart demo for the WordPress embed. It uses hard-coded
        numbers for now so we can get the presentation layer working before we
        switch over to live JSON updates.
      </p>

      <section className="chart-card" aria-labelledby="chart-title">
        <div className="chart-header">
          <div>
            <h2 id="chart-title" className="chart-title">
              Party vote share
            </h2>
            <p className="chart-subtitle">Illustrative 2023-style headline view</p>
          </div>
          <div className="chart-scale">Percent of total party vote</div>
        </div>

        <div className="bar-list">
          {results.map((party) => (
            <div className="bar-row" key={party.name}>
              <div className="bar-label">{party.name}</div>
              <div className="bar-track" aria-hidden="true">
                <div
                  className="bar-fill"
                  style={{
                    width: `${party.value}%`,
                    backgroundColor: party.color,
                  }}
                />
              </div>
              <div className="bar-value">{party.value.toFixed(1)}%</div>
            </div>
          ))}
        </div>

        <p className="footnote">
          Source placeholder: static demo values until live election ingest is
          connected.
        </p>
      </section>
    </main>
  );
}
