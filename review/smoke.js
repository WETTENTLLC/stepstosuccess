// Post-deployment smoke test. Usage: node review/smoke.js <baseUrl> [--expect-live]
// Verifies key pages, real 404 status, redirect stubs, and that nothing private is reachable.
const base = (process.argv[2] || '').replace(/\/$/, '');
const live = process.argv.includes('--expect-live');
if (!/^https?:\/\//.test(base)) { console.log('Usage: node review/smoke.js <baseUrl> [--expect-live]'); process.exit(2); }
let fails = 0, passes = 0;
const ok = (c, m) => { c ? passes++ : fails++; if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); };
const get = async p => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const PAGES = ['/', '/our-story/', '/programs/', '/senior-moments/', '/impact/', '/get-involved/', '/donate/', '/partners/', '/contact/',
  '/contact/message/', '/contact/scholarship-inquiry/', '/contact/volunteer/', '/contact/senior-outreach/', '/contact/corporate/', '/contact/thanks/', '/privacy/', '/accessibility/'];
const PRIVATE = ['/server.js', '/package.json', '/config/forms.json', '/config/donations.json', '/assets/photos.json', '/assets/originals/', '/.env',
  '/data/', '/review/smoke.js', '/lib/forms.js', '/images/homepage/', '/images/leadership/', '/images/programs/', '/images/senior-moments/', '/images/success-stories/', '/images/galas-awards/', '/images/branding/', '/images/partnersoroutreach/', '/wp-login.php', '/wp-admin/', '/xmlrpc.php'];

(async () => {
  for (const p of PAGES) {
    const r = await get(p);
    ok(r.status === 200, `200 ${p} (got ${r.status})`);
    const canon = (r.text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    ok(canon && canon.endsWith(p) && !/example\.org|localhost|127\.0\.0\.1/.test(canon), `canonical ${p} -> ${canon}`);
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(r.text);
    ok(live ? !noindex : noindex, `${live ? 'indexable' : 'noindex'} ${p}`);
    ok(!/__FORM_TOKEN__|FORM_STATUS|data-submit|STAGING/.test(r.text), `no dev placeholders ${p}`);
  }
  const nf = await get('/this-page-does-not-exist/');
  ok(nf.status === 404, `missing page returns 404 (got ${nf.status})`);
  for (const p of PRIVATE) { const r = await get(p); ok(r.status === 404, `not reachable ${p} (got ${r.status})`); }
  const rb = await get('/robots.txt');
  ok(rb.status === 200 && (live ? /Allow: \//.test(rb.text) && /Sitemap:/.test(rb.text) : /Disallow: \//.test(rb.text)), 'robots.txt matches launch state');
  const sm = await get('/sitemap.xml');
  ok(live ? sm.status === 200 && !/example\.org/.test(sm.text) : sm.status === 404, 'sitemap.xml matches launch state');
  const rd = await get('/program-activites/');
  ok(rd.status === 200 && /http-equiv="refresh"[^>]*\/programs\//.test(rd.text) && /rel="canonical" href="[^"]*\/programs\/"/.test(rd.text), 'legacy /program-activites/ stub points to /programs/');
  console.log(`\nsmoke ${base}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
