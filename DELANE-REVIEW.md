# Delane Review Edition: DNNC Steps to Success

This is a **review draft**, not a launch. Nothing is live, no payments are on, and no form messages are delivered.

## How to open the preview

The review site is a private local preview (the public repository is not used for review, because photo releases are still being confirmed).

1. Remote review: use the private, email-protected link (setup in `docs/REVIEW-HOSTING.md`). Local review (includes the private Zelle QR): `npm run build:local-qr` then `npm run preview`.
1. Local, without the QR: `npm run build:prod` then `npm run preview`
2. Open **http://127.0.0.1:4000/**

Screenshots of every page (desktop 1440 px and mobile 375 px, plus each form showing its error messages) are in `review/screenshots/` (private, not in the repository). Re-create them with `npm run screenshots`.

## Page by page

| Page | What it covers |
|---|---|
| Home | Mission, four ways to begin (scholarships, give, stories, partner), founder, programs, impact, community, giving |
| Our Story | Delane Sims' story, mission, timeline (2000, 2005, 2016, 2017 on), leadership |
| Programs | Vocational training, mentorship, the four-step path, how to ask about applying |
| Impact | Featured vehicle giveaway (no date shown), community moments, share-your-story invitation |
| Events & Community History | Galas 2017 to 2023, vehicle giveaways, community gallery |
| Press & Recognition | Coverage and recognition drawn from the archived site, with the one verified NAILS Magazine link |
| Get Involved | Mentor, salon ambassador, Mom of the Year nomination, volunteer |
| Partnerships | Ways to partner, no invented sponsorship levels |
| Donate | Zelle giving: recipient name, donations@ email with copy button, how-to steps, QR code (preview only) |
| Contact | Address, email, how to apply, links to the four forms |
| Privacy / Accessibility | Plain-language statements |

## Forms and donations

- **Forms:** four forms are built: General message, Scholarship inquiry, Volunteer or mentor, and Corporate partnership. (There was a fifth, Senior Moments; it was removed on the owner's instruction that this site covers only Steps to Success.) You can try each form, see clear labels and error messages, and the preview confirms "nothing was sent." Real delivery is off. The independent Cloudflare Workers backend is built and tested (`workers/forms/`) but not deployed.
- **Donations:** Zelle is the primary method (recipient DNNC STEPS TO SUCCESS, INC; donations@dnncstepstosuccess.com), shown in review mode only. The QR is published only after Delane approves it and it is scan-tested. No processor is connected; Givebutter and Software4Nonprofits are on hold as possible future options. Acknowledgment process: `docs/DONATION-ACKNOWLEDGMENTS.md`.

### Donation acknowledgment procedure (Zelle) - for Delane's approval
Zelle does not provide the organization's own acknowledgment, so the organization issues it:
1. Record each gift from the bank's Zelle notice (date, amount, donor name as shown). Keep the log private, never in the website repo.
2. When a donor emails delane@delanesnails.com with name, date and amount, match it to the log.
3. Send a thank-you acknowledgment (suggested within 14 days) and keep a numbered copy.
4. Reconcile the log with bank statements monthly.
5. No tax wording until IRS records confirm the legal name, EIN 84-4849258 and current eligibility, and Delane approves the letter.

Delane decides: who records and sends, the response time, the letter wording and signer, and where the log is stored. Full draft: `docs/DONATION-ACKNOWLEDGMENTS.md`. The Zelle QR stays hidden from any public build until Delane approves it and it is scan-tested with a banking app.

## Needs Delane's approval

1. Wording and photographs on every page.
2. Contact details shown: 333 Estudillo Ave, Suite 204, San Leandro, CA 94577; delane@delanesnails.com; EIN 84-4849258.
3. Whether to show the 501(c)(3) wording publicly. It stays hidden until the IRS records are checked.
4. The recipient address for form messages, privacy wording, and how long messages are kept.
5. Facts held back until confirmed (full list in `docs/internal/VERIFICATION-ITEMS.md`): fundraising totals, honoree names, vehicle giveaway dates, testimonials, program costs and job-placement claims, scholarship names, awards, phone number and hours, fiscal sponsor history, the exact titles for Myeshia Jefferson.

## Photographs

All 14 published photographs are stated as approved by the owner. No signed releases have been seen. Please confirm you are comfortable with each photograph, especially those showing children and the vehicle giveaway recipients.

## Your revisions

Write changes here (page, what to change):

-
-
-

## Final approval

- [ ] I have reviewed every page.
- [ ] Content and photographs are approved for public use.
- [ ] Contact details are correct.

Name: ____________________  Date: ____________

## Launch-only tasks (not done, need separate authorization)

- Verify domain ownership and set DNS for GitHub Pages; keep existing email DNS records.
- Verify EIN and tax-exempt status with the IRS before any tax wording.
- Approve publishing the Zelle QR (`zelle.qrPublishApproved`), scan-test it with a banking app, and set up the separate donation acknowledgment process. Givebutter and Software4Nonprofits remain on hold.
- Approve the form service, recipient, privacy and retention; deploy the Worker; live-test.
- Edge-level permanent redirects for old URLs (GitHub Pages only supports page-level stubs).
- Confirm the Senior Moments destination before any link.
- Written launch authorization, then publish and run the post-launch smoke test.
