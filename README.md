# competitive-app

Solvenna's public competitive marketing benchmark. The page compares a retailer with peers on February 2026 metrics, and a Netlify Function asks Claude for **Priority Plays**.

Live site: https://venerable-fairy-1d30be.netlify.app

## Get a local copy

```bash
git clone git@github.com:Solvenna/competitive-app.git
cd competitive-app
npm ci
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The dev server stubs `POST /api/analyze` so Priority Plays renders without an API key. The stub waits a few seconds so the loading taglines can rotate. It is not used in the production build.

```bash
npm test          # formatter, search, and packet checks
npm run build     # writes dist/ (gitignored)
npm run preview   # serves that build, with the same local analyze stub
```

Node 22 is what Netlify uses (`NODE_VERSION` in `netlify.toml`).

## Priority Plays against Claude

`netlify dev` runs the Vite app and the real function in `netlify/functions/analyze.mjs`.

```bash
npm i -g netlify-cli
netlify dev
```

`ANTHROPIC_API_KEY` has to be available to that process. Locally, `netlify dev` pulls env vars from the linked site, or you can export the key in your shell. Do not commit it, and do not put it in a file that gets pushed. Production and deploy previews read it from the Netlify site's environment variables (Site configuration → Environment variables). The model is `claude-sonnet-4-5-20250929`.

If the function is missing or returns an error, the page falls back to a canned Best Buy sample so the layout still renders.

## Regenerate `demo.json`

`public/data/demo.json` is the February 2026 snapshot (about 2,250 companies). Vite copies `public/` into the site root, so the app still requests `/data/demo.json`.

The rebuild script reads a local DuckDB and writes that file:

```bash
# optional overrides
export QUICKLIFT_DUCKDB=/path/to/quicklift-readonly.duckdb
export DEMO_JSON_OUT=public/data/demo.json

python3 scripts/build_demo_json.py
```

It needs `duckdb`, `numpy`, and `pandas`. The default database path is `/home/box/quicklift-readonly.duckdb`. The script also writes `public/data/IMPUTATION_NOTES.md`. If `METRIC_MAP.md` is not in the repo, that update is skipped.

Commit the regenerated `public/data/demo.json` in a pull request. Do not commit `dist/`.

## How to change the app

Work on a branch and open a pull request into `main`. Netlify builds from Git; pushing a hand-built `dist/` does not update the site.

```bash
git checkout -b your-branch
# edit src/, public/, or netlify/functions/
npm test && npm run build
git push -u origin your-branch
```

Merging to `main` is what publishes. See `DEPLOY.md`.

## Layout

- `index.html`, `src/` — Vite app (vanilla JS). `src/main.js` boots contrast, tooltips, the month form, and the comparison.
- `src/workers/demo-worker.js` — indexes the snapshot off the main thread.
- `public/data/demo.json` — company catalog. `public/solvenna-logo.png` — logo and favicon.
- `src/fonts/` — Source Sans 3 files used by the previous production build.
- `netlify/functions/analyze.mjs` — Claude proxy. `opportunity-playbook.mjs` — coach rules injected into the prompt.
- `netlify.toml` — build command, publish directory, functions directory, Node 22.
- `scripts/build_demo_json.py` — rebuilds the snapshot from DuckDB.

The demo month is locked to February 2026. Other months open a lead form with one email-or-phone field. It posts to Netlify Forms (`benchmark-lead`). `npm run dev` and `npm run preview` accept that post locally so the thank-you state can be reviewed; they do not send mail.
