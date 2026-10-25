import { applyPartyColorOverrides } from "../constants/partyColors";
import { fetchDemoData } from "../utils/demoData";
import { USE_DEMO_DATA } from "../constants/dataSource";
import { useEffect, useState } from "react";
import {
  resolveDashboardDataFile,
  USE_SIMULATED_DATA,
} from "../constants/dataSource";

const REFRESH_INTERVAL_MS = 30_000;

function buildAssetUrl(fileName) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}${fileName}`;
}

function buildLiveDataUrl(fileName) {
  const resultsBaseUrl = import.meta.env.VITE_RESULTS_BASE_URL?.trim();
  if (!USE_SIMULATED_DATA && resultsBaseUrl) {
    return `${resultsBaseUrl.replace(/\/$/, "")}/${fileName}`;
  }
  return buildAssetUrl(resolveDashboardDataFile(fileName));
}

async function fetchJson(fileName, signal) {
  const response = await fetch(
    buildLiveDataUrl(fileName),
    { signal, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }

  return response.json();
}

async function fetchPreservedJson(fileName, signal) {
  const response = await fetch(
    buildAssetUrl(`datasets/current/${fileName}`),
    { signal, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Failed to load preserved ${fileName}: ${response.status}`);
  }

  return response.json();
}

async function fetchText(fileName, signal) {
  const response = await fetch(
    buildAssetUrl(resolveDashboardDataFile(fileName)),
    { signal, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }

  return response.text();
}

async function fetchStaticText(fileName, signal) {
  const response = await fetch(
    buildAssetUrl(fileName),
    { signal, cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status}`);
  }

  return response.text();
}

export default function useDashboardData() {
  const [data, setData] = useState({
    results: null,
    voteCount: null,
    partyVoteSnapshots: null,
    electorateDetails: null,
    baselineElectorateDetails: null,
    electorateWinners: null,
    electorateRegionsCsv: null,
    regionMapMarkup: null,
    nzMapMarkup: null,
    nzHexMapMarkup: null,
    maoriMapMarkup: null,
    maoriHexMapMarkup: null,
    aucklandMapMarkup: null,
    christchurchMapMarkup: null,
    hamiltonMapMarkup: null,
    wellingtonMapMarkup: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState(null);
  const [updaterStatus, setUpdaterStatus] = useState(null);

  useEffect(() => {
    let isActive = true;

    async function loadDashboardData(signal) {
      const demo = USE_DEMO_DATA ? await fetchDemoData(signal) : null;
      const loadResults = (fileName) => demo ? Promise.resolve(demo[fileName]) : fetchJson(fileName, signal);
      const statusPromise = !USE_DEMO_DATA && !USE_SIMULATED_DATA && import.meta.env.VITE_RESULTS_BASE_URL?.trim()
        ? fetchJson("status", signal).catch(() => null)
        : Promise.resolve(null);
      const [
        results,
        voteCount,
        partyVoteSnapshots,
        electorateDetails,
        baselineElectorateDetails,
        electorateWinners,
        electorateRegionsCsv,
        regionMapMarkup,
        nzMapMarkup,
        nzHexMapMarkup,
        maoriMapMarkup,
        maoriHexMapMarkup,
        aucklandMapMarkup,
        christchurchMapMarkup,
        hamiltonMapMarkup,
        wellingtonMapMarkup,
      ] = await Promise.all([
        loadResults("results.json"),
        loadResults("vote_count.json"),
        loadResults("party_vote_snapshots.json"),
        loadResults("electorate_details.json"),
        fetchPreservedJson("electorate_details.json", signal),
        loadResults("electorate_winners.json"),
        fetchText("general_electorates_2026_regions.csv", signal),
        fetchText("nzregions.svg", signal),
        fetchText("nzmap.svg", signal),
        fetchText("hexmap.svg", signal),
        fetchText("maorielectorates.svg", signal),
        fetchText("hexmap-maori.svg", signal),
        fetchStaticText("auckland.svg", signal),
        fetchStaticText("christchurch.svg", signal),
        fetchStaticText("hamilton.svg", signal),
        fetchStaticText("wellington.svg", signal),
      ]);
      const status = await statusPromise;

      if (!isActive) {
        return;
      }

      applyPartyColorOverrides(results, electorateDetails);
      setData({
        results,
        voteCount,
        partyVoteSnapshots,
        electorateDetails,
        baselineElectorateDetails,
        electorateWinners,
        electorateRegionsCsv,
        regionMapMarkup,
        nzMapMarkup,
        nzHexMapMarkup,
        maoriMapMarkup,
        maoriHexMapMarkup,
        aucklandMapMarkup,
        christchurchMapMarkup,
        hamiltonMapMarkup,
        wellingtonMapMarkup,
      });
      setLastSuccessfulAt(Date.now());
      setUpdaterStatus(status?.updater ?? null);
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
    lastSuccessfulAt,
    updaterStatus,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    isSimulatedData: USE_SIMULATED_DATA,
  };
}
