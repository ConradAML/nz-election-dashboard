# Party vote snapshot collection

`convert_xml_to_json.py` now records a timestamped party-vote snapshot whenever it processes changed election results.

Run the converter as part of every XML data refresh:

```sh
python3 convert_xml_to_json.py
```

Snapshots are written to both:

- `party_vote_snapshots.json` — persistent source history
- `myapp/public/party_vote_snapshots.json` — file published with the React app

The collector compares only the overall `totalVotesCast` value with the latest snapshot. A new snapshot is appended when that total changes; otherwise the update is ignored. Writes use a temporary file and atomic replacement so the app cannot read a partially written history file.

Because GitHub Pages is read-only, the updated snapshot files must be committed and deployed after the collector runs. The browser app only reads the history; it never attempts to write it.

At the start of a future election, archive the existing snapshot file and initialize a new file with the same top-level structure and an empty `snapshots` array.
