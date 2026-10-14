// Independent form endpoint for DNNC Steps to Success (Cloudflare Workers).
// Delivery is OFF until DELIVERY_ENABLED is "true" and the org has approved the recipient, privacy language and retention.
// Nothing is stored: a valid submission is validated, checked for spam, and emailed to the recipient only.

const fields = {
  name: { max: 100 },
  email: { max: 254, type: 'email' },
  phone: { max: 25, type: 'tel' },
  message: { max: 1500, min: 10, multiline: true },
  preferredContact: { options: ['email', 'phone', 'either'] },
  interest: {},
  availability: { max: 500, multiline: true },
  organization: { max: 150 },
  role: { max: 100 },
  consent: { type: 'checkbox' },
};

export const SCHEMAS = {
  contact: { required: ['name', 'email', 'message', 'consent'] },
  scholarship: { required: ['name', 'preferredContact', 'message', 'consent'], oneOf: ['email', 'phone'] },
  volunteer: { required: ['name', 'email', 'interest', 'consent'], options: { interest: ['mentoring', 'events', 'skills', 'unsure'] } },
  corporate: { required: ['name', 'organization', 'email', 'interest', 'message', 'consent'], options: { interest: ['sponsorship', 'event', 'inkind', 'workplace', 'team', 'unsure'] } },
};

const MAX_BODY = 8 * 1024;
const HONEYPOT = 'website';

const cleanText = (v, multiline) => {
  let s = String(v ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  return multiline ? s.replace(/\n{3,}/g, '\n\n').trim() : s.replace(/[\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export function validate(formId, input) {
  const schema = SCHEMAS[formId];
  const values = {}, errors = {};
  for (const n of Object.keys(fields)) {
    const required = schema.required.includes(n);
    if (!required && !(n in input)) continue;
    const f = fields[n];
    if (f.type === 'checkbox') {
      values[n] = input[n] === 'yes' ? 'yes' : '';
      if (required && !values[n]) errors[n] = 'required';
      continue;
    }
    const v = cleanText(input[n], f.multiline);
    values[n] = v;
    if (!v) { if (required) errors[n] = 'required'; continue; }
    const opts = (schema.options && schema.options[n]) || f.options;
    if (f.max && v.length > f.max) errors[n] = 'too long';
    else if (f.min && v.length < f.min) errors[n] = 'too short';
    else if (f.type === 'email' && !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(v)) errors[n] = 'invalid email';
    else if (f.type === 'tel' && !/^[0-9+().\-\s]{7,25}$/.test(v)) errors[n] = 'invalid phone';
    else if (opts && !opts.includes(v)) errors[n] = 'invalid choice';
    else if (f.multiline && (v.match(/https?:\/\/|www\./gi) || []).length > 2) errors[n] = 'too many links';
  }
  if (schema.oneOf && schema.oneOf.every(n => !values[n]) && !errors[schema.oneOf[0]]) errors[schema.oneOf[0]] = 'email or phone required';
  return { values, errors };
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': origin || 'null',
    vary: 'origin',
    'x-content-type-options': 'nosniff',
  },
});

async function verifyTurnstile(token, secret, ip, fetchImpl) {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return r.ok && (await r.json()).success === true;
}

const SUBJECTS = { contact: 'General message', scholarship: 'Scholarship inquiry', volunteer: 'Volunteer or mentor interest', corporate: 'Corporate partnership inquiry' };

export async function handle(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const allowed = String(env.ALLOWED_ORIGIN || '');
  const origin = request.headers.get('origin') || '';
  const okOrigin = allowed && origin === allowed ? origin : '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': okOrigin || 'null', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' } });
  }
  const formId = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '');
  if (!SCHEMAS[formId]) return json({ ok: false, error: 'not_found' }, 404, okOrigin);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, okOrigin);
  if (!okOrigin) return json({ ok: false, error: 'forbidden_origin' }, 403, '');
  if (env.DELIVERY_ENABLED !== 'true') return json({ ok: false, error: 'disabled' }, 503, okOrigin);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413, okOrigin);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413, okOrigin);

  const input = Object.fromEntries(new URLSearchParams(text));
  // A filled honeypot gets a normal-looking success so bots learn nothing.
  if (input[HONEYPOT]) return json({ ok: true }, 200, okOrigin);

  const human = await verifyTurnstile(input['cf-turnstile-response'], env.TURNSTILE_SECRET, request.headers.get('cf-connecting-ip'), fetchImpl);
  if (!human) return json({ ok: false, error: 'spam_check_failed' }, 400, okOrigin);

  const { values, errors } = validate(formId, input);
  if (Object.keys(errors).length) return json({ ok: false, error: 'validation', fields: Object.keys(errors) }, 422, okOrigin);

  const lines = Object.entries(values).filter(([k, v]) => v && k !== 'consent').map(([k, v]) => `${k}: ${v}`);
  try {
    await (deps.send || (m => env.MAILER.send(m)))({
      to: env.RECIPIENT,
      from: env.SENDER,
      subject: `[DNNC website] ${SUBJECTS[formId]}`,
      text: `${lines.join('\n')}\n\nConsent to be contacted: yes`,
      replyTo: values.email || undefined,
    });
  } catch {
    return json({ ok: false, error: 'delivery_failed' }, 502, okOrigin);
  }
  return json({ ok: true }, 200, okOrigin);
}

export default { fetch: (request, env) => handle(request, env) };
