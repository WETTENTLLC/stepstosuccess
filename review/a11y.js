// Accessibility tests: axe-core (WCAG 2.0/2.1/2.2 A+AA tags) on every page at two widths, form error states,
// keyboard focus order + visible focus, target size, accessible names, text-spacing, reflow.
// Spawns its own test-mode server on :3200. Run: npm run a11y
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = 'http://127.0.0.1:3200';
const PAGES = ['/', '/our-story/', '/programs/', '/senior-moments/', '/impact/', '/get-involved/', '/donate/', '/partners/', '/contact/',
  '/contact/message/', '/contact/scholarship-inquiry/', '/contact/volunteer/', '/contact/senior-outreach/', '/contact/corporate/', '/contact/thanks/', '/privacy/', '/accessibility/'];
const FORM_PAGES = PAGES.filter(p => /^\/contact\/[a-z-]+\/$/.test(p) && !/thanks/.test(p));
let fails = 0, passes = 0;
const ok = (c, m) => { c ? passes++ : fails++; if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); };

const runAxe = async (page, label) => {
  await page.evaluate(axeSrc);
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  const bad = res.violations.map(v => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(' ')}`);
  ok(bad.length === 0, `axe ${label}${bad.length ? '\n      ' + bad.join('\n      ') : ''}`);
};

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3200', FORMS_MODE: 'test', FORM_MIN_AGE_MS: '0', FORM_RATE_MAX: '200' } });
  await new Promise(r => setTimeout(r, 1800));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    for (const w of [375, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, bypassCSP: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const p of PAGES) { await page.goto(BASE + p); await runAxe(page, `${p} @${w}`); }
      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();

    // Error states: submit empty forms (test mode) and run axe on the re-rendered page
    for (const p of FORM_PAGES) {
      await page.goto(BASE + p);
      await page.locator('button[data-submit], button[type=submit]').first().click();
      await page.waitForLoadState();
      ok(await page.locator('#error-summary').count() === 1, `error summary shown ${p}`);
      ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'error-summary'), `focus moves to error summary ${p}`);
      const links = await page.locator('#error-summary a').evaluateAll(as => as.map(a => { const t = document.querySelector(a.getAttribute('href')); return !!t; }));
      ok(links.length > 0 && links.every(Boolean), `error summary links target real fields ${p}`);
      const inv = await page.locator('[aria-invalid="true"]').evaluateAll(els => els.every(e => (e.getAttribute('aria-describedby') || '').split(' ').some(id => document.getElementById(id))));
      ok(inv, `invalid fields are described by an error message ${p}`);
      await runAxe(page, `${p} (error state)`);
    }
    await page.goto(BASE + '/donate/');
    await page.locator('button[type=submit]').first().click().catch(() => {});

    // Names, labels, target size, keyboard focus visibility
    for (const p of PAGES) {
      await page.goto(BASE + p);
      const issues = await page.evaluate(() => {
        const out = [];
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
        document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(e => {
          if (e.closest('.hp')) return;
          const name = (e.labels && e.labels.length) || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby');
          if (!name) out.push('unlabelled control ' + (e.name || e.id));
        });
        document.querySelectorAll('a, button, input:not([type=hidden]), select, textarea').forEach(e => {
          if (!vis(e) || e.closest('.hp') || e.classList.contains('skip-link')) return;
          if (e.matches('input[type=radio], input[type=checkbox]')) { const t = e.labels && e.labels[0]; if (t) e = t; }
          const r = e.getBoundingClientRect();
          // WCAG 2.5.8: 24x24 minimum (inline text links are exempt)
          if (e.tagName !== 'A' || getComputedStyle(e).display !== 'inline') if (r.width < 24 || r.height < 24) out.push(`target ${Math.round(r.width)}x${Math.round(r.height)} ${e.tagName} ${e.textContent.trim().slice(0, 25)}`);
        });
        document.querySelectorAll('a').forEach(a => { if (vis(a) && !(a.textContent.trim() || a.getAttribute('aria-label') || a.querySelector('img[alt]'))) out.push('link without name ' + a.href); });
        return out;
      });
      ok(issues.length === 0, `names + 24px targets ${p}${issues.length ? ': ' + issues.slice(0, 4).join('; ') : ''}`);
    }

    // Keyboard walk on a form page: each stop must have a visible focus indicator
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE + '/contact/scholarship-inquiry/');
    let stops = 0, noFocus = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab'); stops++;
      const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); const n = e.closest('.choice') ? e.nextElementSibling : null; const t = n ? getComputedStyle(n) : s; return { tag: e.tagName, id: e.id, vis: (t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) >= 2) || t.boxShadow !== 'none' || (e.matches('input,select,textarea') && s.borderColor !== '') }; });
      if (r && !r.vis) noFocus.push(r.tag + '#' + r.id);
      if (r && r.tag === 'BUTTON' && r.id === '' && i > 15) break;
    }
    ok(noFocus.length === 0, `keyboard walk: visible focus on all ${stops} stops ${noFocus.join(',')}`);
    const order = await page.evaluate(() => { const f = [...document.querySelectorAll('main input:not([type=hidden]):not(.hp input), main select, main textarea, main button')].map(e => e.name || e.type); return f.join(','); });
    ok(order.startsWith('name,email,phone,preferredContact,message,consent'), `DOM/tab order of fields is logical: ${order}`);

    // Mobile menu: Escape closes and restores focus; aria-expanded toggles
    const m = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const mp = await m.newPage(); await mp.goto(BASE + '/');
    const tog = mp.locator('.nav-toggle');
    ok(await tog.getAttribute('aria-expanded') === 'false', 'menu toggle starts aria-expanded=false');
    await tog.click(); ok(await tog.getAttribute('aria-expanded') === 'true', 'menu opens -> aria-expanded=true');
    await mp.keyboard.press('Escape');
    ok(await tog.getAttribute('aria-expanded') === 'false' && await mp.evaluate(() => document.activeElement.classList.contains('nav-toggle')), 'Escape closes menu and returns focus to toggle');
    await m.close();

    // JS disabled: nav still usable
    const nj = await browser.newContext({ viewport: { width: 375, height: 800 }, javaScriptEnabled: false });
    const np = await nj.newPage(); await np.goto(BASE + '/');
    ok(await np.locator('#site-nav a').first().isVisible(), 'no-JS: navigation links visible on mobile');
    await nj.close();

    // Text spacing (WCAG 1.4.12) and 400% zoom reflow (1.4.10) on form pages
    for (const p of FORM_PAGES.concat(['/donate/'])) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(BASE + p);
      await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}' });
      const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('label,button,legend,p')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').length);
      ok(o <= 0 && clipped === 0, `reflow @320 with text-spacing overrides ${p} (overflow ${o}, clipped ${clipped})`);
    }
    await ctx.close();
  } finally { await browser.close(); srv.kill(); }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
