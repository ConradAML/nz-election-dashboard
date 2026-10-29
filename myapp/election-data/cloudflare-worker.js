import { serveDataset } from "./serve-dataset.js";
import { XMLValidator } from "fast-xml-parser";
import mapSvg from "../../nzmap.svg";
import electorateNotionalsCsv from "./baselines/polling_place_split_final_notional_2026_electorate_vote_all_parties.csv";
import partyNotionalsCsv from "./baselines/polling_place_split_final_notional_2026_list_vote_all_parties.csv";
import { buildPartyVoteSnapshot, convertElectionData } from "./converter.js";

const CORE_FILES = ["candidates.xml", "electorates.xml", "parties.xml"];
const PUBLIC_FILES = new Set([
  "results.json",
  "vote_count.json",
  "electorate_details.json",
  "electorate_winners.json",
  "party_vote_snapshots.json",
]);

function jsonResponse(value, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(value, null, 2), { ...init, headers });
}

async function download(baseUrl, relativePath) {
  const url = new URL(relativePath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const response = await fetch(url, { headers: { "User-Agent": "NZ-Election-Dashboard/1.0" } });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  const content = await response.text();
  const validation = XMLValidator.validate(content);
  if (validation !== true) throw new Error(`${url} returned invalid XML: ${validation.err.msg}`);
  return content;
}

async function mapWithConcurrency(items, limit, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function electorateNumbers(xml) {
  const numbers = [...xml.matchAll(/<electorate\s+[^>]*e_no=["'](\d+)["']/g)].map((match) => match[1]);
  if (!numbers.length) throw new Error("electorates.xml contains no electorates");
  return numbers;
}

async function downloadSource(baseUrl, electionXml) {
  const files = new Map([["election.xml", electionXml]]);
  await mapWithConcurrency(CORE_FILES, 4, async (relativePath) => {
    files.set(relativePath, await download(baseUrl, relativePath));
  });
  const numbers = electorateNumbers(files.get("electorates.xml"));
  await mapWithConcurrency(numbers, 6, async (number) => {
    const directory = `e${number.padStart(2, "0")}`;
    files.set(`${directory}/${directory}.xml`, await download(baseUrl, `${directory}/${directory}.xml`));
  });
  const electorateXmlByNumber = Object.fromEntries(numbers.map((number) => {
    const directory = `e${number.padStart(2, "0")}`;
    return [String(Number(number)), files.get(`${directory}/${directory}.xml`)];
  }));
  return {
    files,
    source: {
      candidatesXml: files.get("candidates.xml"),
      electionXml: files.get("election.xml"),
      electoratesXml: files.get("electorates.xml"),
      partiesXml: files.get("parties.xml"),
      electorateXmlByNumber,
      mapSvg,
      electorateNotionalsCsv,
      partyNotionalsCsv,
    },
  };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sourceHash(files) {
  const canonical = [...files].sort(([first], [second]) => first.localeCompare(second));
  return sha256(canonical.map(([name, content]) => `${name}\0${content}`).join("\0"));
}

async function readJson(bucket, key) {
  const object = await bucket.get(key);
  return object ? object.json() : null;
}

function updatedTimestamp(electionXml) {
  return electionXml.match(/<election\s+[^>]*updated=["']([^"']+)["']/)?.[1] ?? null;
}

function versionName(sourceUpdatedAt, hash) {
  const timestamp = (sourceUpdatedAt || new Date().toISOString()).replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
  return `${timestamp}-${hash.slice(0, 12)}`;
}

async function publishResults(env) {
  const current = await readJson(env.RESULTS_BUCKET, "latest.json");
  const electionXml = await download(env.ELECTION_XML_BASE_URL, "election.xml");
  const electionHash = await sha256(electionXml);
  const conversionHash = await sha256(JSON.stringify([
    "2023-baselines-v2", mapSvg, electorateNotionalsCsv, partyNotionalsCsv,
  ]));
  if (current?.sourceUrl === env.ELECTION_XML_BASE_URL && current?.electionHash === electionHash && current?.conversionHash === conversionHash) {
    console.log(`No Elections NZ changes; current version is ${current.version}`);
    return current;
  }

  const { files, source } = await downloadSource(env.ELECTION_XML_BASE_URL, electionXml);
  const hash = await sha256(`${await sourceHash(files)}\0${conversionHash}`);
  if (current?.sourceUrl === env.ELECTION_XML_BASE_URL && current?.sourceHash === hash) {
    const updatedCurrent = { ...current, electionHash, conversionHash };
    await env.RESULTS_BUCKET.put("latest.json", JSON.stringify(updatedCurrent), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    });
    console.log(`Recorded election.xml sentinel for current version ${current.version}`);
    return updatedCurrent;
  }

  const converted = convertElectionData(source);
  // Keep prior publications, but never combine snapshots from different feeds.
  const previousHistoryKey = current?.sourceUrl === env.ELECTION_XML_BASE_URL
    ? current?.files?.partyVoteSnapshots : null;
  const history = previousHistoryKey
    ? await readJson(env.RESULTS_BUCKET, previousHistoryKey)
    : { version: 1, election: env.ELECTION_YEAR, snapshots: [] };
  if (!Array.isArray(history?.snapshots)) throw new Error("Published snapshot history is invalid");
  const nextSnapshot = buildPartyVoteSnapshot(converted.results, converted.voteCount);
  // Preserve every changed feed, including corrections with unchanged vote totals.
  history.snapshots.push({
    ...nextSnapshot,
    sourceHash: hash,
    sourceUpdatedAt: updatedTimestamp(source.electionXml),
  });

  const sourceUpdatedAt = updatedTimestamp(source.electionXml);
  const version = versionName(sourceUpdatedAt, hash);
  const prefix = `versions/${version}`;
  const outputs = {
    results: [`${prefix}/results.json`, converted.results],
    voteCount: [`${prefix}/vote_count.json`, converted.voteCount],
    electorateDetails: [`${prefix}/electorate_details.json`, converted.electorateDetails],
    electorateWinners: [`${prefix}/electorate_winners.json`, converted.electorateWinners],
    partyVoteSnapshots: [`${prefix}/party_vote_snapshots.json`, history],
  };
  await Promise.all(Object.values(outputs).map(([key, value]) => env.RESULTS_BUCKET.put(
    key,
    JSON.stringify(value),
    { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=31536000, immutable" } },
  )));

  const latest = {
    version,
    election: env.ELECTION_YEAR,
    sourceUrl: env.ELECTION_XML_BASE_URL,
    sourceUpdatedAt,
    sourceHash: hash,
    electionHash,
    conversionHash,
    publishedAt: new Date().toISOString(),
    publisher: "cloudflare",
    files: Object.fromEntries(Object.entries(outputs).map(([name, [key]]) => [name, key])),
  };
  await env.RESULTS_BUCKET.put("latest.json", JSON.stringify(latest), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
  });
  console.log(`Published Elections NZ version ${version}`);
  return latest;
}

async function runUpdate(env, trigger) {
  const startedAt = new Date().toISOString();
  try {
    const latest = await publishResults(env);
    const status = {
      status: "ok",
      trigger,
      lastStartedAt: startedAt,
      lastCompletedAt: new Date().toISOString(),
      currentVersion: latest.version,
      sourceUpdatedAt: latest.sourceUpdatedAt,
    };
    await env.RESULTS_BUCKET.put("updater-status.json", JSON.stringify(status), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    });
    return latest;
  } catch (error) {
    const status = {
      status: "error",
      trigger,
      lastStartedAt: startedAt,
      lastFailedAt: new Date().toISOString(),
      error: error.message,
    };
    await env.RESULTS_BUCKET.put("updater-status.json", JSON.stringify(status), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    });
    throw error;
  }
}

async function serveObject(request, env, context, key, immutable = false) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = `/__r2_cache/${key}`;
  const cacheKey = new Request(cacheUrl, request);
  if (immutable) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }
  const object = await env.RESULTS_BUCKET.get(key);
  if (!object) return jsonResponse({ error: "Not found" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("access-control-allow-origin", "*");
  const response = new Response(object.body, { headers });
  if (immutable) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleRequest(request, env, context) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/dataset") return serveDataset(request, env);
  if (pathname.startsWith("/demo/xml/") && ["GET", "HEAD"].includes(request.method)) {
    const file = pathname.slice("/demo/xml/".length);
    if (!/^(election|candidates|electorates|parties)\.xml$/.test(file) && !/^e\d{2}\/e\d{2}\.xml$/.test(file)) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }
    const upstream = await fetch(`https://mediademo.electionresults.govt.nz/xml/${file}`);
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/xml", "access-control-allow-origin": "*", "cache-control": "no-store" },
    });
  }
  if (pathname === "/admin/refresh") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
    }
    const authorization = request.headers.get("authorization");
    if (!env.UPDATE_TOKEN || authorization !== `Bearer ${env.UPDATE_TOKEN}`) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const latest = await runUpdate(env, "manual");
      return jsonResponse({ status: "ok", latest });
    } catch (error) {
      console.error("Manual update failed", error.stack || error.message);
      return jsonResponse({ error: error.message }, { status: 500 });
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (pathname === "/" || pathname === "/status") {
    const latest = await readJson(env.RESULTS_BUCKET, "latest.json");
    const updater = await readJson(env.RESULTS_BUCKET, "updater-status.json");
    return jsonResponse(
      latest ? { updater, latest } : { status: "waiting-for-first-update", updater },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (pathname === "/latest.json") return serveObject(request, env, context, "latest.json");
  const filename = pathname.slice(1);
  if (!PUBLIC_FILES.has(filename)) return jsonResponse({ error: "Not found" }, { status: 404 });
  const latest = await readJson(env.RESULTS_BUCKET, "latest.json");
  if (!latest) return jsonResponse({ error: "No dataset has been published yet" }, { status: 503 });
  const property = {
    "results.json": "results",
    "vote_count.json": "voteCount",
    "electorate_details.json": "electorateDetails",
    "electorate_winners.json": "electorateWinners",
    "party_vote_snapshots.json": "partyVoteSnapshots",
  }[filename];
  return serveObject(request, env, context, latest.files[property], true);
}

export default {
  fetch: handleRequest,
  async scheduled(controller, env, context) {
    console.log(`Scheduled update started at ${new Date(controller.scheduledTime).toISOString()}`);
    context.waitUntil(
      runUpdate(env, "scheduled").catch((error) => {
        console.error("Scheduled update failed", error.stack || error.message);
        throw error;
      }),
    );
  },
};
