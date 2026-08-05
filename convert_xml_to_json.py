import csv
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from difflib import SequenceMatcher


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR / "XMLfiles"
PUBLIC_DIR = BASE_DIR / "myapp" / "public"

candidate_path = ROOT_DIR / "candidates.xml"
parties_path = ROOT_DIR / "parties.xml"
electorates_path = ROOT_DIR / "electorates.xml"
results_path = ROOT_DIR / "election.xml"
map_svg_path = BASE_DIR / "nzmap.svg"
results_output_paths = [
    BASE_DIR / "results.json",
    PUBLIC_DIR / "results.json",
]
vote_count_output_paths = [
    BASE_DIR / "vote_count.json",
    PUBLIC_DIR / "vote_count.json",
]
electorate_map_output_paths = [
    BASE_DIR / "electorate_winners.json",
    PUBLIC_DIR / "electorate_winners.json",
]
electorate_details_output_paths = [
    BASE_DIR / "electorate_details.json",
    PUBLIC_DIR / "electorate_details.json",
]
electorate_notionals_path = BASE_DIR / "electorate_full_notionals.csv"
party_vote_notionals_path = BASE_DIR / "partyvote_notionals_full.csv"
party_vote_snapshot_paths = [
    BASE_DIR / "party_vote_snapshots.json",
    PUBLIC_DIR / "party_vote_snapshots.json",
]
SNAPSHOT_PARTY_CODES = {"5", "10", "13", "14", "16", "17", "24"}
SVG_NAME_ALIASES = {
    "East_Cape": "East_Coast",
    "Kapiti": "Otaki",
    "Invercargil": "Invercargill",
}

DISPLAY_NAME_ALIASES = {
    "East Coast": "East Cape",
    "Ōtaki": "Kapiti",
    "Otaki": "Kapiti",
    "Rongotai": "Wellington Bays",
    "Wellington Central": "Wellington North",
    "Ōhāriu": "Kenepuru",
    "Ohariu": "Kenepuru",
    "Bay of Plenty": "Mt Maunganui",
    "New Lynn": "Waitākere",
    "Te Atatū": "Henderson",
    "Kelston": "Glendene",
    "Panmure-Ōtāhuhu": "Ōtāhuhu",
}


def convert_to_dict(path, parent_tag=None):
    tree = ET.parse(path)
    root = tree.getroot()

    if parent_tag:
        root = root.find(parent_tag)

    conversion_dict = []
    for item in root:
        child_dict = {child.tag: child.text for child in item}
        child_dict.update(item.attrib)
        conversion_dict.append(child_dict)

    return conversion_dict


def build_party_lookup(parties):
    return {
        party["p_no"]: {
            "abbrev": party.get("abbrev", ""),
            "short_name": party.get("short_name", ""),
            "party_name": party.get("party_name", ""),
        }
        for party in parties
    }


def build_results_with_party_names(results, party_lookup):
    enriched_results = []

    for vote in results:
        party_meta = party_lookup.get(vote["p_no"], {})
        enriched_results.append(
            {
                **vote,
                "abbrev": party_meta.get("abbrev", ""),
                "short_name": party_meta.get("short_name", ""),
                "party_name": party_meta.get("party_name", ""),
            }
        )

    return enriched_results


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")

    with temporary_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    temporary_path.replace(path)


def load_notional_shares(path):
    shares_by_electorate = {}

    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            electorate_id = normalize_svg_id(row.get("electorate_name", ""))
            total_votes_value = next(
                (
                    value
                    for column_name, value in row.items()
                    if column_name and column_name.startswith("Total_valid_")
                ),
                0,
            )
            shares_by_electorate[electorate_id] = {
                "total_votes": float(total_votes_value or 0),
                "shares": {
                    normalize_notional_label(column_name.removesuffix("_share")): float(value)
                    * 100
                    for column_name, value in row.items()
                    if column_name and column_name.endswith("_share") and value
                },
                "votes": {
                    normalize_notional_label(column_name.removesuffix("_votes")): float(value)
                    for column_name, value in row.items()
                    if column_name and column_name.endswith("_votes") and value
                },
            }

    return shares_by_electorate


def normalize_notional_label(label):
    ascii_label = "".join(
        character
        for character in unicodedata.normalize("NFKD", label)
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", "", ascii_label.lower())


def find_notional_share(shares, party_meta, candidate_name=None, independent=False):
    if independent and candidate_name:
        candidate_key = normalize_notional_label(f"INDEPENDENT — {candidate_name}")
        return shares.get(candidate_key)

    party_labels = (
        party_meta.get("short_name", ""),
        party_meta.get("party_name", ""),
        party_meta.get("abbrev", ""),
    )
    for label in party_labels:
        share = shares.get(normalize_notional_label(label))
        if share is not None:
            return share

    return None


def build_party_vote_snapshot(results, vote_count_data):
    parties = {
        result["p_no"]: {
            "votes": int(result.get("votes") or 0),
            "voteShare": float(result.get("percent_votes") or 0),
        }
        for result in sorted(results, key=lambda result: int(result["p_no"]))
        if result["p_no"] in SNAPSHOT_PARTY_CODES
    }
    other_results = [
        result for result in results if result["p_no"] not in SNAPSHOT_PARTY_CODES
    ]
    parties["other"] = {
        "votes": sum(int(result.get("votes") or 0) for result in other_results),
        "voteShare": round(
            sum(float(result.get("percent_votes") or 0) for result in other_results),
            2,
        ),
    }
    projected_seats = {
        result["p_no"]: int(result.get("total_seats") or 0)
        for result in results
        if result["p_no"] in SNAPSHOT_PARTY_CODES
    }
    projected_seats["other"] = sum(
        int(result.get("total_seats") or 0) for result in other_results
    )

    return {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "percentCounted": float(vote_count_data["percent_voting_places_counted"] or 0),
        "totalVotingPlacesCounted": int(vote_count_data["total_voting_places_counted"] or 0),
        "totalVotesCast": int(vote_count_data["total_votes_cast"] or 0),
        "turnout": float(vote_count_data["percent_votes_cast"] or 0),
        "parties": parties,
        "projectedSeats": projected_seats,
    }


def report_vote_count_difference(latest_snapshot, next_snapshot):
    if latest_snapshot is None:
        print(
            "Updated votes: creating the first snapshot with "
            f"{next_snapshot['totalVotesCast']:,} votes counted."
        )
        return True

    previous_total = int(latest_snapshot.get("totalVotesCast") or 0)
    next_total = int(next_snapshot.get("totalVotesCast") or 0)

    if previous_total == next_total:
        print(
            "No updated votes: the overall number of votes counted is unchanged "
            f"at {next_total:,}."
        )
        return False

    vote_difference = next_total - previous_total
    print(
        "Updated votes: the overall number of votes counted changed from "
        f"{previous_total:,} to {next_total:,} ({vote_difference:+,})."
    )
    return True


def update_party_vote_snapshots(results, vote_count_data):
    source_path = next(
        (path for path in party_vote_snapshot_paths if path.exists()),
        None,
    )

    if source_path:
        with source_path.open(encoding="utf-8") as handle:
            history = json.load(handle)
    else:
        history = {"version": 1, "election": "2026", "snapshots": []}

    if not isinstance(history.get("snapshots"), list):
        raise ValueError("party_vote_snapshots.json must contain a snapshots array")

    next_snapshot = build_party_vote_snapshot(results, vote_count_data)
    latest_snapshot = history["snapshots"][-1] if history["snapshots"] else None

    if not report_vote_count_difference(latest_snapshot, next_snapshot):
        return False

    history["snapshots"].append(next_snapshot)

    for output_path in party_vote_snapshot_paths:
        atomic_write_json(output_path, history)

    return True


def read_election_statistics(path):
    tree = ET.parse(path)
    root = tree.getroot()
    statistics = root.find("statistics")

    if statistics is None:
        return {}

    return {child.tag: child.text for child in statistics}


def parse_candidates(path):
    root = ET.parse(path).getroot()
    return {
        candidate.attrib["c_no"]: {
            "party": (candidate.findtext("party") or "").strip(),
            "candidate_name": (candidate.findtext("candidate_name") or "").strip(),
        }
        for candidate in root.findall("candidate")
    }


def parse_electorates(path):
    root = ET.parse(path).getroot()
    return {
        electorate.attrib["e_no"]: DISPLAY_NAME_ALIASES.get(
            (electorate.findtext("electorate_name") or "").strip(),
            (electorate.findtext("electorate_name") or "").strip(),
        )
        for electorate in root.findall("electorate")
    }


def normalize_svg_id(name):
    ascii_name = "".join(
        character
        for character in unicodedata.normalize("NFKD", name)
        if not unicodedata.combining(character)
    )
    ascii_name = ascii_name.replace("'", "")
    return re.sub(r"[^A-Za-z0-9-]+", "_", ascii_name).strip("_")


def load_svg_layer_ids(path):
    root = ET.parse(path).getroot()
    layer_ids = []

    for element in root.iter():
        tag_name = element.tag.split("}")[-1]
        element_id = element.attrib.get("id")

        if tag_name in {"g", "path"} and element_id:
            layer_ids.append(element_id)

    return layer_ids


def load_electorate_xmls(base_dir):
    xml_paths = []
    for electorate_dir in sorted(base_dir.glob("e[0-9][0-9]")):
        xml_path = electorate_dir / f"{electorate_dir.name}.xml"
        if xml_path.exists():
            xml_paths.append(xml_path)
    return xml_paths


def tokenize_name(name):
    return [token.lower() for token in re.split(r"[_-]+", name) if token]


def pick_svg_match(normalized_name, svg_group_ids, svg_aliases):
    if normalized_name in svg_group_ids:
        return normalized_name, "exact"

    for svg_id, alias_target in svg_aliases.items():
        if alias_target == normalized_name and svg_id in svg_group_ids:
            return svg_id, "alias"

    best_svg_id = None
    best_score = 0
    normalized_tokens = set(tokenize_name(normalized_name))

    for svg_id in svg_group_ids:
        svg_tokens = set(tokenize_name(svg_id))
        token_overlap = len(normalized_tokens & svg_tokens)
        sequence_score = SequenceMatcher(
            None,
            normalized_name.lower(),
            svg_id.lower(),
        ).ratio()
        score = sequence_score + token_overlap * 0.18

        if score > best_score:
            best_score = score
            best_svg_id = svg_id

    if best_svg_id and best_score >= 0.88:
        return best_svg_id, "fuzzy"

    return normalized_name, "none"


def build_electorate_winner_lookup():
    candidate_lookup = parse_candidates(candidate_path)
    electorate_names = parse_electorates(electorates_path)
    parties = convert_to_dict(parties_path)
    party_lookup = build_party_lookup(parties)
    svg_layer_ids = load_svg_layer_ids(map_svg_path)

    winners_by_svg_id = {
        svg_id: {
            "svg_id": svg_id,
            "has_svg_match": False,
            "electorate_name": None,
            "electorate_number": None,
            "winner_party_code": None,
            "winner_party_short_name": None,
            "winner_party_name": None,
            "winner_votes": 0,
            "total_valid_candidate_votes": 0,
        }
        for svg_id in svg_layer_ids
    }
    winners_by_electorate_number = {}

    for electorate_xml in load_electorate_xmls(ROOT_DIR):
        root = ET.parse(electorate_xml).getroot()
        electorate_number = root.attrib["e_no"]
        electorate_name = electorate_names.get(electorate_number, "")
        normalized_name = normalize_svg_id(electorate_name)
        svg_id, match_method = pick_svg_match(
            normalized_name,
            svg_layer_ids,
            SVG_NAME_ALIASES,
        )
        has_svg_match = svg_id in winners_by_svg_id

        party_vote_counts = Counter()
        for candidate in root.find("candidatevotes").findall("candidate"):
            candidate_number = candidate.attrib["c_no"]
            candidate_meta = candidate_lookup.get(candidate_number, {})
            party_code = candidate_meta.get("party", "")

            if not party_code:
                continue

            votes = int((candidate.findtext("votes") or "0").strip())
            party_vote_counts[party_code] += votes

        if party_vote_counts:
            winner_party_code, winner_votes = max(
                party_vote_counts.items(),
                key=lambda item: item[1],
            )
            winner_party = party_lookup.get(winner_party_code, {})
        else:
            winner_party_code = None
            winner_votes = 0
            winner_party = {}

        electorate_result = {
            "svg_id": svg_id,
            "has_svg_match": has_svg_match,
            "match_method": match_method,
            "normalized_name": normalized_name,
            "electorate_name": electorate_name,
            "electorate_number": electorate_number,
            "winner_party_code": winner_party_code,
            "winner_party_short_name": winner_party.get("short_name", ""),
            "winner_party_name": winner_party.get("party_name", ""),
            "winner_votes": winner_votes,
            "total_valid_candidate_votes": sum(party_vote_counts.values()),
        }
        winners_by_electorate_number[electorate_number] = electorate_result

        if has_svg_match:
            winners_by_svg_id[svg_id] = electorate_result

    unmatched_svg_ids = [
        svg_id
        for svg_id, result in winners_by_svg_id.items()
        if not result["has_svg_match"]
    ]

    return {
        "by_electorate_number": winners_by_electorate_number,
        "by_svg_id": winners_by_svg_id,
        "unmatched_svg_ids": unmatched_svg_ids,
    }


def build_electorate_details():
    candidate_lookup = parse_candidates(candidate_path)
    electorate_names = parse_electorates(electorates_path)
    parties = convert_to_dict(parties_path)
    party_lookup = build_party_lookup(parties)
    svg_layer_ids = load_svg_layer_ids(map_svg_path)
    electorate_notional_shares = load_notional_shares(electorate_notionals_path)
    party_vote_notional_shares = load_notional_shares(party_vote_notionals_path)
    details_by_electorate_number = {}

    for electorate_xml in load_electorate_xmls(ROOT_DIR):
        root = ET.parse(electorate_xml).getroot()
        statistics = root.find("statistics")
        electorate_number = root.attrib["e_no"]
        electorate_name = electorate_names.get(electorate_number, "")
        normalized_name = normalize_svg_id(electorate_name)
        electorate_previous = electorate_notional_shares.get(normalized_name, {})
        party_vote_previous = party_vote_notional_shares.get(normalized_name, {})
        electorate_previous_shares = electorate_previous.get("shares", {})
        party_vote_previous_shares = party_vote_previous.get("shares", {})
        party_vote_previous_votes = party_vote_previous.get("votes", {})
        svg_id, match_method = pick_svg_match(
            normalized_name,
            svg_layer_ids,
            SVG_NAME_ALIASES,
        )

        candidate_results = []
        party_vote_results = []
        party_vote_counts = Counter()
        party_ballot_counts = Counter()

        for candidate in root.find("candidatevotes").findall("candidate"):
            candidate_number = candidate.attrib["c_no"]
            candidate_meta = candidate_lookup.get(candidate_number, {})
            party_code = candidate_meta.get("party", "")
            party_meta = party_lookup.get(party_code, {})
            votes = int((candidate.findtext("votes") or "0").strip())

            candidate_results.append(
                {
                    "candidate_number": candidate_number,
                    "candidate_name": candidate_meta.get("candidate_name", ""),
                    "party_code": party_code,
                    "party_short_name": party_meta.get("short_name", ""),
                    "party_name": party_meta.get("party_name", ""),
                    "votes": votes,
                }
            )

            if party_code:
                party_vote_counts[party_code] += votes

        for party in root.find("partyvotes").findall("party"):
            party_code = party.attrib["p_no"]
            party_meta = party_lookup.get(party_code, {})
            votes = int((party.findtext("votes") or "0").strip())

            party_vote_results.append(
                {
                    "party_code": party_code,
                    "party_short_name": party_meta.get("short_name", ""),
                    "party_name": party_meta.get("party_name", ""),
                    "votes": votes,
                }
            )
            party_ballot_counts[party_code] += votes

        total_valid_candidate_votes = sum(
            candidate["votes"] for candidate in candidate_results
        )
        total_valid_party_votes = sum(
            party_result["votes"] for party_result in party_vote_results
        )

        candidate_results.sort(
            key=lambda candidate: candidate["votes"],
            reverse=True,
        )
        party_vote_results.sort(
            key=lambda party_result: party_result["votes"],
            reverse=True,
        )

        for candidate in candidate_results:
            if total_valid_candidate_votes == 0:
                candidate["vote_share"] = 0
            else:
                candidate["vote_share"] = round(
                    (candidate["votes"] / total_valid_candidate_votes) * 100,
                    2,
                )
            previous_share = find_notional_share(
                electorate_previous_shares,
                party_lookup.get(candidate["party_code"], {}),
                candidate_name=candidate["candidate_name"],
                independent=candidate["party_code"] == "0",
            )
            candidate["previous_vote_share"] = (
                round(previous_share, 2) if previous_share is not None else None
            )
            candidate["change"] = (
                round(candidate["vote_share"] - previous_share, 2)
                if previous_share is not None
                else None
            )

        for party_result in party_vote_results:
            if total_valid_party_votes == 0:
                party_result["vote_share"] = 0
            else:
                party_result["vote_share"] = round(
                    (party_result["votes"] / total_valid_party_votes) * 100,
                    2,
                )
            previous_share = find_notional_share(
                party_vote_previous_shares,
                party_lookup.get(party_result["party_code"], {}),
            )
            previous_votes = find_notional_share(
                party_vote_previous_votes,
                party_lookup.get(party_result["party_code"], {}),
            )
            party_result["previous_votes"] = (
                round(previous_votes, 4) if previous_votes is not None else None
            )
            party_result["previous_vote_share"] = (
                round(previous_share, 2) if previous_share is not None else None
            )
            party_result["change"] = (
                round(party_result["vote_share"] - previous_share, 2)
                if previous_share is not None
                else None
            )

        if party_vote_counts:
            winner_party_code, winner_party_votes = max(
                party_vote_counts.items(),
                key=lambda item: item[1],
            )
            winner_party = party_lookup.get(winner_party_code, {})
        else:
            winner_party_code = None
            winner_party_votes = 0
            winner_party = {}

        if party_ballot_counts:
            leading_party_vote_code, leading_party_vote_total = max(
                party_ballot_counts.items(),
                key=lambda item: item[1],
            )
            leading_party_vote_meta = party_lookup.get(leading_party_vote_code, {})
        else:
            leading_party_vote_code = None
            leading_party_vote_total = 0
            leading_party_vote_meta = {}

        details_by_electorate_number[electorate_number] = {
            "electorate_number": electorate_number,
            "electorate_name": electorate_name,
            "svg_id": svg_id,
            "match_method": match_method,
            "winner_party_code": winner_party_code,
            "winner_party_short_name": winner_party.get("short_name", ""),
            "winner_party_name": winner_party.get("party_name", ""),
            "winner_party_votes": winner_party_votes,
            "leading_party_vote_code": leading_party_vote_code,
            "leading_party_vote_short_name": leading_party_vote_meta.get("short_name", ""),
            "leading_party_vote_name": leading_party_vote_meta.get("party_name", ""),
            "leading_party_vote_total": leading_party_vote_total,
            "total_voting_places_counted": int(
                (statistics.findtext("total_voting_places_counted") or "0").strip()
            ),
            "percent_voting_places_counted": float(
                (statistics.findtext("percent_voting_places_counted") or "0").strip()
            ),
            "total_votes_cast": int(
                (statistics.findtext("total_votes_cast") or "0").strip()
            ),
            "percent_votes_cast": float(
                (statistics.findtext("percent_votes_cast") or "0").strip()
            ),
            "total_valid_candidate_votes": total_valid_candidate_votes,
            "total_valid_party_votes": total_valid_party_votes,
            "previous_total_valid_party_votes": round(
                party_vote_previous.get("total_votes", 0),
                4,
            ),
            "candidate_results": candidate_results,
            "party_vote_results": party_vote_results,
        }

    return {
        "by_electorate_number": details_by_electorate_number,
    }


def main():
    parties = convert_to_dict(parties_path)
    results = convert_to_dict(results_path, parent_tag="partystatus")
    statistics = read_election_statistics(results_path)

    party_lookup = build_party_lookup(parties)
    enriched_results = build_results_with_party_names(results, party_lookup)
    electorate_map_results = build_electorate_winner_lookup()
    electorate_details = build_electorate_details()

    vote_count_data = {
        "label": "Percentage of votes counted",
        "value": statistics.get("percent_voting_places_counted", "0"),
        "total_voting_places_counted": statistics.get("total_voting_places_counted", "0"),
        "percent_voting_places_counted": statistics.get("percent_voting_places_counted", "0"),
        "total_votes_cast": statistics.get("total_votes_cast", "0"),
        "percent_votes_cast": statistics.get("percent_votes_cast", "0"),
    }

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    update_party_vote_snapshots(enriched_results, vote_count_data)

    for output_path in results_output_paths:
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(enriched_results, handle, ensure_ascii=False, indent=2)

    for output_path in vote_count_output_paths:
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(vote_count_data, handle, ensure_ascii=False, indent=2)

    for output_path in electorate_map_output_paths:
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(electorate_map_results, handle, ensure_ascii=False, indent=2)

    for output_path in electorate_details_output_paths:
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(electorate_details, handle, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
