import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 30_000;

function buildAssetUrl(fileName) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}${fileName}`;
}

async function fetchJson(fileName, signal) {
  const response = await fetch(buildAssetUrl(fileName), { signal, cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }

  return response.json();
}

async function fetchText(fileName, signal) {
  const response = await fetch(buildAssetUrl(fileName), { signal, cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }

  return response.text();
}

export default function useDashboardData() {
  const [data, setData] = useState({
    results: null,
    voteCount: null,
    electorateDetails: null,
    electorateWinners: null,
    nzMapMarkup: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isActive = true;

    async function loadDashboardData(signal) {
      const [
        results,
        voteCount,
        electorateDetails,
        electorateWinners,
        nzMapMarkup,
      ] = await Promise.all([
        fetchJson("results.json", signal),
        fetchJson("vote_count.json", signal),
        fetchJson("electorate_details.json", signal),
        fetchJson("electorate_winners.json", signal),
        fetchText("nzmap.svg", signal),
      ]);

      if (!isActive) {
        return;
      }

      setData({
        results,
        voteCount,
        electorateDetails,
        electorateWinners,
        nzMapMarkup,
      });
      setError(null);
      setIsLoading(false);
    }

    function startLoad() {
      const controller = new AbortController();

      loadDashboardData(controller.signal).catch((loadError) => {
        if (!isActive || loadError.name === "AbortError") {
          return;
        }

        setError(loadError);
        setIsLoading(false);
      });

      return controller;
    }

    let controller = startLoad();

    const intervalId = window.setInterval(() => {
      controller.abort();
      controller = startLoad();
    }, REFRESH_INTERVAL_MS);

    return () => {
      isActive = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    ...data,
    isLoading,
    error,
  };
}
