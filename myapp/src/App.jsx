import { useEffect, useRef } from "react";
import Plotly from "plotly.js/dist/plotly";

export default function App() {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) {
      return undefined;
    }

    const renderChart = () => {
      if (!chartRef.current) {
        return;
      }

      const width = chartRef.current.clientWidth || 800;
      const height = width < 640 ? 360 : 460;

      Plotly.react(
        chartRef.current,
        [
          {
            x: ["National", "Labour", "Green", "ACT", "NZ First", "Māori", "Opportunity", "Other"],
            y: [38.1, 26.9, 11.6, 8.6, 6.1, 3.1, 2.2, 3.4],
            type: "bar",
            marker: {
              color: [
                "#3399FF",
                "#FF0000",
                "#009900",
                "#D3B641",
                "#999999",
                "#AA00D4",
                "#F0E68C",
                "#454545",
              ],
            },
          },
        ],
        {
          autosize: true,
          width,
          height,
          title: "2023 NZ Election Vote Share",
          paper_bgcolor: "#ffffff",
          plot_bgcolor: "#ffffff",
          margin: {
            l: 48,
            r: 20,
            t: 60,
            b: 80,
          },
          dragmode: false,
          xaxis: {
            fixedrange: true,
            automargin: true,
          },
          yaxis: {
            fixedrange: true,
            automargin: true,
          },
        },
        {
          responsive: true,
          displayModeBar: false,
        },
      );
    };

    renderChart();
    window.addEventListener("resize", renderChart);

    return () => {
      window.removeEventListener("resize", renderChart);
      if (chartRef.current) {
        Plotly.purge(chartRef.current);
      }
    };
  }, []);

  return <div ref={chartRef} style={{ width: "100%", minHeight: "360px" }} />;
}
