# NZ Election Dashboard

The production build uses JSON generated from the Elections NZ XML feed. The
simulated 2026 dataset remains available for local UI testing.

## Data modes

All election-change comparisons use 2023 in both live and simulated modes.
National vote and seat charts use the 2023 results; electorate and regional vote
changes use the supplied 2023 notional results for the current boundaries. Map
seat changes use the 2023 notional winners, matched by electorate name.

```sh
# Elections NZ data (the default)
npm run dev:live

# Preserved deterministic test data
npm run dev:simulated
```

`VITE_DATA_SOURCE=live` and `VITE_DATA_SOURCE=simulated` can also be supplied
directly when building or running the app. A normal production `npm run build`
defaults to live data.

## Refreshing Elections NZ data

From the repository root:

```sh
cd myapp
npm run data:update
```

The downloader currently defaults to the 2023 archive. Override the feed for a
single run with:

```sh
ELECTION_XML_BASE_URL=https://media.election.net.nz/xml/ npm run data:update
```

The scheduled GitHub workflow uses the repository variable
`ELECTION_XML_BASE_URL`. When the 2026 feed becomes available, set that variable
to `https://media.election.net.nz/xml/`; no parser or application code needs to
change.

The single JavaScript update command first downloads only `election.xml` and
compares it with the previous check. If it is unchanged, the run stops after
that one small request. When it changes, the updater downloads and validates the
complete required feed, converts it to the dashboard JSON formats, and updates
the progression history. It replaces local files only after the full download
succeeds. The voting-place detail files are not downloaded by the Cloudflare
Worker because the dashboard does not use them.

The Worker records its last successful check in `/status`, even when the feed
is unchanged. The website shows that check time when configured with the Worker
URL. Every changed feed saves a vote-history snapshot, including corrections
that leave the total votes unchanged, and retains all result files in R2 under
that version. Failed checks keep the previously published results available.

To convert XML already stored locally without accessing the feed, run
`npm run data:convert`. The conversion core is in
`election-data/converter.js`; it does not use the filesystem or Node-specific
APIs, so the same module can be bundled into a Cloudflare Worker and run on a
Raspberry Pi with Node.js.

## Cloudflare fallback worker

The Worker configuration is bound to the private R2 bucket
`nz-election-results` and runs once per minute. Authenticate and deploy it with:

```sh
npx wrangler login
npm run worker:deploy
```

After deployment, set the GitHub repository variable `RESULTS_BASE_URL` to the
Worker URL printed by Wrangler, without a trailing slash. Production builds will
then load changing JSON from the Worker while maps and simulated test data remain
bundled with the site.

Use `npm run worker:dev` to test scheduled runs locally and
`npm run worker:tail` to watch production logs. Before the 2026 election, change
`ELECTION_XML_BASE_URL` and `ELECTION_YEAR` in
`election-data/wrangler.jsonc`, test, and redeploy.

For production diagnostics, set the `UPDATE_TOKEN` Worker secret with
`npx wrangler secret put UPDATE_TOKEN --config election-data/wrangler.jsonc`.
An authenticated `POST /admin/refresh` runs the same update as the Cron Trigger;
the endpoint is unavailable without that secret.

## Front-end development

For the Cloudflare website build, use `cd myapp && npm install && npm run build`
as the build command and `cd myapp && npm run website:deploy` as the deploy
command. This uploads and activates a version with a unique tag on every run,
without reapplying the existing website address settings. The results updater
continues to use the separate `worker:deploy` command.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
