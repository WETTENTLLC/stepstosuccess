const fs = require('fs');
const path = require('path');
const { esc } = require('./forms');
const { zelle } = require('../config/donations.json');

const QR_SOURCE = path.join(__dirname, '..', 'private', 'zelle', 'zelle-qr.png');
const QR_URL = '/images/zelle/zelle-qr.png';

const qrAvailable = () => fs.existsSync(QR_SOURCE);

// The QR is only rendered when the private file exists locally (never in CI or the public repo) and,
// online builds omit it unless the site is live AND the director approved it; only a local preview opts in via INCLUDE_ZELLE_QR=1.
function showQr({ prod, live }) {
  return prod && qrAvailable() && (live ? zelle.qrPublishApproved === true : process.env.INCLUDE_ZELLE_QR === '1');
}

function renderZelle({ prod, live }) {
  const qr = showQr({ prod, live });
  const email = esc(zelle.email);
  const recipient = esc(zelle.recipientLegalName);
  const qrBlock = qr
    ? `<figure class="zelle-qr"><img src="${QR_URL}" width="500" height="500" alt="Zelle QR code for ${recipient}. If you cannot scan it, use the email address shown beside it." decoding="async"><figcaption>Scan with the Zelle feature in your banking app.</figcaption></figure>`
    : '';
  const { donationsReady, config: dcfg } = require('./donate');
  const payUrl = dcfg.checkoutUrls.oneTime;
  const paypal = donationsReady() && /^https:\/\//.test(payUrl)
    ? `<div class="paypal-give" id="give-online">
  <h2 id="give-online-title">Give online</h2>
  <p>Give by card or PayPal on PayPal&rsquo;s secure payment page. You choose your own amount. This website never sees or stores your payment details.</p>
  <p><a class="btn btn--primary" href="${esc(payUrl)}" rel="noopener">Give Online</a></p>
</div>
`
    : '';
  return `${paypal}<div class="zelle" id="form-donate">
  <h2 id="form-donate-title">Donate with Zelle</h2>
  <p>Open Zelle through your participating banking app${qr ? ' and scan our QR code, or enter' : ' and send your gift to'}:</p>
  <div class="zelle-grid${qr ? '' : ' zelle-grid--single'}">
    ${qrBlock}
    <div class="zelle-details">
      <p class="zelle-label" id="zelle-email-label">Zelle email</p>
      <p class="zelle-email"><a href="mailto:${email}" id="zelle-email">${email}</a></p>
      <button type="button" class="btn btn--secondary" data-copy="#zelle-email" hidden>Copy email address</button>
      <p class="sr-only" role="status" aria-live="polite" data-copy-status></p>
      <div class="notice-box">
        <p class="h3">Before you send</p>
        <p>Confirm that the recipient appears as:</p>
        <p class="zelle-recipient">${recipient}</p>
      </div>
    </div>
  </div>
  <h3>How to give with Zelle</h3>
  <ol class="steps-list">
    <li>Open your bank&rsquo;s mobile app or website and find <strong>Zelle</strong> (sometimes under &ldquo;Send money&rdquo; or &ldquo;Transfer&rdquo;).</li>
    <li>${qr ? 'Choose to scan a QR code, or ' : ''}choose to send money using an email address, and enter <strong>${email}</strong>.</li>
    <li>Check that the recipient name shows <strong>${recipient}</strong>.</li>
    <li>Enter your gift amount and send it.</li>
  </ol>
  <p class="form-notice">Zelle gifts are one-time transfers made through your own bank. This page does not set up automatic recurring gifts, and receipts are not promised automatically. To request a gift acknowledgment, email <a href="mailto:delane@delanesnails.com">delane@delanesnails.com</a> with your name and the date and amount of your gift. Not every bank offers Zelle.</p>
</div>`;
}

module.exports = { renderZelle, showQr, QR_SOURCE, qrAvailable };
