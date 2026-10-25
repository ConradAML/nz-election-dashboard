// Choose "demo", "live", or "simulated" here, or set VITE_DATA_SOURCE at build time.
const DEFAULT_DATA_SOURCE = "demo";
export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE || DEFAULT_DATA_SOURCE).toLowerCase();
export const USE_SIMULATED_DATA = DATA_SOURCE === "simulated";
export const USE_DEMO_DATA = DATA_SOURCE === "demo";
export function resolveDashboardDataFile(fileName) {
  return USE_SIMULATED_DATA ? `datasets/simulated/${fileName}` : fileName;
}
