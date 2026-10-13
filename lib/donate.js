const { esc } = require('./forms');
const config = require('../config/donations.json');

function validateDonation(input) {
  const errors = {};
  const frequency = String(input.frequency || '');
  if (!['one-time', 'monthly'].includes(frequency)) errors.frequency = 'Choose one-time or monthly.';
  const choice = String(input.amount || '');
  const raw = choice === 'other' ? String(input.otherAmount || '').trim().replace(/^\$/, '') : choice;
  const amount = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (!choice) errors.amount = 'Choose a gift amount.';
  else if (!(amount >= 1 && amount <= config.maxAmount)) errors.amount = `Enter a whole-dollar amount between $1 and $${config.maxAmount.toLocaleString('en-US')}.`;
  return { values: { frequency, amount: choice, otherAmount: String(input.otherAmount || '').slice(0, 8) }, errors, amount };
}

function renderDonateForm({ values = {}, errors = {} } = {}) {
  const freq = values.frequency || 'one-time';
  const keys = Object.keys(errors);
  const summary = keys.length ? `<div class="error-summary" id="error-summary" role="alert" tabindex="-1"><h2>There is a problem</h2><ul>${keys.map(k =>
    `<li><a href="#${k === 'frequency' ? 'gift-one-time' : 'amt-' + config.suggestedAmounts[0]}">${esc(errors[k])}</a></li>`).join('')}</ul></div>` : '';
  const radio = (name, id, val, label, checked) => `<div class="choice"><input type="radio" name="${name}" id="${id}" value="${val}"${checked ? ' checked' : ''}><label for="${id}">${label}</label></div>`;
  return `<!--form:start--><form class="form donate-form" id="form-donate" method="post" action="/donate/start" novalidate aria-labelledby="form-donate-title">
  <h2 id="form-donate-title">Make a gift</h2>
  <!--FORM_STATUS-->
  ${summary}
  <fieldset class="field${errors.frequency ? ' field--error' : ''}"><legend>Gift frequency</legend>
    ${errors.frequency ? `<p class="field-error"><span class="sr-only">Error: </span>${esc(errors.frequency)}</p>` : ''}
    <div class="choices">${radio('frequency', 'gift-one-time', 'one-time', 'One-time gift', freq === 'one-time')}${radio('frequency', 'gift-monthly', 'monthly', 'Monthly gift', freq === 'monthly')}</div>
  </fieldset>
  <fieldset class="field${errors.amount ? ' field--error' : ''}"><legend>Gift amount (US dollars)</legend>
    ${errors.amount ? `<p class="field-error"><span class="sr-only">Error: </span>${esc(errors.amount)}</p>` : ''}
    <div class="choices">${config.suggestedAmounts.map(a => radio('amount', `amt-${a}`, a, `$${a}`, values.amount === String(a))).join('')}${radio('amount', 'amt-other', 'other', 'Other amount', values.amount === 'other')}</div>
    <div class="field field--inline"><label for="other-amount">Other amount in dollars <span class="req">(only if you chose Other)</span></label>
    <input type="text" id="other-amount" name="otherAmount" inputmode="numeric" maxlength="8" autocomplete="off" value="${esc(values.otherAmount || '')}"></div>
  </fieldset>
  <p class="form-notice">You will finish on the payment processor's secure page. This website never sees or stores your card details.</p>
  <button class="btn btn--primary" type="submit" data-submit>Continue to Secure Checkout</button>
</form><!--form:end-->`;
}

// Static (GitHub Pages) rendering: links out to the approved hosted checkout. No card data, keys or server round trip.
function renderStaticDonate() {
  const ready = donationsReady();
  const link = (label, url, cls) => ready && /^https:\/\//.test(url)
    ? `<a class="btn ${cls}" href="${esc(url)}" rel="noopener">${label}</a>`
    : `<span class="btn ${cls} btn--disabled" role="link" aria-disabled="true">${label}</span>`;
  return `<!--form:start--><div class="form donate-form" id="form-donate">
  <h2 id="form-donate-title">Make a gift</h2>
  ${ready ? '' : '<p class="notice-box notice-box--off" role="status"><strong>Online giving is not open yet.</strong> We will turn it on once our payment provider and receipt details are confirmed.</p>'}
  <div class="choices">${link('Give Once', config.checkoutUrls.oneTime, 'btn--primary')} ${link('Give Monthly', config.checkoutUrls.monthly, 'btn--secondary')}</div>
  <p class="form-notice">You will finish on the payment provider's secure page. This website never sees or stores your card details.</p>
</div><!--form:end-->`;
}

function checkoutUrl(frequency, amount) {
  const url = frequency === 'monthly' ? config.checkoutUrls.monthly : config.checkoutUrls.oneTime;
  if (!/^https:\/\//.test(url)) return null;
  const u = new URL(url);
  if (config.amountParam) u.searchParams.set(config.amountParam, String(amount));
  return u.toString();
}

function donationsReady() {
  const a = config.approvals || {};
  return config.enabled && Object.values(a).every(Boolean) && /^https:\/\//.test(config.checkoutUrls.oneTime);
}

module.exports = { validateDonation, renderDonateForm, renderStaticDonate, checkoutUrl, donationsReady, config };
