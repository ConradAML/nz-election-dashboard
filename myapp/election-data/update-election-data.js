import { createHash } from "node:crypto";
import { readFile, readdir, rename, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLValidator } from "fast-xml-parser";
import { buildPartyVoteSnapshot, convertElectionData } from "./converter.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIR, "../..");
const DEFAULT_BASE_URL = "https://media.election.net.nz/electionresults_2023/xml/";
const CORE_FILES = ["candidates.xml", "electorates.xml", "parties.xml", "statistics.xml", "votingplaces.xml"];

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function parseElectorateNumbers(xml) {
  return [...xml.matchAll(/<electorate\s+[^>]*e_no=["'](\d+)["']/g)].map((match) => match[1]);
}

function assertXml(content, url) {
  const validation = XMLValidator.validate(content);
  if (validation !== true) {
    throw new Error(`${url} returned invalid XML: ${validation.err.msg}`);
  }
}

async function download(baseUrl, relativePath) {
  const url = new URL(relativePath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const response = await fetch(url, { headers: { "User-Agent": "NZ-Election-Dashboard/1.0" } });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  const content = await response.text();
  assertXml(content, url);
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

async function writeAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

async function refreshXml(baseUrl, xmlDir) {
  const electionXml = await download(baseUrl, "election.xml");
  const electionPath = path.join(xmlDir, "election.xml");
  try {
    if (await readFile(electionPath, "utf8") === electionXml) {
      console.log(`No Elections NZ changes detected in election.xml`);
      return false;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const downloads = new Map([["election.xml", electionXml]]);
  await mapWithConcurrency(CORE_FILES, 6, async (relativePath) => {
    downloads.set(relativePath, await download(baseUrl, relativePath));
  });
  const electorateNumbers = parseElectorateNumbers(downloads.get("electorates.xml"));
  if (!electorateNumbers.length) throw new Error("electorates.xml contains no electorates");
  await mapWithConcurrency(electorateNumbers, 8, async (electorateNumber) => {
    const directory = `e${electorateNumber.padStart(2, "0")}`;
    const relativePath = `${directory}/${directory}.xml`;
    downloads.set(relativePath, await download(baseUrl, relativePath));
  });

  let changed = false;
  for (const [relativePath, content] of downloads) {
    const destination = path.join(xmlDir, relativePath);
    let existing = null;
    try { existing = await readFile(destination, "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing !== content) changed = true;
  }
  if (changed) {
    await Promise.all([...downloads].map(([relativePath, content]) => writeAtomic(path.join(xmlDir, relativePath), content)));
  }
  console.log(`${changed ? "Updated" : "Checked"} ${downloads.size} XML files from ${baseUrl}`);
  return changed;
}

async function readSource(xmlDir) {
  const electorateXmlByNumber = {};
  for (const entry of await readdir(xmlDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^e\d{2}$/.test(entry.name)) continue;
    const number = String(Number(entry.name.slice(1)));
    electorateXmlByNumber[number] = await readFile(path.join(xmlDir, entry.name, `${entry.name}.xml`), "utf8");
  }
  return {
    candidatesXml: await readFile(path.join(xmlDir, "candidates.xml"), "utf8"),
    electionXml: await readFile(path.join(xmlDir, "election.xml"), "utf8"),
    electoratesXml: await readFile(path.join(xmlDir, "electorates.xml"), "utf8"),
    partiesXml: await readFile(path.join(xmlDir, "parties.xml"), "utf8"),
    electorateXmlByNumber,
    mapSvg: await readFile(path.join(REPOSITORY_ROOT, "nzmap.svg"), "utf8"),
    electorateNotionalsCsv: await readFile(path.join(MODULE_DIR, "baselines/polling_place_split_final_notional_2026_electorate_vote_all_parties.csv"), "utf8"),
    partyNotionalsCsv: await readFile(path.join(MODULE_DIR, "baselines/polling_place_split_final_notional_2026_list_vote_all_parties.csv"), "utf8"),
  };
}

async function readSnapshotHistory(outputRoot) {
  const locations = [path.join(outputRoot, "party_vote_snapshots.json"), path.join(outputRoot, "myapp/public/party_vote_snapshots.json")];
  for (const location of locations) {
    try { return JSON.parse(await readFile(location, "utf8")); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { version: 1, election: "2026", snapshots: [] };
}

async function writeJsonCopies(outputRoot, filename, value) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await Promise.all([
    writeAtomic(path.join(outputRoot, filename), json),
    writeAtomic(path.join(outputRoot, "myapp/public", filename), json),
  ]);
}

async function generateJson(xmlDir, outputRoot) {
  const converted = convertElectionData(await readSource(xmlDir));
  const history = await readSnapshotHistory(outputRoot);
  if (!Array.isArray(history.snapshots)) throw new Error("party_vote_snapshots.json must contain a snapshots array");
  const nextSnapshot = buildPartyVoteSnapshot(converted.results, converted.voteCount);
  const latest = history.snapshots.at(-1);
  if (!latest || Number(latest.totalVotesCast) !== nextSnapshot.totalVotesCast) history.snapshots.push(nextSnapshot);

  await Promise.all([
    writeJsonCopies(outputRoot, "results.json", converted.results),
    writeJsonCopies(outputRoot, "vote_count.json", converted.voteCount),
    writeJsonCopies(outputRoot, "electorate_winners.json", converted.electorateWinners),
    writeJsonCopies(outputRoot, "electorate_details.json", converted.electorateDetails),
    writeJsonCopies(outputRoot, "party_vote_snapshots.json", history),
  ]);
  const digest = createHash("sha256").update(JSON.stringify(converted)).digest("hex").slice(0, 12);
  console.log(`Generated dashboard JSON (${digest})`);
}

async function main() {
  const xmlDir = path.resolve(option("--xml-dir", path.join(REPOSITORY_ROOT, "XMLfiles")));
  const outputRoot = path.resolve(option("--output-root", REPOSITORY_ROOT));
  const skipFetch = process.argv.includes("--skip-fetch");
  const baseUrl = option("--base-url", process.env.ELECTION_XML_BASE_URL || DEFAULT_BASE_URL);
  const changed = skipFetch ? true : await refreshXml(baseUrl, xmlDir);
  if (changed) await generateJson(xmlDir, outputRoot);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
