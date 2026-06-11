#!/usr/bin/env python3

import csv
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET


BASE_DIR = Path(__file__).resolve().parent / "XMLfiles"
PARTIES_XML = BASE_DIR / "parties.xml"
CANDIDATES_XML = BASE_DIR / "candidates.xml"
ELECTORATES_XML = BASE_DIR / "electorates.xml"

PARTY_VOTE_OUTPUT = Path(__file__).resolve().parent / "party_vote_by_electorate.csv"
ELECTORATE_VOTE_OUTPUT = Path(__file__).resolve().parent / "electorate_vote_by_electorate.csv"

TARGET_PARTIES = [
    ("National Party percentage", "National Party"),
    ("Labour Party percentage", "Labour Party"),
    ("Green percentage", "Green Party"),
    ("ACT percentage", "ACT New Zealand"),
    ("NZ First percentage", "New Zealand First Party"),
    ("Māori percentage", "Te Pāti Māori"),
    ("TOP percentage", "The Opportunities Party (TOP)"),
]

CSV_HEADERS = ["Electorate name", *[label for label, _ in TARGET_PARTIES], "Others percentage"]


def parse_parties(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    root = ET.parse(path).getroot()
    party_numbers_to_names = {
        party.attrib["p_no"]: (party.findtext("short_name") or "").strip()
        for party in root.findall("party")
    }
    party_names_to_numbers = {
        party_name: party_no for party_no, party_name in party_numbers_to_names.items()
    }
    return party_numbers_to_names, party_names_to_numbers


def parse_candidates(path: Path) -> dict[str, str]:
    root = ET.parse(path).getroot()
    return {
        candidate.attrib["c_no"]: (candidate.findtext("party") or "").strip()
        for candidate in root.findall("candidate")
    }


def parse_electorates(path: Path) -> dict[str, str]:
    root = ET.parse(path).getroot()
    return {
        electorate.attrib["e_no"]: (electorate.findtext("electorate_name") or "").strip()
        for electorate in root.findall("electorate")
    }


def format_percentage(numerator: int, denominator: int) -> str:
    if denominator == 0:
        return "0.0000"
    return f"{(numerator / denominator) * 100:.4f}"


def build_row(
    electorate_name: str,
    counts: Counter[str],
    key_parties: list[tuple[str, str]],
) -> list[str]:
    total_votes = sum(counts.values())
    key_party_votes = sum(counts.get(party_no, 0) for _, party_no in key_parties)
    others_votes = total_votes - key_party_votes

    row = [electorate_name]
    for _, party_no in key_parties:
        row.append(format_percentage(counts.get(party_no, 0), total_votes))
    row.append(format_percentage(others_votes, total_votes))
    return row


def load_electorate_xmls(base_dir: Path) -> list[Path]:
    xml_paths = []
    for electorate_dir in sorted(base_dir.glob("e[0-9][0-9]")):
        xml_path = electorate_dir / f"{electorate_dir.name}.xml"
        if xml_path.exists():
            xml_paths.append(xml_path)
    return xml_paths


def write_csv(path: Path, rows: list[list[str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(CSV_HEADERS)
        writer.writerows(rows)


def main() -> None:
    _, party_names_to_numbers = parse_parties(PARTIES_XML)
    candidate_to_party = parse_candidates(CANDIDATES_XML)
    electorate_names = parse_electorates(ELECTORATES_XML)
    key_parties = [(label, party_names_to_numbers[party_name]) for label, party_name in TARGET_PARTIES]

    party_vote_rows = []
    electorate_vote_rows = []

    for electorate_xml in load_electorate_xmls(BASE_DIR):
        root = ET.parse(electorate_xml).getroot()
        electorate_no = root.attrib["e_no"]
        electorate_name = electorate_names[electorate_no]

        party_vote_counts: Counter[str] = Counter()
        for party in root.find("partyvotes").findall("party"):
            party_no = party.attrib["p_no"]
            votes = int((party.findtext("votes") or "0").strip())
            party_vote_counts[party_no] += votes

        candidate_vote_counts: Counter[str] = Counter()
        for candidate in root.find("candidatevotes").findall("candidate"):
            candidate_no = candidate.attrib["c_no"]
            party_no = candidate_to_party.get(candidate_no, "")
            votes = int((candidate.findtext("votes") or "0").strip())
            candidate_vote_counts[party_no] += votes

        party_vote_rows.append((int(electorate_no), build_row(electorate_name, party_vote_counts, key_parties)))
        electorate_vote_rows.append((int(electorate_no), build_row(electorate_name, candidate_vote_counts, key_parties)))

    party_vote_rows.sort(key=lambda item: item[0])
    electorate_vote_rows.sort(key=lambda item: item[0])

    write_csv(PARTY_VOTE_OUTPUT, [row for _, row in party_vote_rows])
    write_csv(ELECTORATE_VOTE_OUTPUT, [row for _, row in electorate_vote_rows])


if __name__ == "__main__":
    main()
