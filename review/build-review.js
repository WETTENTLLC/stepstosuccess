// Builds dist/ for the private online review site and refuses to continue if anything sensitive is present.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
const env = { ...process.env, BUILD_TARGET: 'production' };
delete env.INCLUDE_ZELLE_QR;
const r = spawnSync(process.execPath, ['build.js'], { cwd: root, stdio: 'inherit', env });
if (r.status) process.exit(r.status);

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(dist, p).replace(/\\/g, '/')); } })(dist);
const problems = [];
if (files.some(f => /zelle|qr/i.test(f))) problems.push('Zelle/QR file present');
if (files.some(f => /^images\/(?!optimized\/)/.test(f))) problems.push('non-optimized image folder present');
if (files.some(f => /\.(jpe?g)$/i.test(f))) problems.push('original-style JPEG present');
if (files.some(f => /^(config|lib|assets|data|private|review|src|workers|research|docs)\//.test(f) || /(^|\/)(server\.js|package(-lock)?\.json|\.env.*)$/.test(f))) problems.push('private/source file present');
if (!files.includes('_headers')) problems.push('_headers (noindex) missing');
if (files.includes('sitemap.xml') || files.includes('CNAME')) problems.push('sitemap/CNAME present (launch-only)');
const txt = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
if (!/Disallow: \//.test(txt)) problems.push('robots.txt does not disallow all');
const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!/noindex/.test(home)) problems.push('noindex meta missing');
const donate = fs.readFileSync(path.join(dist, 'donate', 'index.html'), 'utf8');
if (/<img[^>]+zelle/i.test(donate)) problems.push('QR image referenced on donate page');
if (/6936|Business Adv/i.test(files.map(f => f.endsWith('.html') ? fs.readFileSync(path.join(dist, f), 'utf8') : '').join(''))) problems.push('bank details found in HTML');
if (problems.length) { console.error('REVIEW BUILD REFUSED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`review build OK: ${files.length} files, no QR, noindex, no sitemap/CNAME. Deploy the dist/ folder only.`);
