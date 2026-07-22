import json
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from difflib import SequenceMatcher


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR / "XMLfiles"

candidate_path = ROOT_DIR / "candidates.xml"
parties_path = ROOT_DIR / "parties.xml"
electorates_path = ROOT_DIR / "electorates.xml"
results_path = ROOT_DIR / "election.xml"
map_svg_path = BASE_DIR / "nzmap.svg"
results_output_path = BASE_DIR / "results.json"
vote_count_output_path = BASE_DIR / "vote_count.json"
electorate_map_output_path = BASE_DIR / "electorate_winners.json"
electorate_details_output_path = BASE_DIR / "electorate_details.json"

SVG_NAME_ALIASES = {
    "East_Cape": "East_Coast",
    "Kapiti": "Otaki",
    "Mt_Maunganui": "Tauranga",
    "Wellington_Bays": "Wellington_Central",
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
        electorate.attrib["e_no"]: (electorate.findtext("electorate_name") or "").strip()
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
    details_by_electorate_number = {}

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

        for party_result in party_vote_results:
            if total_valid_party_votes == 0:
                party_result["vote_share"] = 0
            else:
                party_result["vote_share"] = round(
                    (party_result["votes"] / total_valid_party_votes) * 100,
                    2,
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
            "total_valid_candidate_votes": total_valid_candidate_votes,
            "total_valid_party_votes": total_valid_party_votes,
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

    with results_output_path.open("w", encoding="utf-8") as handle:
        json.dump(enriched_results, handle, ensure_ascii=False, indent=2)

    with vote_count_output_path.open("w", encoding="utf-8") as handle:
        json.dump(vote_count_data, handle, ensure_ascii=False, indent=2)

    with electorate_map_output_path.open("w", encoding="utf-8") as handle:
        json.dump(electorate_map_results, handle, ensure_ascii=False, indent=2)

    with electorate_details_output_path.open("w", encoding="utf-8") as handle:
        json.dump(electorate_details, handle, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
