# DNNC Steps to Success: Prelaunch Checklist and Outstanding Approvals

Status: **UNPUBLISHED STAGING.** All pages are `noindex`, forms are disabled, donations are disabled. Nothing below may be switched on without organizational approval.

## A. Outstanding organizational approvals

| # | Item | Needed for | Where it plugs in |
|---|------|------------|-------------------|
| 1 | Legal name, address, phone, email, hours (candidate details from the salon site are NOT verified for the nonprofit) | Footer, Contact, JSON-LD | `src/layout.html`, `src/pages/contact.html`, `build.js` |
| 2 | Tax-exempt status or fiscal sponsor, EIN, exact receipt language | Donate page, footer disclosure | `config/donations.json` |
| 3 | Payment recipient / payee and merchant account ownership | Donations | `config/donations.json` |
| 4 | Hosted payment processor choice and checkout links (one-time, monthly) | Donations | `config/donations.json` `checkoutUrls` |
| 5 | Suggested gift amounts (current $25/$50/$100/$250 are placeholders) | Donate page | `config/donations.json` |
| 6 | Form recipient addresses (one per form) | All forms | `config/forms.json` |
| 7 | Privacy Policy text (reviewed by counsel) | Forms, footer | `src/pages/privacy.html` |
| 8 | Data-retention period and deletion procedure | Forms | `config/forms.json` `retentionDays` |
| 9 | Response-time wording for the thank-you page | Forms | `src/pages/form-thanks.html` |
| 10 | Scholarship eligibility, dates, whether applications are open | Programs, Contact | `programs.html`, `contact.html` |
| 11 | Senior Moments details (what, where, when, cost, phone line) | Senior Moments | `senior-moments.html` |
| 12 | Volunteer roles and any screening requirements | Volunteer form | `form-volunteer.html` |
| 13 | Corporate sponsorship options and recognition benefits | Partners | `partners.html` |
| 14 | Delane Sims bio, title and quote; Myeshia Jefferson title | Our Story, Home | `our-story.html`, `home.html` |
| 15 | Awards and recognition claims (Mayor's Award 2018, Business of the Year) with source | Our Story, Partners | verify before any use |
| 16 | Photo identities, captions and written consent for participants and seniors | All photo pages | `assets/photos.json` |
| 17 | Permission or licence for NAILS Magazine and other third-party press photos (or link only) | Photos | `assets/photos.json` |
| 18 | Impact numbers (none published; supply approved figures with dates) | Impact | `impact.html` |
| 19 | Complete list of old WordPress URLs (Search Console or sitemap export) | Redirects | `config/redirects.json` |
| 20 | Domain ownership, registrar and DNS access confirmation | Launch | n/a |

## B. Technical prelaunch checklist

**Hosting and transport (GitHub Pages; details in DEPLOYMENT.md)**
- [ ] Registrar control of `dnncstepstosuccess.com` confirmed; current DNS zone exported; MX/SPF/DKIM/DMARC preserved.
- [ ] Domain verified in GitHub (TXT), custom domain set in Pages **before** DNS changes; A/AAAA + www CNAME applied; Enforce HTTPS on; apex and www tested.
- [ ] Pages source = GitHub Actions; `github-pages` environment has required reviewers; `main` branch protected.
- [ ] External form service chosen, recipients set in the service, each form tested end to end; `config/forms.json` approvals and endpoints filled.
- [ ] Hosted donation platform chosen and verified; `config/donations.json` filled (public checkout URLs only).
- [ ] Repo privacy decision made; no originals or `photos.json` in git history; all published photos `approved`.
- [ ] `config/site.json`: `domainOwnershipVerified` and `launchApproved` set only on written authorization; `npm run launch-gate` passes.
- [ ] Legacy URL guesses confirmed or dropped; Search Console property added and sitemap submitted after launch.
- [ ] Post-deploy `npm run smoke -- https://dnncstepstosuccess.com --expect-live` passes.
- [ ] (Superseded by the above: the old server-based hosting items below no longer apply to production.)
- [ ] HTTPS with automatic certificates; redirect HTTP to HTTPS; HSTS once stable.
- [ ] `HOST`/`PORT` set; `FORM_SECRET` set to a long random value; secrets only in host env vars.
- [ ] Deploy only `public/` minus original-photo folders (ship `public/images/optimized/` only).
- [ ] Remove staging Basic auth only at launch; keep admin access controlled.
- [ ] Automated off-site backups (code bundle via `npm run backup`; form data if retained) and a tested restore.
- [ ] Rotate to new registrar/DNS/mail credentials; do not reuse any credentials or files from the old WordPress site.

**Forms**
- [ ] Mail/delivery provider chosen; implement live mode in `lib/deliver.js`; SPF, DKIM, DMARC on the sending domain.
- [ ] Approvals A6 to A9 recorded in `config/forms.json`; then set `FORMS_MODE=live`.
- [ ] Optional: add Cloudflare Turnstile or hCaptcha if spam appears despite honeypot, token and rate limit.
- [ ] End-to-end test of each form with the real recipient; confirm failure handling when mail provider is down.

**Donations**
- [ ] Approvals A2 to A5 recorded; connect the hosted checkout; set `enabled: true`.
- [ ] Test live-mode checkout with the processor's test mode, then a small real gift and refund.
- [ ] Receipt text and tax language reviewed by the organization's advisor.

**SEO and analytics**
- [ ] Set `SITE_URL`; rebuild; replace staging `robots.txt` (allow all + sitemap line); remove `noindex` meta and `X-Robots-Tag`.
- [ ] Submit `sitemap.xml` in Google Search Console; verify the domain property.
- [ ] Add analytics (privacy-conscious; update Privacy Policy and CSP `script-src`/`connect-src` accordingly).
- [ ] Activate approved entries in `config/redirects.json`; re-test with `npm run security`.
- [ ] Add verified telephone, email, address and `sameAs` links to the Organization JSON-LD.
- [ ] Re-run `npm run seo`.

**Quality gates (re-run on the final build)**
- [ ] `npm run seo`, `npm run security`, `npm run a11y`, `npm run perf`, `npm run check`: all pass.
- [ ] Manual screen-reader pass (NVDA + Firefox/Chrome, VoiceOver + Safari iOS) on home, a form with errors, and donate.
- [ ] Manual tests at 200% browser zoom and with OS large-text settings; keyboard-only run-through; voice-control spot check.
- [ ] Real-device mobile testing (iPhone, Android) including older, smaller phones.
- [ ] Field Core Web Vitals review in Search Console after launch.
- [ ] Final content proofread; remove every DRAFT / VERIFY / CONFIRM badge only after sign-off (search the source for these words).
- [ ] Written final authorization from the organization.

## C. Legacy redirect plan
Only `/program-activites/` to `/programs/` is verified and active. Candidate guesses (`/about/`, `/about-us/`, `/contact-us/`, `/donate-2/`, `/get-involved-2/`) are inactive until confirmed against the old site's page list. WordPress admin/system paths return 410. After the real URL list is obtained, map each old URL to its closest new page with a 301 and test.

## D. What automated tests do not cover
No manual assistive-technology testing has been performed yet. Lab performance numbers are not field Core Web Vitals. Automated accessibility tools catch only part of WCAG issues. Security review by a third party is recommended before accepting real data or payments.
