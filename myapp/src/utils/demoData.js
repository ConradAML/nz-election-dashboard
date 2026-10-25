import { buildPartyVoteSnapshot, convertElectionData } from "../../election-data/converter";
import mapSvg from "../../../nzmap.svg?raw";
import electorateNotionalsCsv from "../../../polling_place_split_final_notional_2026_electorate_vote_all_parties.csv?raw";
import partyNotionalsCsv from "../../../polling_place_split_final_notional_2026_list_vote_all_parties.csv?raw";

let history = { version: 1, election: "demo", snapshots: [] };
export async function fetchDemoData(signal) {
  const worker = import.meta.env.VITE_RESULTS_BASE_URL?.trim().replace(/\/$/, "");
  const base = import.meta.env.DEV ? "/demo-xml/" : worker ? `${worker}/demo/xml/` : "https://mediademo.electionresults.govt.nz/xml/";
  async function download(file) {
    const response = await fetch(`${base}${file}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Demo feed ${file}: HTTP ${response.status}`);
    return response.text();
  }
  const [electionXml, candidatesXml, electoratesXml, partiesXml] = await Promise.all(
    ["election.xml", "candidates.xml", "electorates.xml", "parties.xml"].map(download),
  );
  const numbers = [...electoratesXml.matchAll(/<electorate\s+[^>]*e_no=["'](\d+)["']/g)].map((match) => match[1]);
  if (!numbers.length) throw new Error("Demo feed contains no electorates");
  const electorateXmlByNumber = {};
  // Limit concurrent requests to the source server.
  for (let index = 0; index < numbers.length; index += 6) {
    await Promise.all(numbers.slice(index, index + 6).map(async (number) => {
      const dir = `e${number.padStart(2, "0")}`;
      electorateXmlByNumber[String(Number(number))] = await download(`${dir}/${dir}.xml`);
    }));
  }
  const data = convertElectionData({ electionXml, candidatesXml, electoratesXml, partiesXml, electorateXmlByNumber, mapSvg, electorateNotionalsCsv, partyNotionalsCsv });
  const snapshot = buildPartyVoteSnapshot(data.results, data.voteCount);
  if (JSON.stringify(history.snapshots.at(-1)) !== JSON.stringify(snapshot)) {
    history = { ...history, snapshots: [...history.snapshots, snapshot] };
  }
  return { "results.json": data.results, "vote_count.json": data.voteCount, "electorate_details.json": data.electorateDetails, "electorate_winners.json": data.electorateWinners, "party_vote_snapshots.json": history };
}
