const savedSource = (() => {
  try { return localStorage.getItem("results-source"); } catch { return null; }
})();
export const DATA_SOURCE = savedSource || import.meta.env.VITE_DATA_SOURCE || "demo";
export const USE_SIMULATED_DATA = DATA_SOURCE === "simulated";
export const USE_DEMO_DATA = DATA_SOURCE === "demo";
export function selectDataSource(source) {
  localStorage.setItem("results-source", source);
  window.location.reload();
}
export function resolveDashboardDataFile(fileName) {
  return USE_SIMULATED_DATA ? `datasets/simulated/${fileName}` : fileName;
}
