# competitive-app

Solvenna public competitive marketing benchmark demo: static front end plus a Netlify Function that calls Claude for **Priority Plays**.

## Live site

https://venerable-fairy-1d30be.netlify.app

## Layout

- `dist/` — static site (Vite build output) and `dist/data/demo.json`
- `netlify/functions/` — `analyze.mjs` (Claude proxy) and `opportunity-playbook.mjs`
- `netlify.toml` — publish + functions config
- `scripts/` — helpers to rebuild the demo JSON snapshot from DuckDB (when available)

## Deploy

Set `ANTHROPIC_API_KEY` on the Netlify site (never commit it). From this folder:

```bash
netlify deploy --prod --dir=dist --functions=netlify/functions
```

See `DEPLOY.md` for Windows notes.

## Notes

- Demo month is locked to February 2026 in the current snapshot.
- Priority Plays uses Sonnet (`claude-sonnet-4-5-20250929`) with a coach playbook derived from Solvenna metric rules.
