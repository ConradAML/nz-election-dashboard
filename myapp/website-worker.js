import { serveDataset } from "./election-data/serve-dataset.js";
const DEMO_BASE = "https://mediademo.electionresults.govt.nz/xml/";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/results/dataset") return serveDataset(request, env);
    if (!pathname.startsWith("/demo/xml/")) return env.ASSETS.fetch(request);
    const headers = { "cache-control": "no-store" };
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
    }
    const file = pathname.slice("/demo/xml/".length);
    if (!/^(election|candidates|electorates|parties)\.xml$/.test(file) && !/^e(\d{2})\/e\1\.xml$/.test(file)) {
      return new Response("Unknown demo file", { status: 404, headers });
    }
    try {
      const upstream = await fetch(new URL(file, DEMO_BASE), {
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "NZ-Election-Dashboard/1.0" },
      });
      return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers: { ...headers, "content-type": "application/xml; charset=utf-8" },
      });
    } catch {
      return new Response("Elections NZ demo feed is temporarily unavailable", { status: 502, headers });
    }
  },
};
