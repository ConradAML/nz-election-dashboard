import { useEffect, useRef } from "react";
import Plotly from "plotly.js/dist/plotly";

export default function App() {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) {
      return undefined;
    }

    Plotly.newPlot(
      chartRef.current,
      [
        {
          x: ["National", "Labour", "Green", "ACT", "NZ First", "Māori", "Opportunity", "Other"],
          y: [38.1, 26.9, 11.6, 8.6, 6.1, 3.1, 2.2, 3.4],
          type: "bar",
          dragmode: false,
          marker: {
            color: [
              "#3399FF",
              "#FF0000",
              "#009900",
              "#D3B641",
              "#999999",
              "#AA00D4)", 
              "#F0E68C",
              "#454545"
          }
        },
      ],
      {
        width: 800,
        height: 600,
        title: "2023 NZ Election Vote Share",
      },
      {
        responsive: true,
        displayModeBar: false,
      },
    );

    return () => {
      if (chartRef.current) {
        Plotly.purge(chartRef.current);
      }
    };
  }, []);

  return <div ref={chartRef} />;
}
