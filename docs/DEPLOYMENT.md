# Deployment: GitHub Pages (dnncstepstosuccess.com)

Repository: https://github.com/WETTENTLLC/stepstosuccess

**Nothing is published.** The workflow only deploys from a manual run, after the launch gate passes and a reviewer approves the `github-pages` environment. DNS has not been touched.

## Architecture
- Local dev/staging: `npm start` (Node `server.js`, password-protected via `STAGING_PASSWORD`). Never deployed.
- Production: `npm run build:prod` writes `dist/` (static files only) via an allowlist: HTML, `css/`, `js/`, `img/`, `images/optimized/`, `404.html`, `.nojekyll`, redirect stubs, and (only when launch is approved) `robots.txt` allow + `sitemap.xml` + `CNAME`.
- Never in `dist/`: `server.js`, `lib/`, `config/`, `assets/`, `review/`, `.env*`, photo originals, form submissions.
- `config/site.json` controls launch state. While `launchApproved` is `false` the build is a **noindex preview**: `noindex` meta, `Disallow: /` robots, no sitemap, no `CNAME`.

## Workflow (`.github/workflows/deploy.yml`)
1. Checkout, `npm ci`
2. Build + dev-server suites (seo, security, a11y, check)
3. Production build + `test:dist` (serves `dist/` like GitHub Pages: a11y, link and asset resolution, CSP, forms inert, smoke)
4. Launch gate (informational on normal runs; a hard stop in the deploy job)
5. Artifact upload, then `deploy` (manual, `deploy=true`, `main` only, protected environment)
6. `smoke` against `https://dnncstepstosuccess.com --expect-live`

One-time GitHub setup: Settings > Pages > Source = GitHub Actions. Settings > Environments > `github-pages` > add required reviewers. Enable branch protection on `main`.

## Forms (external service)
The Node handlers cannot run on Pages. The four forms render as plain HTML POST forms (`method=post`, `action` = approved endpoint), with the honeypot field, accessible labels, consent text and client-side validation in `public/js/forms.js`.
They are **disabled** (button disabled, "not yet available" notice) until all of `config/forms.json` `approvals` are true and `provider.endpoints.<form>` holds an `https://` URL. Recipient addresses are configured inside the external service, never in this repo. Candidate services: Formspree, Basin, Web3Forms, or your own serverless endpoint. Use the service's own spam protection (and CAPTCHA if desired; add its origin to the CSP in `build.js`). Test every form end to end before setting `endpointTested`.

## Donations (external platform)
`config/donations.json` holds only public hosted-checkout URLs (`checkoutUrls.oneTime`, `checkoutUrls.monthly`). Payments, recurring billing, confirmations and receipts stay with the provider. No keys or credentials belong in JS or this repo. Disabled until all four verification approvals are true.

## Domain and DNS (do not change until launch approval)
1. Confirm who controls the registrar account for `dnncstepstosuccess.com`.
2. Export and save the current DNS zone first. **Preserve all MX, SPF (TXT), DKIM and DMARC records.**
3. GitHub: org/user Settings > Pages > Verified domains > add the domain (TXT challenge record) and verify.
4. Repo Settings > Pages > Custom domain = `dnncstepstosuccess.com`, save. (The deployed artifact includes `CNAME` only after launch approval.)
5. DNS at launch: apex `A` records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (and the matching `AAAA` records from GitHub docs); `www` `CNAME` to `wettentllc.github.io`. Re-check these against GitHub's current docs before applying.
6. Wait for the certificate, then enable **Enforce HTTPS**.
7. Apex is canonical. Pages redirects `www` to the apex automatically when both are configured. Verify both.
8. Run `npm run smoke -- https://dnncstepstosuccess.com --expect-live`.

## SEO migration
- Pages cannot send 301/410. Verified legacy URLs become static stub pages (meta refresh + canonical to the target). Currently confirmed: `/program-activites/` -> `/programs/`.
- Legacy URLs in `config/redirects.json` are limited to paths confirmed in the Wayback Machine; unconfirmed guesses were removed. Do not redirect unknown URLs to the homepage.
- Old WordPress paths (`/wp-login.php`, `/wp-admin/`, `/xmlrpc.php`, `/wp-content/`, ...) return 404 on Pages instead of 410.
- If true 301s are needed, put Cloudflare (or similar) in front and add redirect rules.
- Set `launchApproved: true` only at launch: this removes `noindex`, publishes the production `robots.txt` and `sitemap.xml`, and adds `CNAME`. Then add the property in Search Console and submit the sitemap. Add analytics only after the privacy policy is approved.

## Security and privacy
- **The GitHub repository is public (it loads without a login).** Anything committed is public, including history. Originals (`assets/originals/`, raw `public/images/<category>/`) and `assets/photos.json` (people and permission notes) are git-ignored and kept only in the private local backup. Do not commit them.
- The optimized WebP photos in `public/images/optimized/` are committed and are therefore public once pushed. All 19 are still `staging` (identity/consent unconfirmed). Resolve before pushing, or keep the repo private (GitHub Pages from a private repo needs a paid plan; the published site is public either way).
- Staging stays separate and access-controlled (`server.js` + `STAGING_PASSWORD`, run locally or on a private host).
- CSP is a meta tag (Pages cannot send headers); `frame-ancestors` and other header-only protections are unavailable.
- Backups: `npm run backup` writes to a folder outside the repo.

## Commands
| Command | Purpose |
|---|---|
| `npm run build:prod` | Build `dist/` |
| `npm run test:dist` | Test `dist/` as Pages serves it |
| `npm run launch-gate` | List remaining launch blockers (exit 1 while any remain) |
| `npm run smoke -- <url> [--expect-live]` | Post-deploy checks |
