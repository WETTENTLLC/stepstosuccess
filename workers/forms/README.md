# DNNC forms Worker

Independent Cloudflare Worker that receives the four inquiry forms (`contact`, `scholarship`, `volunteer`, `corporate`) for the GitHub Pages site.

**Status: built and tested locally, not deployed, delivery disabled.**

Endpoints: `POST /<form>` with `application/x-www-form-urlencoded`.

It checks the allowed origin, body size, a hidden honeypot field (`website`), a Cloudflare Turnstile token (`cf-turnstile-response`) and field rules matching `lib/forms.js`. Nothing is stored. Valid submissions are emailed to the recipient only.

Config (not in the repo): secrets `TURNSTILE_SECRET`, `RECIPIENT`, `SENDER`; an email binding named `MAILER`. `DELIVERY_ENABLED` stays `"false"` (returns 503) until the organization approves the recipient (planned: delane@delanesnails.com), privacy language and retention, and a live test passes.

Tests: `npm run test:worker` (also checks the schema matches `lib/forms.js`).

Hooking up the site later: set `config/forms.json` endpoints to the deployed Worker URLs and the approvals to `true`, add the Turnstile widget, then run the launch gate.
