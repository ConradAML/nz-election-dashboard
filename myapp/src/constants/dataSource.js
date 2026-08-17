// Set this to false to return to the normal files in myapp/public.
export const USE_SIMULATED_DATA = true;

export function resolveDashboardDataFile(fileName) {
  return USE_SIMULATED_DATA
    ? `datasets/simulated/${fileName}`
    : fileName;
}
