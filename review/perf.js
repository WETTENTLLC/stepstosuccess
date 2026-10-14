// Lab Core Web Vitals (LCP, CLS, TBT proxy via long tasks) + transfer weight, on throttled mobile emulation.
// Lab data only; real-user CWV requires field data (Search Console / CrUX) after launch. Run: npm run perf
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:3201';
const PAGES = ['/', '/our-story/', '/programs/', '/impact/', '/events/', '/press/', '/get-involved/', '/donate/', '/partners/', '/contact/', '/contact/scholarship-inquiry/'];
// Google "good" thresholds
const LIM = { lcp: 2500, cls: 0.1, tbt: 200, kb: 1500 };
let fails = 0;

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3201', FORMS_MODE: 'disabled' } });
  await new Promise(r => setTimeout(r, 1800));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  console.log('page'.padEnd(34), 'LCP ms'.padStart(8), 'CLS'.padStart(7), 'longTask ms'.padStart(12), 'KB'.padStart(7), ' status');
  try {
    for (const p of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      // ~ "Fast 4G" + 4x CPU slowdown, similar to Lighthouse mobile
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      let bytes = 0; cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
      await page.addInitScript(() => {
        window.__m = { lcp: 0, cls: 0, lt: 0 };
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(BASE + p, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // triggers lazy images
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => window.__m);
      const kb = Math.round(bytes / 1024);
      const good = m.lcp <= LIM.lcp && m.cls <= LIM.cls && m.lt <= LIM.tbt && kb <= LIM.kb;
      if (!good) fails++;
      console.log(p.padEnd(34), String(Math.round(m.lcp)).padStart(8), m.cls.toFixed(3).padStart(7), String(Math.round(m.lt)).padStart(12), String(kb).padStart(7), good ? ' good' : ' REVIEW');
      await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }
  console.log(`\nThresholds: LCP<=${LIM.lcp}ms, CLS<=${LIM.cls}, blocking time<=${LIM.tbt}ms, page weight (incl. scrolled lazy images)<=${LIM.kb}KB`);
  process.exit(fails ? 1 : 0);
})();
