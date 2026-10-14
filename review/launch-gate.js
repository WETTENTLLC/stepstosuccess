// Launch gate: lists everything that still blocks a public launch. Exit 1 while any blocker remains.
// Run: npm run launch-gate   (uses dist/; build first with npm run build:prod)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const j = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const blockers = [];
const block = m => blockers.push(m);

const site = j('config/site.json'), forms = j('config/forms.json'), don = j('config/donations.json');
if (!site.domainOwnershipVerified) block('Domain ownership/registrar control not verified (config/site.json domainOwnershipVerified)');
if (!site.launchApproved) block('Written final launch authorization not recorded (config/site.json launchApproved)');
if (!site.contentApprovedByExecutiveDirector) block('Executive Director content and photo approval not recorded (config/site.json contentApprovedByExecutiveDirector; see DELANE-REVIEW.md)');
for (const [k, v] of Object.entries(forms.approvals)) if (!v) block(`Forms: ${k} is not approved`);
for (const [k, v] of Object.entries(forms.provider.endpoints)) if (!/^https:\/\//.test(v)) block(`Forms: no approved endpoint for "${k}"`);
if (forms.retentionDays == null) block('Forms: data-retention period not set');
for (const [k, v] of Object.entries(don.approvals)) if (!v) block(`Donations: ${k} is not verified`);
if (!don.enabled || !/^https:\/\//.test(don.checkoutUrls.oneTime) || !/^https:\/\//.test(don.checkoutUrls.monthly)) block('Donations: hosted checkout URLs not configured/enabled');
const org = j('config/organization.json');
if (!org.irsVerified) block('Organization: legal name, EIN ' + org.ein + ' and 501(c)(3) status not verified against IRS records (config/organization.json irsVerified)');
if (!don.zelle.qrPublishApproved) block('Donations: Zelle QR publication not approved by Delane (config/donations.json zelle.qrPublishApproved)');
if (!don.zelle.qrScanTestedWithBankApp) block('Donations: Zelle QR not yet scan-tested with a banking app (zelle.qrScanTestedWithBankApp)');
if (!org.taxDeductibilityStatement) block('Donations: approved tax-deductibility statement not set (config/organization.json)');
const unverified = j('config/redirects.json').redirects.filter(r => !r.active && r.status === 301);
if (unverified.length) block(`Redirects: ${unverified.length} legacy URL guesses are unconfirmed (${unverified.map(r => r.from).join(', ')}); confirm in Search Console or the old site`);

if (!fs.existsSync(DIST)) block('dist/ does not exist: run npm run build:prod');
else {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(DIST);
  const rel = f => path.relative(DIST, f).split(path.sep).join('/');
  const html = files.filter(f => f.endsWith('.html'));
  const markers = {};
  for (const f of html) {
    const t = fs.readFileSync(f, 'utf8');
    for (const [name, re] of [['DRAFT/VERIFY/CONFIRM/APPROVAL badges', /\b(DRAFT|VERIFY|CONFIRM|NEEDS APPROVAL|PLACEHOLDER)\b/], ['example.org', /example\.org/], ['bracket placeholders', /\[(TBD|TODO|[A-Z ]{4,})\]/], ['staging labels', /STAGING/i]])
      if (re.test(t)) (markers[name] = markers[name] || []).push(rel(f));
  }
  for (const [n, list] of Object.entries(markers)) block(`Content: ${n} remain in ${list.length} page(s), e.g. ${list.slice(0, 3).join(', ')}`);
  const idx = j('assets/photo-index.json');
  const notApproved = Object.entries(idx).filter(([, p]) => p.status !== 'approved').map(([k]) => k);
  if (notApproved.length) block(`Photos: ${notApproved.length} published photo(s) lack confirmed identity/consent (not "approved"): ${notApproved.join(', ')}`);
  const forbidden = files.map(rel).filter(f => /(^|\/)(server\.js|package(-lock)?\.json|\.env.*|build\.js)$|^(config|lib|assets|data|review|src|backups|node_modules)\//.test(f) || /^images\/(?!optimized\/)/.test(f)).filter(f => !(don.zelle.qrPublishApproved && f === 'images/zelle/zelle-qr.png'));
  if (forbidden.length) block(`Dist contains forbidden files: ${forbidden.slice(0, 5).join(', ')}`);
}

console.log(blockers.length ? `LAUNCH BLOCKED: ${blockers.length} item(s)\n` + blockers.map((b, i) => ` ${i + 1}. ${b}`).join('\n') : 'Launch gate passed.');
process.exit(blockers.length ? 1 : 0);
