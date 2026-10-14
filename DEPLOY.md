# Deploy the marketing benchmark to Netlify

The site builds from this Git repo. Netlify runs `npm ci && npm run build`, publishes `dist/`, and deploys `netlify/functions`. Production updates when a pull request merges to `main`. Deploy previews are created for pull requests.

Do not deploy by committing `dist/` or by running `netlify deploy --prod` against a local folder. That path used to publish the checked-in build and bypasses review.

## Connect the existing site

The live site is https://venerable-fairy-1d30be.netlify.app. Link it to `Solvenna/competitive-app` once, from the Netlify UI:

1. Open the site → **Project configuration** → **Build & deploy** → **Continuous deployment** → **Link repository**.
2. Choose GitHub and the `Solvenna/competitive-app` repository.
3. Production branch: `main`.
4. Build settings come from `netlify.toml`. Confirm them if the UI asks:
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Node version: `22` (`NODE_VERSION` in `netlify.toml`)
5. Under **Environment variables**, set `ANTHROPIC_API_KEY` for production and for deploy previews. The key stays in Netlify. It is not in the repo.
6. Under **Build & deploy** → **Deploy contexts**, leave deploy previews enabled so each pull request gets a preview URL.

After the link is saved, the next merge to `main` builds and publishes. Opening a pull request builds a preview without changing production. This repository change does not itself retarget the live site; someone with access to the Netlify site has to connect the repo.

## What a build produces

- Static files from Vite, including `/data/demo.json` and `/solvenna-logo.png` copied from `public/`.
- The `analyze` function, exposed at `/api/analyze` (see the `config.path` export in `netlify/functions/analyze.mjs`). The page also tries `/.netlify/functions/analyze` if that path 404s.
- Function timeout is 26 seconds, set in `netlify.toml`.

## Check a deploy

- Netlify → Deploys shows the Git commit and a successful build.
- Netlify → Functions lists **analyze**.
- On the preview or production URL, pick a company, add and remove a competitor, and confirm Priority Plays returns a bottom line and four actions.
- A missing `ANTHROPIC_API_KEY` returns a 503 from the function. The page then shows the canned sample read.

## Lead form email notifications

The “Why only one month?” dialog submits one email-or-phone field to Netlify Forms. The form name is `benchmark-lead`. Netlify finds it from the hidden form in `index.html` when the site builds. Each submission also includes the company on screen, the Compare To list, the page URL, and whether the contact value is an email or a phone number.

After the site is linked to this repo and a deploy of this form has finished:

1. Open the site in Netlify → **Forms**. Confirm **benchmark-lead** is listed.
2. If it is missing, open **Project configuration** → **Forms**, turn **Form detection** on, then **Deploys** → **Trigger deploy** → **Deploy project**.
3. Open **Forms** → **benchmark-lead** → **Form notifications** → **Add notification** → **Email notification**.
4. Select `benchmark-lead`, enter the address that should receive each lead, and save.
5. New submissions are listed under **Forms** → **benchmark-lead** → **Submissions**.

On current credit-based plans, including the $0 Free plan, form submissions are unlimited and do not spend credits. On a legacy Free plan the cap is 100 submissions per site per month; Netlify emails the team as usage nears that cap, and further submissions wait until the next month or an upgrade. Check **Team overview** → **Billing** to see which plan this team is on. The honeypot field `bot-field` is there so Netlify can drop spam that fills it.

`npm run dev` and `npm run preview` answer the form post locally so the thank-you state can be reviewed. They do not create a Netlify submission or send email.

## Local function check

```bash
npm i -g netlify-cli
netlify link          # pick the existing site; do not create a second one
netlify dev           # Vite plus the real analyze function
```

`netlify dev` uses the site's environment variables, including `ANTHROPIC_API_KEY`. `npm run dev` alone stubs the analysis route and does not call Claude.
