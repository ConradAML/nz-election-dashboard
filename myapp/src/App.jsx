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
          x: ["Labour", "National", "Green", "ACT"],
          y: [32.0, 27.4, 10.8, 7.6],
          type: "bar",
        },
      ],
      {
        width: 800,
        height: 600,
        title: "2023 NZ Election Vote Share",
      },
      {
        responsive: true,
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
