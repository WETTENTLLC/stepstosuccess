// Tests the production build in dist/ exactly as GitHub Pages would serve it (static files only).
// Run: npm run test:dist
const { chromium } = require('playwright-core');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./static-server');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PORT = 4010, BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ['/', '/our-story/', '/programs/', '/impact/', '/get-involved/', '/donate/', '/partners/', '/contact/',
  '/contact/message/', '/contact/scholarship-inquiry/', '/contact/volunteer/', '/contact/corporate/', '/contact/thanks/', '/privacy/', '/accessibility/'];
let fails = 0, passes = 0;
const ok = (c, m) => { c ? passes++ : fails++; if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

(async () => {
  const b = spawnSync(process.execPath, ['build.js'], { cwd: ROOT, env: { ...process.env, BUILD_TARGET: 'production' }, encoding: 'utf8' });
  ok(b.status === 0, 'production build succeeds');
  const srv = createServer(DIST).listen(PORT, '127.0.0.1');
  const sm = await new Promise(res => { let out = ''; const c = spawn(process.execPath, ['review/smoke.js', BASE], { cwd: ROOT }); c.stdout.on('data', d => { out += d; }); c.on('close', code => res({ status: code, stdout: out })); });
  ok(sm.status === 0, 'smoke test passes against dist' + (sm.status ? '\n' + sm.stdout : ''));

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const bad = [];
    page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(`${r.status()} ${r.url()}`); });
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) bad.push('CSP: ' + m.text()); });
    page.on('pageerror', e => bad.push('JS error: ' + e.message));

    const seen = new Set();
    for (const p of PAGES) {
      await page.goto(BASE + p);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(t => axe.run(document, { runOnly: { type: 'tag', values: t } }), TAGS);
      ok(res.violations.length === 0, `axe ${p}${res.violations.length ? ' ' + res.violations.map(v => v.id).join(',') : ''}`);
      ok(await page.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1, `meta CSP present ${p}`);
      const hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
      hrefs.filter(h => h.startsWith('/') && !h.startsWith('//')).forEach(h => seen.add(h.split('#')[0].split('?')[0]));
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 10000 }).catch(() => {});
      const imgs = await page.$$eval('img', is => is.map(i => i.complete && i.naturalWidth > 0));
      ok(imgs.every(Boolean), `all images render ${p}`);
    }
    for (const h of seen) {
      const r = await fetch(BASE + h);
      ok(r.status === 200, `internal link resolves ${h} (${r.status})`);
    }
    ok(bad.length === 0, 'no failed requests, CSP violations or JS errors' + (bad.length ? '\n      ' + [...new Set(bad)].slice(0, 6).join('\n      ') : ''));

    for (const p of PAGES.filter(x => /^\/contact\/[a-z-]+\/$/.test(x) && !/thanks/.test(x))) {
      await page.goto(BASE + p);
      ok(await page.locator('form button[type=submit]').isDisabled(), `submit disabled while forms are unapproved ${p}`);
      ok(await page.locator('.notice-box--off').count() === 1, `"not yet available" notice shown ${p}`);
      ok(await page.locator('form').getAttribute('action') === '#', `form has no live endpoint ${p}`);
    }
    await page.goto(BASE + '/donate/');
    ok(await page.locator('a[href^="http"].btn').count() === 0, 'donate page has no live checkout links while unapproved');

    // Simulate an approved endpoint (client only) to test client-side validation and the error-state accessibility
    await page.goto(BASE + '/contact/scholarship-inquiry/');
    await page.evaluate(() => { const f = document.querySelector('form'); f.setAttribute('data-live', 'true'); const bt = f.querySelector('button'); bt.disabled = false; bt.removeAttribute('aria-disabled'); });
    await page.locator('form button[type=submit]').click();
    ok(await page.locator('#error-summary').count() === 1, 'client validation shows error summary');
    ok(await page.evaluate(() => document.activeElement.id === 'error-summary'), 'focus moves to error summary');
    ok(await page.locator('[aria-invalid="true"]').count() >= 2, 'invalid fields flagged with aria-invalid');
    await page.evaluate(axeSrc);
    const res = await page.evaluate(t => axe.run(document, { runOnly: { type: 'tag', values: t } }), TAGS);
    ok(res.violations.length === 0, 'axe on client error state' + (res.violations.length ? ' ' + res.violations.map(v => v.id + ' ' + v.nodes[0].target.join(' ')).join('; ') : ''));
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
  console.log(`\ndist tests: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
