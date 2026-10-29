// Read one manifest so results and history always belong to the same publication.
export async function serveDataset(request, env) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
  const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!["GET", "HEAD"].includes(request.method)) return respond({ error: "Method not allowed" }, 405);
  if (!env.RESULTS_BUCKET) return respond({ error: "The results storage binding is missing" }, 503);
  const manifest = await env.RESULTS_BUCKET.get("latest.json");
  if (!manifest) return respond({ error: "No dataset has been published yet" }, 503);
  const latest = await manifest.json();
  const fields = { results: "results", voteCount: "voteCount", electorateDetails: "electorateDetails", electorateWinners: "electorateWinners", partyVoteSnapshots: "partyVoteSnapshots" };
  const entries = await Promise.all(Object.entries(fields).map(async ([name, key]) => {
    const path = latest.files?.[key];
    if (!path) throw new Error(`Published dataset is missing ${key}`);
    const object = await env.RESULTS_BUCKET.get(path);
    if (!object) throw new Error(`Published dataset file is missing: ${key}`);
    return [name, await object.json()];
  }));
  const status = await env.RESULTS_BUCKET.get("updater-status.json");
  return respond({ ...Object.fromEntries(entries), latest, updater: status ? await status.json() : null });
}
