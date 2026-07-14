import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js/dist/plotly";

const Plot = createPlotlyComponent(Plotly);

export default function App() {
  return (
    <Plot
      data={[
        {
          x: ["Labour", "National", "Green", "ACT"],
          y: [32.0, 27.4, 10.8, 7.6],
          type: "bar",
        },
      ]}
      layout={{
        width: 800,
        height: 600,
        title: "2023 NZ Election Vote Share",
      }}
    />
  );
}
