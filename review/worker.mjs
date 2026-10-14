// Run with: node review/worker.js
import { handle, SCHEMAS, validate } from '../workers/forms/src/index.mjs';
import { createRequire } from 'module';
const { FORMS } = createRequire(import.meta.url)('../lib/forms.js');

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

const ORIGIN = 'https://dnncstepstosuccess.com';
const env = { ALLOWED_ORIGIN: ORIGIN, DELIVERY_ENABLED: 'true', TURNSTILE_SECRET: 's', RECIPIENT: 'r@example.com', SENDER: 's@example.com' };
const good = { name: 'Ann Lee', email: 'ann@example.com', message: 'Hello, I have a question.', consent: 'yes', 'cf-turnstile-response': 'tok' };
const req = (path, body, { origin = ORIGIN, method = 'POST' } = {}) => new Request(`https://w.example/${path}`, { method, headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? new URLSearchParams(body).toString() : undefined });
const mk = ok => ({ fetch: async () => ({ ok: true, json: async () => ({ success: ok }) }) });

for (const id of Object.keys(FORMS)) {
  t(`schema exists for ${id}`, !!SCHEMAS[id]);
  const required = FORMS[id].fields.filter(f => f.required).map(f => f.name);
  t(`${id}: required fields match site form`, required.every(n => SCHEMAS[id].required.includes(n)));
}
t('worker has no extra forms', Object.keys(SCHEMAS).length === Object.keys(FORMS).length);

let sent = [];
const deps = ok => ({ ...mk(ok), send: async m => { sent.push(m); } });

t('disabled by default -> 503', (await handle(req('contact', good), { ...env, DELIVERY_ENABLED: 'false' }, deps(true))).status === 503);
t('bad origin -> 403', (await handle(req('contact', good, { origin: 'https://evil.example' }), env, deps(true))).status === 403);
t('unknown form -> 404', (await handle(req('senior', good), env, deps(true))).status === 404);
t('GET -> 405', (await handle(req('contact', {}, { method: 'GET' }), env, deps(true))).status === 405);
t('oversize -> 413', (await handle(req('contact', { ...good, message: 'x'.repeat(9000) }), env, deps(true))).status === 413);
t('honeypot -> fake success, nothing sent', await (async () => { sent = []; const r = await handle(req('contact', { ...good, website: 'x' }), env, deps(true)); return r.status === 200 && !sent.length; })());
t('turnstile fail -> 400', (await handle(req('contact', good), env, deps(false))).status === 400);
t('validation -> 422', (await handle(req('contact', { ...good, email: 'nope' }), env, deps(true))).status === 422);
t('missing consent -> 422', (await handle(req('contact', { ...good, consent: '' }), env, deps(true))).status === 422);
t('scholarship needs email or phone', validate('scholarship', { name: 'A', preferredContact: 'email', message: 'long enough message', consent: 'yes' }).errors.email !== undefined);
t('valid -> 200 and sent', await (async () => { sent = []; const r = await handle(req('contact', good), env, deps(true)); return r.status === 200 && sent.length === 1 && sent[0].to === 'r@example.com'; })());
t('delivery failure -> 502', (await handle(req('contact', good), env, { ...mk(true), send: async () => { throw new Error('x'); } })).status === 502);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
