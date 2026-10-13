// Milestone 3 screenshots: forms (disabled + error states), donate page, thank-you, at 375 and 1440.
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const out = path.join(__dirname, 'screenshots', 'm3');
fs.mkdirSync(out, { recursive: true });

const serve = (port, env) => { const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env } }); return p; };
const shot = async (page, file) => {
  await page.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; await i.decode().catch(() => {}); } });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const w = page.viewportSize().width;
  await page.setViewportSize({ width: w, height: Math.min(h, 12000) });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, file), fullPage: true });
};

(async () => {
  const off = serve(3210, { FORMS_MODE: 'disabled' });
  const test = serve(3211, { FORMS_MODE: 'test', FORM_MIN_AGE_MS: '0' });
  await new Promise(r => setTimeout(r, 2000));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const forms = ['message', 'scholarship-inquiry', 'volunteer', 'senior-outreach', 'corporate'];
  for (const w of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3210/contact/'); await shot(page, `contact-hub-${w}.png`);
    await page.goto('http://127.0.0.1:3210/donate/'); await shot(page, `donate-disabled-${w}.png`);
    for (const f of forms) { await page.goto(`http://127.0.0.1:3210/contact/${f}/`); await shot(page, `form-${f}-disabled-${w}.png`); }
    await page.goto('http://127.0.0.1:3211/contact/scholarship-inquiry/');
    await Promise.all([page.waitForNavigation(), page.locator('button[type=submit]').click()]);
    await shot(page, `form-scholarship-errors-${w}.png`);
    await page.goto('http://127.0.0.1:3211/contact/scholarship-inquiry/');
    await page.fill('#scholarship-name', 'Test Person'); await page.fill('#scholarship-email', 'test@example.com');
    await page.selectOption('#scholarship-preferredContact', 'email'); await page.fill('#scholarship-message', 'Test message only.');
    await page.check('#scholarship-consent'); await Promise.all([page.waitForNavigation(), page.locator('button[type=submit]').click()]);
    await shot(page, `form-thanks-test-${w}.png`);
    await page.goto('http://127.0.0.1:3211/donate/'); await page.locator('#gift-monthly').check(); await page.locator('#amt-50').check();
    await Promise.all([page.waitForNavigation(), page.evaluate(() => document.getElementById('form-donate').requestSubmit())]);
    await shot(page, `donate-submit-blocked-${w}.png`);
    await ctx.close();
  }
  await browser.close(); off.kill(); test.kill();
  console.log(fs.readdirSync(out).join('\n'));
})();
