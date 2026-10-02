# Deploy QuickLift demo to Netlify (Windows)

This folder is ready for `netlify deploy --prod` without a Vite/npm build.
Static files live in `dist/`; the Claude proxy is `netlify/functions/analyze.mjs`.

## Steps

1. Install Netlify CLI (once):
   ```
   npm i -g netlify-cli
   ```

2. Open a terminal and go to this folder:
   ```
   cd C:\Users\RyanSteele\code\quicklift-public-demo\netlify-site
   ```

3. Log in to Netlify:
   ```
   netlify login
   ```

4. Link this folder to a Netlify site:
   - Existing site: `netlify link`
   - New site: `netlify init`

5. Set the Anthropic API key on the site (Netlify UI → Site configuration → Environment variables, or CLI):
   ```
   netlify env:set ANTHROPIC_API_KEY "your-key-here"
   ```

6. Deploy to production:
   ```
   netlify deploy --prod
   ```

7. Verify:
   - Netlify UI → Functions should list **analyze**
   - Open the site URL, change company, and confirm analysis returns

## Notes

- `netlify.toml` sets `publish = "dist"`, functions dir `netlify/functions`, `/api/*` → function rewrite, and analyze timeout 26s.
- No `npm run build` is required for this folder.
