// Captures desktop and mobile screenshots of the production-preview build (dist/).
// Output goes to review/screenshots/ (git-ignored: it contains photographs).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, 'screenshots');
const PAGES = ['/', '/our-story/', '/programs/', '/impact/', '/events/', '/press/', '/get-involved/', '/partners/', '/donate/', '/contact/',
  '/contact/message/', '/contact/scholarship-inquiry/', '/contact/volunteer/', '/contact/corporate/', '/privacy/', '/accessibility/'];
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(3300, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const base = 'http://127.0.0.1:3300';
  const slug = p => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-'));
  for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 375, height: 812 }]]) {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        for (const i of document.images) i.loading = 'eager';
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
        window.scrollTo(0, 0);
      });
      const broken = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
      if (broken.length) console.log('BROKEN IMAGES', p, broken);
      await page.screenshot({ path: path.join(OUT, `${label}-${slug(p)}.png`), fullPage: true });
      console.log('shot', label, p);
    }
    for (const p of PAGES.filter(x => /^\/contact\/[a-z-]+\/$/.test(x))) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.locator('form button[type=submit]').click();
      await page.screenshot({ path: path.join(OUT, `${label}-${slug(p)}-errors.png`), fullPage: true });
      console.log('shot', label, p, 'errors');
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
