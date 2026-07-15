import HorizontalBarChart from "components/HorizontalBarChart";

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

export default function App() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px" }}>
      <h1>Party vote</h1>
      <HorizontalBarChart data={partyData} />
    </main>
  );
}