from lxml import etree
from pathlib import Path
from pprint import pprint
import json

ROOT_DIR = Path("/Users/conradaml/Documents/NZXML/XMLfiles")


#Converting candidate, party, and electorate date from XML to dictionaries

candidate_path = ROOT_DIR / "candidates.xml"
parties_path = ROOT_DIR / "parties.xml"
electorates_path = ROOT_DIR / "electorates.xml"
results_path = ROOT_DIR / "election.xml"

def convert_to_dict(path, parent_tag=None):
    tree = etree.parse(str(path))
    root = tree.getroot()
    if parent_tag:
        root = root.find(parent_tag)
    conversion_dict = []
    for item in root:
        child_dict = {
            child.tag: child.text for child in item
        }
        child_dict.update(item.attrib)
        conversion_dict.append(child_dict)
    return conversion_dict

candidates = convert_to_dict(candidate_path)
parties = convert_to_dict(parties_path)
electorates = convert_to_dict(electorates_path)
results = convert_to_dict(results_path, parent_tag="partystatus")

party_lookup = {
    c["p_no"]: c["short_name"]
    for c in parties
}

party_and_vote = []

for vote in results:
    party_and_vote.append({
        "partyID": vote["p_no"],
        "voteShare": vote["percent_votes"],
        "name": party_lookup[vote["p_no"]]
    })

with open("results.json", "w") as f:
    json.dump(results, f)

# with open("headline_percent_results.csv", "w", newline="", encoding="utf-8") as file:
#     writer = csv.DictWriter(file, fieldnames=party_and_vote[0].keys())
#     writer.writeheader()
#     writer.writerows(party_and_vote)
