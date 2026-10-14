# Private Online Review Site (Cloudflare Pages + Cloudflare Access)

Purpose: let Delane Sims review the site remotely. Not a launch. Production domain and DNS are not touched.

## What gets deployed
Only `dist/` from `npm run build:review`. The script refuses to finish if the output contains the Zelle QR, any non-optimized photo, source/config/private folders, bank details, a sitemap or CNAME, or lacks noindex. The online build has no QR; the Donate page shows the Zelle email and recipient name only. Forms stay in preview mode (nothing is sent). Donations are off.

## One-time setup (needs the organization's Cloudflare login; free plan is enough)
1. Install and sign in: `npx wrangler login` (opens a browser).
2. Build: `npm run build:review`
3. Create and deploy: `npx wrangler pages deploy dist --project-name dnnc-review --branch main`
   Result: `https://dnnc-review.pages.dev` (the exact name is printed; if taken, pick another).
4. **Protect it before sharing the link** (Cloudflare dashboard > Zero Trust > Access > Applications > Add > Self-hosted):
   - Application domain: `dnnc-review.pages.dev`, and add a second entry `*.dnnc-review.pages.dev` so preview deployments are covered.
   - Policy: Action **Allow**, Include **Emails**: Delane's address and the two reviewers in Reno. Nobody else.
   - Identity: One-time PIN (email code). Session duration 24 hours.
   - In Pages > project > Settings > Access policy, enabling "Cloudflare Access" for the project does the same in one click.
5. Check from an outside device (phone on cellular, not the office Wi-Fi): the link must show the Cloudflare sign-in, not the site, until a code is entered. Then confirm:
   - the site loads after sign-in, `/robots.txt` disallows all, and response headers include `X-Robots-Tag: noindex`;
   - `/images/zelle/zelle-qr.png` is 404;
   - forms say "Preview only";
   - an unlisted email never receives a code.

## Updating the preview
`npm run build:review` then `npx wrangler pages deploy dist --project-name dnnc-review --branch main`.

## Instructions to send Delane
1. Open the review link on your phone, tablet or computer.
2. Enter your email address on the Cloudflare page and tap **Send me a code**.
3. Open the email from Cloudflare Access, copy the 6-digit code and enter it. Check spam if it does not arrive within a minute.
4. Browse the whole site. Forms and donations are not live; nothing you type is sent.
5. Record changes and approvals in `DELANE-REVIEW.md`, or reply with notes.

## Taking it down
Delete the Pages project (dashboard > Workers & Pages > dnnc-review > Delete) after approval.

## Do not
Do not deploy `public/`, the repo root, or `npm run build:local-qr` output. That one includes the QR and is for local preview only.
