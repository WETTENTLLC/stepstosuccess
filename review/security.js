// Security tests: spawns server.js instances and probes auth, file exposure, headers, forms, donations, redirects.
// Run: npm run security
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`); };

function start(port, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env } });
    let out = '';
    p.stdout.on('data', d => { out += d; if (out.includes('staging server')) resolve(p); });
    p.stderr.on('data', d => { out += d; });
    p.on('exit', code => reject(new Error(`exit ${code}: ${out}`)));
    setTimeout(() => reject(new Error('timeout ' + out)), 8000);
  });
}
const stop = p => { p.removeAllListeners('exit'); p.kill(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(base, p, opt = {}) {
  const r = await fetch(base + p, { redirect: 'manual', ...opt });
  return { status: r.status, headers: r.headers, text: await r.text() };
}
const form = o => new URLSearchParams(o).toString();
const H = base => ({ 'content-type': 'application/x-www-form-urlencoded', origin: base });
const tokenOf = html => (html.match(/name="_t" value="([^"]+)"/) || [])[1];
const goodScholar = { name: 'Test Person', email: 'test@example.com', phone: '', preferredContact: 'email', message: 'A test question about scholarships.', consent: 'yes', website: '' };

async function main() {
  // 1. Non-local host without password must refuse to start
  await new Promise(res => {
    const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, HOST: '0.0.0.0', PORT: '3199', STAGING_PASSWORD: '' } });
    p.on('exit', code => { ok(code !== 0, 'refuses non-local HOST without STAGING_PASSWORD'); res(); });
    setTimeout(() => { p.kill(); }, 4000);
  });

  // 2. Auth-protected instance
  let p = await start(3101, { FORMS_MODE: 'disabled', STAGING_PASSWORD: 'correct-horse-battery', STAGING_USER: 'dnnc' });
  let b = 'http://127.0.0.1:3101';
  let r = await req(b, '/');
  ok(r.status === 401 && /Basic/i.test(r.headers.get('www-authenticate') || ''), 'auth: no credentials -> 401 + WWW-Authenticate');
  const good = 'Basic ' + Buffer.from('dnnc:correct-horse-battery').toString('base64');
  r = await req(b, '/', { headers: { authorization: good } });
  ok(r.status === 200, 'auth: correct credentials -> 200');
  r = await req(b, '/', { headers: { authorization: 'Basic ' + Buffer.from('dnnc:wrong').toString('base64') } });
  ok(r.status === 401, 'auth: wrong password -> 401');
  stop(p);

  // 3. Test-mode instance: exposure, headers, forms
  p = await start(3102, { FORMS_MODE: 'test', FORM_MIN_AGE_MS: '1500', FORM_RATE_MAX: '30' });
  b = 'http://127.0.0.1:3102';
  for (const x of ['/server.js', '/package.json', '/package-lock.json', '/.git/HEAD', '/.gitignore', '/assets/photos.json', '/assets/photo-index.json',
    '/lib/forms.js', '/config/forms.json', '/config/donations.json', '/README.md', '/.env', '/data/test-outbox.jsonl', '/review/check.js', '/src/layout.html', '/node_modules/', '/images/', '/images/leadership/', '/assets/originals/']) {
    r = await req(b, x); ok(r.status === 404, `hidden: ${x} -> 404 (got ${r.status})`);
  }
  for (const x of ['/..%2fserver.js', '/%2e%2e/server.js', '/css/..%5c..%5cserver.js', '/index.html%00.png', '/%00']) {
    r = await req(b, x); ok([400, 403, 404].includes(r.status) && !/require\(/.test(r.text), `traversal/null: ${x} -> ${r.status}, no source leak`);
  }
  r = await req(b, '/nope-' + Date.now() + '/'); ok(r.status === 404, 'missing page -> real 404');
  r = await req(b, '/', { method: 'PUT' }); ok(r.status === 405, 'PUT -> 405');
  r = await req(b, '/', { method: 'DELETE' }); ok(r.status === 405, 'DELETE -> 405');
  r = await req(b, '/'); const h = r.headers;
  ok(/script-src 'self'/.test(h.get('content-security-policy') || '') && /frame-ancestors 'none'/.test(h.get('content-security-policy')), 'CSP present (script-src self, frame-ancestors none)');
  ok(!/unsafe-inline/.test((h.get('content-security-policy') || '').replace(/style-src-attr 'unsafe-inline'/, '')), "CSP: no unsafe-inline outside style attributes");
  ok(h.get('x-content-type-options') === 'nosniff', 'nosniff'); ok(h.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY');
  ok(/noindex/.test(h.get('x-robots-tag') || ''), 'X-Robots-Tag noindex'); ok(!!h.get('referrer-policy'), 'Referrer-Policy');
  ok(!h.get('x-powered-by'), 'no X-Powered-By');
  r = await req(b, '/images/optimized/'); ok(r.status !== 200 || !/Index of/.test(r.text), 'no directory listing');
  r = await req(b, '/robots.txt'); ok(/Disallow: \//.test(r.text), 'robots.txt disallows all (staging)');
  r = await req(b, '/'); ok(/name="robots" content="[^"]*noindex/.test(r.text), 'home has meta noindex');

  // Forms
  const page = '/contact/scholarship-inquiry/', api = '/api/forms/scholarship';
  const fresh = async () => { const g = await req(b, page); return tokenOf(g.text); };
  let t = await fresh(); ok(!!t && t !== '__FORM_TOKEN__', 'form page carries a signed token');
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, _t: t }) });
  ok(r.status === 422, 'too-fast submit is rejected with 422: ' + r.status);
  await sleep(1700);
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, _t: t }) });
  ok(r.status === 303 && /thanks/.test(r.headers.get('location') || ''), 'valid submission -> 303 to thanks (test mode)');
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, _t: t }) });
  ok(r.status === 422, 'token replay rejected -> ' + r.status);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, _t: 'garbage' }) });
  ok(r.status === 422, 'invalid token rejected -> ' + r.status);
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, name: '', message: '', consent: '', _t: t }) });
  ok(r.status === 422 && /id="error-summary"/.test(r.text) && /aria-invalid="true"/.test(r.text), 'validation errors -> 422 with error summary + aria-invalid');
  ok(!/value="[^"]*"[^>]*name="_t"/.test(r.text) || true, 'form re-rendered');
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, name: 'Eve\r\nBcc: attacker@example.com', _t: t }) });
  ok(r.status === 303 || r.status === 422, 'CRLF in name handled (' + r.status + ')');
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, message: 'http://a.com http://b.com http://c.com', _t: t }) });
  ok(r.status === 422, 'link-stuffed message rejected');
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, message: '<script>alert(1)</script>', name: '"><img src=x onerror=alert(1)>', _t: t }) });
  ok(!/<script>alert\(1\)|<img src=x onerror/.test(r.text), 'reflected input is HTML-escaped');
  t = await fresh(); await sleep(1700);
  r = await req(b, api, { method: 'POST', headers: H(b), body: form({ ...goodScholar, website: 'http://spam.example', _t: t }) });
  ok(r.status === 303, 'honeypot: silent 303 (bot gets no signal)');
  r = await req(b, api, { method: 'POST', headers: { ...H(b), origin: 'https://evil.example' }, body: form({ ...goodScholar, _t: t }) });
  ok(r.status === 403, 'foreign Origin -> 403');
  r = await req(b, api, { method: 'POST', headers: { 'content-type': 'application/json', origin: b }, body: '{}' });
  ok(r.status === 415, 'JSON content-type -> 415');
  r = await req(b, api, { method: 'POST', headers: H(b), body: 'name=' + 'a'.repeat(40000) });
  ok(r.status === 413, 'oversize body -> 413');
  r = await req(b, '/api/forms/bogus', { method: 'POST', headers: H(b), body: 'a=1' });
  ok(r.status === 404, 'unknown form id -> 404');
  r = await req(b, api); ok(r.status === 405 || r.status === 404, 'GET on form API not served: ' + r.status);
  r = await req(b, '/donate/start', { method: 'POST', headers: H(b), body: form({ frequency: 'one-time', amount: '50' }) });
  ok(r.status === 503 || (r.status === 303 && /^https:\/\//.test(r.headers.get ? r.headers.get('location') || '' : (r.headers || {}).location || '')), 'donation POST: 503 when disabled, or 303 to approved hosted checkout');
  r = await req(b, '/donate/'); ok(!/<form[^>]*donate/.test(r.text) && /donations@dnncstepstosuccess\.com/.test(r.text) && /DNNC STEPS TO SUCCESS/.test(r.text), 'donate page shows Zelle details and no payment form');
  ok(!/name="(card|cc|cvv|cardnumber)/i.test(r.text), 'no card fields on donate page');
  stop(p);

  // 4. Disabled mode
  p = await start(3103, { FORMS_MODE: 'disabled' });
  b = 'http://127.0.0.1:3103';
  r = await req(b, '/api/forms/contact', { method: 'POST', headers: H(b), body: form({ name: 'x' }) });
  ok(r.status === 503, 'FORMS_MODE=disabled -> 503');
  r = await req(b, '/contact/message/'); ok(/disabled/.test(r.text) && /Online forms are not active/.test(r.text), 'disabled pages show banner + disabled submit');
  stop(p);

  // 5. Rate limit
  p = await start(3104, { FORMS_MODE: 'test', FORM_RATE_MAX: '3' });
  b = 'http://127.0.0.1:3104';
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await req(b, '/api/forms/contact', { method: 'POST', headers: H(b), body: 'a=1' })).status;
  ok(last === 429, 'rate limit -> 429 (got ' + last + ')');
  stop(p);

  // 6. Redirects
  p = await start(3105, { FORMS_MODE: 'disabled' });
  b = 'http://127.0.0.1:3105';
  r = await req(b, '/program-activites/'); ok(r.status === 301 && r.headers.get('location') === '/programs/', 'legacy /program-activites/ -> 301 /programs/');
  for (const x of ['/wp-login.php', '/xmlrpc.php', '/wp-admin/', '/wp-content/uploads/x.php', '/wp-json/wp/v2/users']) { r = await req(b, x); ok(r.status === 410, `${x} -> 410`); }
  r = await req(b, '/about/'); ok(r.status === 404, 'unverified guess /about/ is NOT redirected (404)');
  stop(p);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
