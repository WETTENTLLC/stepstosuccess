// Site checks. Start the server (npm start) in another shell, then: npm run check
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { cr } = require('./contrast');
const BASE = process.env.BASE || 'http://localhost:3000';
const WIDTHS = [320, 375, 768, 1024, 1100, 1440];
const PAGES = ['/', '/our-story/', '/programs/', '/senior-moments/', '/impact/', '/get-involved/', '/donate/', '/partners/', '/contact/', '/contact/message/', '/contact/scholarship-inquiry/', '/contact/volunteer/', '/contact/senior-outreach/', '/contact/corporate/', '/contact/thanks/', '/privacy/', '/accessibility/'];

const settle = async page => {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; });
    for (const i of document.images) { i.scrollIntoView(); await i.decode().catch(() => {}); await new Promise(r => setTimeout(r, 150)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
};
// Tall full-page captures can drop decoded images, so size the viewport to the whole page first.
const fullShot = async (page, file) => {
  await settle(page);
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: document.documentElement.scrollHeight }));
  await page.setViewportSize({ width: w, height: Math.min(h, 16000) });
  await page.waitForTimeout(900);
  await page.screenshot({ path: file, fullPage: true });
};
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const out = path.join(__dirname, 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  let fails = 0;
  const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

  for (const p of PAGES) ok((await fetch(BASE + p)).status === 200, `200 ${p}`);
  for (const [p, want] of [['/nope.html', 404], ['/missing/', 404], ['/..%2f..%2fserver.js', 403]]) {
    ok((await fetch(BASE + p)).status === want, `${want} ${p}`);
  }

  const pairs = [
    ['006B8A', 'FFFFFF', 4.5], ['006B8A', 'F7F4ED', 4.5], ['006B8A', 'E3F3F9', 4.5],
    ['6CCBEF', '17334A', 4.5], ['FFFFFF', '006B8A', 4.5], ['17120A', 'B38A50', 4.5],
    ['7A5A2B', 'F7F4ED', 4.5], ['7A5A2B', 'FFFFFF', 4.5], ['FFFFFF', '17334A', 4.5],
    ['0196D5', 'FFFFFF', 3],
  ];
  for (const [a, b, min] of pairs) { const r = cr(a, b); ok(r >= min, `contrast #${a} on #${b} = ${r} (min ${min})`); }

  const seen = new Set();
  for (const p of PAGES) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      const csp = []; page.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
      await page.goto(BASE + p);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, `no overflow ${p} @${w}px (${over})`);
      const name = p === '/' ? 'home' : p.replace(/\//g, '');
      if (p === '/' || [320, 1440].includes(w)) await fullShot(page, `${out}/${name}-${w}.png`);
      ok(csp.length === 0, `no CSP violations ${p} @${w}px`);
      if (w === 1440) {
        ok(await page.locator('h1').count() === 1, `one h1 on ${p}`);
        ok((await page.title()).length > 10 && !!(await page.locator('meta[name=description]').getAttribute('content')), `title+description ${p}`);
        ok((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex'), `noindex ${p}`);
        ok(await page.locator('img:not([alt])').count() === 0, `all images have alt ${p}`);
        for (const href of await page.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href').split('#')[0].split('?')[0]))) {
          if (href && !seen.has(href)) { seen.add(href); ok((await fetch(BASE + href)).status === 200, `link ${href} resolves`); }
        }
      }
      await ctx.close();
    }
  }

  for (const [w, h] of [[320, 568], [375, 667]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/');
    const box = await page.locator('.hero .btn--primary').first().boundingBox();
    ok(box.y + box.height <= h, `primary CTA visible without scrolling @${w}x${h} (bottom ${Math.round(box.y + box.height)})`);
    await settle(page);
    await page.screenshot({ path: `${out}/home-${w}-viewport.png` });
    await ctx.close();
  }

  let ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  let page = await ctx.newPage();
  await page.goto(BASE + '/');
  const toggle = page.locator('.nav-toggle');
  ok(await toggle.getAttribute('aria-expanded') === 'false', 'toggle starts aria-expanded=false');
  ok(!(await page.locator('#site-nav').isVisible()), 'menu collapsed by default with JS');
  await toggle.focus(); await page.keyboard.press('Enter');
  ok(await toggle.getAttribute('aria-expanded') === 'true', 'Enter opens menu, aria-expanded=true');
  ok(await page.evaluate(() => document.activeElement.closest('#site-nav') !== null), 'focus moves into menu');
  await page.screenshot({ path: `${out}/home-375-menu-open.png` });
  await page.keyboard.press('Escape');
  ok(await toggle.getAttribute('aria-expanded') === 'false', 'Escape closes menu');
  ok(await page.evaluate(() => document.activeElement.classList.contains('nav-toggle')), 'Escape returns focus to toggle');
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, javaScriptEnabled: false });
  page = await ctx.newPage();
  await page.goto(BASE + '/');
  ok(await page.locator('#site-nav').isVisible(), 'menu visible with JavaScript disabled');
  ok(!(await page.locator('.nav-toggle').isVisible()), 'toggle hidden with JavaScript disabled');
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE + '/');
  ok(await page.locator('#site-nav').isVisible() && !(await page.locator('.nav-toggle').isVisible()), 'desktop nav visible, toggle hidden');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), 'first Tab stop is skip link');
  ok(await page.evaluate(() => { const b = document.querySelector('.btn--primary'); b.focus(); return getComputedStyle(b).outlineStyle !== 'none'; }), 'focus outline present on buttons');
  ok(await page.evaluate(() => { const i = document.querySelector('.brand img, header img'); return i.complete && i.naturalWidth === 720; }), 'logo loads at full resolution');
  await page.screenshot({ path: `${out}/home-1440-viewport.png` });
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 640, height: 900 }, bypassCSP: true });
  page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(BASE + p);
    await page.addStyleTag({ content: 'html{font-size:200%!important}' });
    const o2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(o2 <= 0, `no overflow with 200% text ${p} (${o2})`);
  }
  await ctx.close();

  ctx = await browser.newContext({ reducedMotion: 'reduce' });
  page = await ctx.newPage();
  await page.goto(BASE + '/');
  const tr = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration);
  ok(/^0s/.test(tr), `reduced motion disables transitions (${tr})`);
  await ctx.close();

  await browser.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
})();
