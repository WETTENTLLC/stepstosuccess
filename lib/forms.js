// Single source of truth for inquiry forms: the build renders the markup from these
// definitions and the server validates submissions against the same definitions.
const crypto = require('crypto');

const SECRET = process.env.FORM_SECRET || crypto.randomBytes(32).toString('hex');
const MIN_AGE_MS = Number(process.env.FORM_MIN_AGE_MS ?? 4000);
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

const CONSENT = 'I have read the <a href="/privacy/">Privacy Policy</a> and agree that DNNC Steps to Success may use what I enter here to respond to my inquiry.';
const consent = { name: 'consent', type: 'checkbox', required: true, label: CONSENT, noun: 'consent', errorRequired: 'Check the box to confirm you agree before sending.' };
const nameF = { name: 'name', label: 'Your full name', noun: 'full name', type: 'text', required: true, max: 100, autocomplete: 'name' };
const emailF = (req = true, hint) => ({ name: 'email', label: 'Email address', noun: 'email address', type: 'email', required: req, max: 254, autocomplete: 'email', hint });
const phoneF = (hint) => ({ name: 'phone', label: 'Phone number', noun: 'phone number', type: 'tel', required: false, max: 25, autocomplete: 'tel', hint });
const msgF = (label, hint, req = true, max = 1500) => ({ name: 'message', label, noun: 'message', type: 'textarea', required: req, min: req ? 10 : 0, max, hint });
const reach = { name: 'preferredContact', label: 'Best way to reach you', noun: 'best way to reach you', type: 'select', required: true,
  options: [['email', 'Email'], ['phone', 'Phone call'], ['either', 'Either is fine']] };

const FORMS = {
  contact: {
    title: 'Send a general message', submit: 'Send Message', page: '/contact/message/',
    notice: 'Please do not include ID numbers, financial details or health information.',
    fields: [nameF, emailF(), msgF('How can we help?'), consent],
  },
  scholarship: {
    title: 'Scholarship inquiry', submit: 'Send Scholarship Inquiry', page: '/contact/scholarship-inquiry/',
    notice: 'This is an inquiry, not an application. Please do not include ID numbers, income, or other private details.',
    fields: [nameF, emailF(false, 'Provide an email address, a phone number, or both.'), phoneF(), reach,
      msgF('What would you like to know about scholarships?'), consent],
    oneOf: ['email', 'phone'],
  },
  volunteer: {
    title: 'Volunteer or mentor interest', submit: 'Send Volunteer Interest', page: '/contact/volunteer/',
    notice: 'Opportunities are being confirmed. Tell us your interest and we will follow up.',
    fields: [nameF, emailF(true), phoneF('Optional.'),
      { name: 'interest', label: 'What interests you most?', noun: 'area of interest', type: 'select', required: true,
        options: [['mentoring', 'Mentoring'], ['events', 'Community events and outreach'], ['skills', 'Sharing a professional skill'], ['unsure', 'Not sure yet']] },
      { name: 'availability', label: 'When are you generally available?', noun: 'availability', type: 'textarea', required: false, max: 500, hint: 'For example, weekday evenings or one Saturday a month.' },
      consent],
  },
  senior: {
    title: 'Senior Moments inquiry', submit: 'Send Senior Moments Inquiry', page: '/contact/senior-outreach/',
    notice: 'You may write for yourself or for someone you care for. Please do not include health information.',
    fields: [
      { name: 'role', label: 'I am a', noun: 'description of who is asking', type: 'select', required: true,
        options: [['senior', 'Senior asking for myself'], ['caregiver', 'Caregiver'], ['family', 'Family member'], ['other', 'Other']] },
      nameF, emailF(false, 'Provide an email address, a phone number, or both.'), phoneF(), reach,
      msgF('What would you like to know?'), consent],
    oneOf: ['email', 'phone'],
  },
  corporate: {
    title: 'Corporate partnership inquiry', submit: 'Send Partnership Inquiry', page: '/contact/corporate/',
    notice: 'Tell us a little about your organization. Partnership options are being confirmed.',
    fields: [nameF,
      { name: 'organization', label: 'Organization', noun: 'organization name', type: 'text', required: true, max: 150, autocomplete: 'organization' },
      { name: 'role', label: 'Your role', noun: 'role', type: 'text', required: false, max: 100, autocomplete: 'organization-title' },
      emailF(true), phoneF('Optional.'),
      { name: 'interest', label: 'What are you interested in?', noun: 'area of interest', type: 'select', required: true,
        options: [['sponsorship', 'Sponsorship'], ['event', 'Event partnership'], ['inkind', 'In-kind support'], ['workplace', 'Workplace giving or matching'], ['team', 'Employee volunteer team'], ['unsure', 'Not sure yet']] },
      msgF('Tell us about your goals'), consent],
  },
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const sign = payload => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
function makeToken(formId, now = Date.now()) {
  const payload = `${formId}.${now}.${crypto.randomBytes(6).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}
function checkToken(token, formId, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return 'invalid';
  const a = Buffer.from(sign(parts.slice(0, 3).join('.'))), b = Buffer.from(parts[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || parts[0] !== formId) return 'invalid';
  const age = now - Number(parts[1]);
  if (!(age >= 0)) return 'invalid';
  if (age < MIN_AGE_MS) return 'fast';
  return age > MAX_AGE_MS ? 'expired' : 'ok';
}

const clean = (v, multiline) => {
  let s = String(v ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  if (!multiline) return s.replace(/[\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.replace(/\n{3,}/g, '\n\n').trim();
};

function validate(formId, input) {
  const def = FORMS[formId];
  const values = {}, errors = {};
  for (const f of def.fields) {
    if (f.type === 'checkbox') {
      values[f.name] = input[f.name] === 'yes' ? 'yes' : '';
      if (f.required && !values[f.name]) errors[f.name] = f.errorRequired;
      continue;
    }
    const v = clean(input[f.name], f.type === 'textarea');
    values[f.name] = v;
    if (!v) { if (f.required) errors[f.name] = f.type === 'select' ? `Choose ${f.noun}.` : `Enter your ${f.noun}.`; continue; }
    if (v.length > f.max) errors[f.name] = `${cap(f.noun)} must be ${f.max} characters or fewer.`;
    else if (f.min && v.length < f.min) errors[f.name] = `Please write at least ${f.min} characters.`;
    else if (f.type === 'email' && !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(v)) errors[f.name] = 'Enter an email address in the format name@example.com.';
    else if (f.type === 'tel' && !/^[0-9+().\-\s]{7,25}$/.test(v)) errors[f.name] = 'Enter a phone number using digits, spaces, dashes or parentheses.';
    else if (f.type === 'select' && !f.options.some(o => o[0] === v)) errors[f.name] = `Choose ${f.noun} from the list.`;
    else if (f.type === 'textarea' && (v.match(/https?:\/\/|www\./gi) || []).length > 2) errors[f.name] = 'Please remove extra web links from your message.';
  }
  if (def.oneOf && def.oneOf.every(n => !values[n]) && !errors[def.oneOf[0]]) errors[def.oneOf[0]] = 'Provide an email address or a phone number so we can reach you.';
  return { values, errors };
}

function renderField(f, formId, values, errors) {
  const id = `${formId}-${f.name}`;
  const err = errors[f.name];
  const describedBy = [f.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ');
  const attrs = `id="${id}" name="${f.name}"${describedBy ? ` aria-describedby="${describedBy}"` : ''}${err ? ' aria-invalid="true"' : ''}${f.required ? ' aria-required="true"' : ''}`;
  const val = esc(values[f.name] || '');
  const errHtml = err ? `<p class="field-error" id="${id}-err"><span class="sr-only">Error: </span>${esc(err)}</p>` : '';
  if (f.type === 'checkbox') {
    return `<div class="field field--check${err ? ' field--error' : ''}">${errHtml}<div class="check-row"><input type="checkbox" ${attrs} value="yes"${values[f.name] ? ' checked' : ''}><label for="${id}">${f.label}</label></div></div>`;
  }
  const label = `<label for="${id}">${f.label} <span class="req">${f.required ? '(required)' : '(optional)'}</span></label>`;
  const hint = f.hint ? `<p class="hint" id="${id}-hint">${esc(f.hint)}</p>` : '';
  let control;
  if (f.type === 'textarea') control = `<textarea ${attrs} rows="6" maxlength="${f.max}">${val}</textarea>`;
  else if (f.type === 'select') control = `<select ${attrs}><option value="">Choose one</option>${f.options.map(([v, l]) => `<option value="${v}"${values[f.name] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else control = `<input type="${f.type}" ${attrs} maxlength="${f.max}" value="${val}"${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}${f.type === 'tel' ? ' inputmode="tel"' : ''}${f.type === 'email' ? ' inputmode="email" autocapitalize="none" spellcheck="false"' : ''}>`;
  return `<div class="field${err ? ' field--error' : ''}">${label}${hint}${errHtml}${control}</div>`;
}

const formsConfig = require('../config/forms.json');
function formsReady(formId) {
  const a = formsConfig.approvals || {};
  const p = formsConfig.provider || {};
  return Object.values(a).every(Boolean) && /^https:\/\//.test((p.endpoints || {})[formId] || '');
}
const FORM_OFF_MESSAGE = 'This form is not accepting messages yet. Please check back soon, or use the other ways to reach us on the Contact page.';

// Static (GitHub Pages) rendering: a plain POST to an approved external endpoint; no server tokens or placeholders.
function renderStaticForm(formId) {
  const def = FORMS[formId];
  const p = formsConfig.provider || {};
  const live = formsReady(formId);
  const hp = p.honeypotName || 'website';
  const fieldsMeta = esc(JSON.stringify({ oneOf: def.oneOf || null, fields: def.fields.map(f => ({ n: f.name, t: f.type, r: !!f.required, min: f.min || 0, max: f.max || 0, noun: f.noun, o: f.options ? f.options.map(x => x[0]) : undefined, e: f.errorRequired })) }));
  const extra = (live && p.redirectField && p.nextUrl) ? `<input type="hidden" name="${esc(p.redirectField)}" value="${esc(p.nextUrl)}">` : '';
  return `<!--form:start--><form class="form" id="form-${formId}" method="post" action="${live ? esc(p.endpoints[formId]) : '#'}" novalidate aria-labelledby="form-${formId}-title" data-static-form data-live="${live ? 'true' : 'false'}" data-fields="${fieldsMeta}">
  <h2 id="form-${formId}-title">${esc(def.title)}</h2>
  <p class="form-notice">${esc(def.notice)}</p>
  ${live ? '' : `<p class="notice-box notice-box--off" role="status"><strong>Not yet available.</strong> ${FORM_OFF_MESSAGE}</p>`}
  <div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="${esc(hp)}" tabindex="-1" autocomplete="off"></label></div>
  ${extra}
  ${def.fields.map(f => renderField(f, formId, {}, {})).join('\n  ')}
  <button class="btn btn--primary" type="submit"${live ? '' : ' disabled aria-disabled="true"'}>${esc(def.submit)}</button>
</form><!--form:end-->`;
}

function renderForm(formId, { values = {}, errors = {}, token = '__FORM_TOKEN__', static: isStatic = false } = {}) {
  if (isStatic) return renderStaticForm(formId);
  const def = FORMS[formId];
  const keys = Object.keys(errors);
  const summary = keys.length
    ? `<div class="error-summary" id="error-summary" role="alert" tabindex="-1"><h2>There is a problem</h2><ul>${keys.map(k => k === '_form'
      ? `<li>${esc(errors[k])}</li>` : `<li><a href="#${formId}-${k}">${esc(errors[k])}</a></li>`).join('')}</ul></div>` : '';
  return `<!--form:start--><form class="form" id="form-${formId}" method="post" action="/api/forms/${formId}" novalidate aria-labelledby="form-${formId}-title">
  <h2 id="form-${formId}-title">${esc(def.title)}</h2>
  <p class="form-notice">${esc(def.notice)}</p>
  <!--FORM_STATUS-->
  ${summary}
  <input type="hidden" name="_t" value="${esc(token)}">
  <div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  ${def.fields.map(f => renderField(f, formId, values, errors)).join('\n  ')}
  <button class="btn btn--primary" type="submit" data-submit>${esc(def.submit)}</button>
</form><!--form:end-->`;
}

module.exports = { FORMS, formsReady, formsConfig, validate, renderForm, makeToken, checkToken, esc };
