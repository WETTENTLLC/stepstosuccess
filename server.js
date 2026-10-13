// Staging server: static pages plus secure form and donation-handoff endpoints. No third-party dependencies.
// Staging rules: binds to localhost unless HTTP basic auth is configured; every response is noindex.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { FORMS, validate, renderForm, makeToken, checkToken } = require('./lib/forms');
const { deliver } = require('./lib/deliver');
const donate = require('./lib/donate');
const formsConfig = require('./config/forms.json');
const redirects = require('./config/redirects.json').redirects.filter(r => r.active);

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const FORMS_MODE = ['disabled', 'test', 'live'].includes(process.env.FORMS_MODE) ? process.env.FORMS_MODE : 'disabled';
const AUTH_USER = process.env.STAGING_USER || 'dnnc';
const AUTH_PASS = process.env.STAGING_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 16 * 1024;
const FORM_RATE_MAX = Number(process.env.FORM_RATE_MAX || 5);
const FORM_RATE_WINDOW = 15 * 60 * 1000;

if (!['127.0.0.1', '::1', 'localhost'].includes(HOST) && !AUTH_PASS) {
  console.error('Refusing to listen on a non-local address without STAGING_PASSWORD set.');
  process.exit(1);
}
if (AUTH_PASS && AUTH_PASS.length < 12) {
  console.error('STAGING_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.xml', '.txt']);

const checkoutOrigin = () => { try { return donate.donationsReady() ? new URL(donate.config.checkoutUrls.oneTime).origin : ''; } catch { return ''; } };
function securityHeaders() {
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self'", "style-src-attr 'unsafe-inline'", "img-src 'self' data:",
    "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", `form-action 'self' ${checkoutOrigin()}`.trim(), "frame-ancestors 'none'"].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const clientIp = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

const hits = new Map();
function limited(bucket, key, max, windowMs) {
  const now = Date.now(), k = `${bucket}:${key}`;
  const list = (hits.get(k) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(k, list);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(kk);
  return list.length > max;
}
const usedTokens = new Map();

function authorized(req) {
  if (!AUTH_PASS) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return Boolean(safeEq(decoded.slice(0, i), AUTH_USER) & safeEq(decoded.slice(i + 1), AUTH_PASS));
}

function send(req, res, status, headers, body, ext = '.html') {
  const h = { ...securityHeaders(), ...headers };
  if (!h['Content-Type']) h['Content-Type'] = TYPES[ext] || 'application/octet-stream';
  let out = body;
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && Buffer.byteLength(out) > 1024) {
    out = zlib.gzipSync(out);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = Buffer.byteLength(out);
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : out);
}
const sendText = (req, res, status, text, extra = {}) => send(req, res, status, { 'Cache-Control': 'no-store', ...extra }, `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>${text}</title><p style="font:20px system-ui;padding:2rem">${text}</p>`);
const redirect = (res, status, location) => { res.writeHead(status, { ...securityHeaders(), Location: location, 'Cache-Control': 'no-store' }); res.end(); };

function banner(kind) {
  if (kind === 'donate') {
    return donate.donationsReady() ? '' : '<div class="notice-box" id="form-status" role="status"><p class="h3">Online giving is not active yet</p><p>We are verifying our legal details, tax status and payment provider. No payment can be made on this website yet.</p></div>';
  }
  if (FORMS_MODE === 'test') return '<div class="notice-box notice-box--test" id="form-status" role="status"><p class="h3">Test mode</p><p>Messages are checked but not sent to the organization.</p></div>';
  if (FORMS_MODE === 'disabled') return '<div class="notice-box" id="form-status" role="status"><p class="h3">Online forms are not active yet</p><p>We are confirming where messages are sent and how they are handled. Please do not enter private information, and check back soon.</p></div>';
  return '';
}
const submitDisabled = kind => (kind === 'donate' ? !donate.donationsReady() : FORMS_MODE === 'disabled');

function processHtml(html) {
  const m = html.match(/<form class="form[^"]*" id="form-([a-z]+)"/);
  const kind = m ? m[1] : 'page';
  let out = html.replace(/__FORM_TOKEN__/g, () => (FORMS[kind] ? makeToken(kind) : ''));
  out = out.replace(/<!--FORM_STATUS-->/g, () => banner(kind));
  return out.replace(/ data-submit>/g, submitDisabled(kind) ? ' disabled aria-disabled="true">' : '>');
}

const readPage = rel => fs.readFileSync(path.join(ROOT, rel, 'index.html'), 'utf8');
const renderPageWithForm = (pagePath, formHtml) => processHtml(readPage(pagePath).replace(/<!--form:start-->[\s\S]*<!--form:end-->/, () => formHtml));

function originOk(req) {
  const src = req.headers.origin || req.headers.referer;
  if (!src) return false;
  try { return new URL(src).host === req.headers.host; } catch { return false; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    let tooBig = false;
    req.on('data', c => { size += c.length; if (tooBig) return; if (size > MAX_BODY) { tooBig = true; chunks.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseForm(body) {
  const out = {}; let n = 0;
  for (const [k, v] of new URLSearchParams(body)) { if (++n > 40) break; if (!(k in out)) out[k] = v; }
  return out;
}

async function handlePost(req, res, urlPath) {
  const formMatch = urlPath.match(/^\/api\/forms\/([a-z]+)$/);
  const isDonate = urlPath === '/donate/start';
  if (!isDonate && !(formMatch && FORMS[formMatch[1]])) return sendText(req, res, 404, 'Not found');
  if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers['content-type'] || '')) return sendText(req, res, 415, 'Unsupported content type');
  if (!originOk(req)) return sendText(req, res, 403, 'Request blocked');
  const formId = isDonate ? 'donate' : formMatch[1];
  const pagePath = isDonate ? '/donate/' : FORMS[formId].page;
  const page = (formHtml, status, extra = {}) => send(req, res, status, { 'Cache-Control': 'no-store', ...extra }, renderPageWithForm(pagePath, formHtml));
  const fresh = (state = {}) => (isDonate ? donate.renderDonateForm(state) : renderForm(formId, { ...state, token: makeToken(formId) }));

  if (limited('post', clientIp(req), FORM_RATE_MAX, FORM_RATE_WINDOW)) {
    return page(fresh({ errors: { _form: 'Too many attempts. Please wait a few minutes and try again.' } }), 429, { 'Retry-After': '900' });
  }
  let input;
  try { input = parseForm(await readBody(req)); } catch (e) { if (e.status === 413) res.setHeader('Connection', 'close'); return sendText(req, res, e.status || 400, e.status === 413 ? 'Request too large' : 'Bad request'); }

  if (isDonate) {
    if (!donate.donationsReady()) return page(fresh(), 503, { 'Retry-After': '86400' });
    const { values, errors, amount } = donate.validateDonation(input);
    if (Object.keys(errors).length) return page(fresh({ values, errors }), 422);
    const url = donate.checkoutUrl(values.frequency, amount);
    if (!url) return page(fresh({ values, errors: { _form: 'Checkout is unavailable right now. Please try again later.' } }), 503);
    return redirect(res, 303, url);
  }

  if (FORMS_MODE === 'disabled') return page(fresh(), 503, { 'Retry-After': '86400' });
  if (input.website) return redirect(res, 303, '/contact/thanks/'); // honeypot: pretend success, keep nothing
  const token = String(input._t || '');
  const t = checkToken(token, formId);
  if (t !== 'ok' || usedTokens.has(token)) {
    const msg = t === 'fast' ? 'That was sent very quickly. Please review your answers and send again.' : 'Your form session expired or was already used. Please review your answers and send again.';
    return page(fresh({ values: validate(formId, input).values, errors: { _form: msg } }), 422);
  }
  const { values, errors } = validate(formId, input);
  if (Object.keys(errors).length) return page(fresh({ values, errors }), 422);
  try { await deliver(FORMS_MODE, formId, values, formsConfig); } catch (e) {
    console.error(`[form:${formId}] delivery failed: ${e.message}`);
    return page(fresh({ values, errors: { _form: 'We could not send your message right now. Please try again later.' } }), 503, { 'Retry-After': '3600' });
  }
  usedTokens.set(token, Date.now());
  for (const [k, ts] of usedTokens) if (Date.now() - ts > 4.5 * 3600 * 1000) usedTokens.delete(k);
  console.log(`[form:${formId}] accepted (${FORMS_MODE})`);
  redirect(res, 303, `/contact/thanks/${FORMS_MODE === 'test' ? '?m=test' : ''}`);
}

function handle(req, res) {
  if (!authorized(req)) {
    if (req.headers.authorization && limited('auth', clientIp(req), 10, FORM_RATE_WINDOW)) return sendText(req, res, 429, 'Too many attempts');
    return sendText(req, res, 401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="DNNC staging", charset="UTF-8"' });
  }
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return sendText(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD, POST' });

  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { return sendText(req, res, 400, 'Bad request'); }
  if (urlPath.includes('\0') || urlPath.includes('\\')) return sendText(req, res, 400, 'Bad request');

  for (const r of redirects) {
    if (r.prefix ? urlPath.startsWith(r.from) : urlPath === r.from) {
      return r.status === 410 ? sendText(req, res, 410, 'Gone') : redirect(res, r.status, r.to);
    }
  }
  if (req.method === 'POST') return handlePost(req, res, urlPath).catch(e => { console.error('[post] error', e.message); if (!res.headersSent) sendText(req, res, 500, 'Something went wrong'); });

  let file = path.normalize(path.join(ROOT, urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return sendText(req, res, 403, 'Forbidden');
  const rel = urlPath.replace(/\/+$/, '');
  const hidden = urlPath.split('/').some(s => s.startsWith('.'));
  // Only optimized WebP is served from /images/; unprocessed originals are never public.
  const blockedImage = rel.startsWith('/images/') && !rel.startsWith('/images/optimized/');
  const notFound = () => fs.readFile(path.join(ROOT, '404.html'), (e, pg) => send(req, res, 404, { 'Cache-Control': 'no-store' }, e ? 'Page not found' : pg));
  if (hidden || blockedImage) return notFound();
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!urlPath.endsWith('/')) return redirect(res, 301, urlPath + '/');
      file = path.join(file, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    if (!TYPES[ext]) return notFound();
    fs.readFile(file, (e, data) => {
      if (e) return notFound();
      if (ext === '.html') return send(req, res, 200, { 'Cache-Control': 'no-cache' }, processHtml(data.toString('utf8')));
      send(req, res, 200, { 'Cache-Control': ext === '.webp' ? 'public, max-age=86400' : 'no-cache' }, data, ext);
    });
  });
}

const server = http.createServer((req, res) => {
  try { handle(req, res); } catch (e) { console.error('[server] error', e.message); if (!res.headersSent) sendText(req, res, 500, 'Something went wrong'); }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(PORT, HOST, () => console.log(`DNNC staging server: http://${HOST === '::1' ? '[::1]' : HOST}:${PORT} (forms: ${FORMS_MODE}, auth: ${AUTH_PASS ? 'on' : 'off'})`));
