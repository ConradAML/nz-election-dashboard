import VerticalBarChart from "./components/VerticalBarChart";
import SemiDonutChart from "./components/SemiDonutChart";

const partyData = [
  { label: "National", value: 38.1, color: "#3399FF" },
  { label: "Labour", value: 26.9, color: "#FF0000" },
  { label: "Green", value: 11.6, color: "#009900" },
  { label: "ACT", value: 8.6, color: "#D3B641" },
  { label: "NZ First", value: 6.1, color: "#999999" },
  { label: "Māori", value: 3.1, color: "#AA00D4" },
  { label: "Opportunity", value: 2.2, color: "#F0E68C" },
  { label: "Other", value: 3.4, color: "#454545" },
];

const seatData = [
  { label: "National", value: 48, color: "#3399FF" },
  { label: "Labour", value: 34, color: "#FF0000" },
  { label: "Green", value: 15, color: "#009900" },
  { label: "ACT", value: 11, color: "#D3B641" },
  { label: "NZ First", value: 8, color: "#999999" },
  { label: "Māori", value: 6, color: "#AA00D4" },
];

export default function App() {
  return (
    <main className="dashboard-shell">
      <section className="chart-panel">
        <h1>Party vote</h1>
        <VerticalBarChart data={partyData} height={560} />
      </section>

      <section className="chart-panel">
        <h1>Seat count</h1>
        <SemiDonutChart data={seatData} height={650}/>
      </section>
    </main>
  );
}
