// Live results come from the Cloudflare Worker. For local testing,
// run `npm run dev:simulated` to use the preserved deterministic fixture.
export const DATA_SOURCE =
  (import.meta.env.VITE_DATA_SOURCE || "live").toLowerCase() === "simulated"
    ? "simulated"
    : "live";

export const USE_SIMULATED_DATA = DATA_SOURCE === "simulated";

export const RESULTS_BASE_URL = (
  import.meta.env.VITE_RESULTS_BASE_URL?.trim() ||
  "https://nz-election-results-updater.conradaml.workers.dev"
).replace(/\/+$/, "");

export function resolveDashboardDataFile(fileName) {
  return USE_SIMULATED_DATA
    ? `datasets/simulated/${fileName}`
    : fileName;
}
