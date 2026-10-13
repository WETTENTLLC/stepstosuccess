// Static page builder: src/layout.html + src/pages/*.html -> public/<slug>/index.html
// Each page starts with a one-line JSON comment: <!--meta {"slug":"programs","title":"...","description":"..."} -->
const fs = require('fs');
const path = require('path');
const { FORMS, renderForm, formsConfig } = require('./lib/forms');
const { renderDonateForm, renderStaticDonate } = require('./lib/donate');
const site = require('./config/site.json');
const redirectsConfig = require('./config/redirects.json');
const PROD = process.env.BUILD_TARGET === 'production';
const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, PROD ? 'dist' : 'public');
const SITE = PROD ? `https://${site.canonicalHost}` : (process.env.SITE_URL || 'https://example.org');
const LIVE = PROD && site.launchApproved === true;
const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');

const formOrigins = [...new Set(Object.values((formsConfig.provider || {}).endpoints || {}).filter(u => /^https:\/\//.test(u)).map(u => new URL(u).origin))];
// GitHub Pages cannot send headers, so the policy is a meta tag (frame-ancestors is not supported there).
const CSP = `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' ${formOrigins.join(' ')}`.trim();
const robotsTag = PROD ? (LIVE ? '' : '<meta name="robots" content="noindex, nofollow">') : '<meta name="robots" content="noindex, nofollow"><!-- STAGING: remove at launch -->';
const cspTag = PROD ? `<meta http-equiv="Content-Security-Policy" content="${CSP}">` : '';

const NAV = [
  ['home', '/', 'Home'],
  ['our-story', '/our-story/', 'Our Story'],
  ['programs', '/programs/', 'Programs'],
  ['senior-moments', '/senior-moments/', 'Senior Moments'],
  ['impact', '/impact/', 'Impact'],
  ['get-involved', '/get-involved/', 'Get Involved'],
  ['partners', '/partners/', 'Partners'],
  ['contact', '/contact/', 'Contact'],
];

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// {{photo:id}} or {{photo:id|sizes=...|eager|alt=...}} -> responsive WebP <picture> inside .photo-frame
let PHOTOS = {};
try { PHOTOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'photo-index.json'), 'utf8')); } catch { console.warn('No assets/photo-index.json: run npm run photos'); }
const photo = spec => {
  const [id, ...opts] = spec.split('|');
  const p = PHOTOS[id];
  if (!p) throw new Error(`Unknown photo id: ${id}`);
  const o = Object.fromEntries(opts.map(x => x.split('=')));
  const big = p.files[p.files.length - 1];
  const srcset = p.files.map(f => `${f.url} ${f.w}w`).join(', ');
  const eager = 'eager' in o;
  const alt = o.alt !== undefined ? o.alt : p.alt;
  return `<div class="photo-frame photo-frame--img"><picture><source type="image/webp" srcset="${srcset}" sizes="${o.sizes || '(min-width: 56rem) 45vw, 100vw'}"><img src="${big.url}" width="${big.w}" height="${big.h}" alt="${esc(alt)}" style="object-position:${p.focus}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture></div>`;
};

const pages = [];
for (const file of fs.readdirSync(path.join(SRC, 'pages'))) {
  if (!file.endsWith('.html') || file.startsWith('_')) continue;
  const raw = fs.readFileSync(path.join(SRC, 'pages', file), 'utf8');
  const m = raw.match(/^<!--meta (\{.*?\}) -->\s*/);
  if (!m) throw new Error(`${file}: missing meta comment`);
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length)
    .replace(/<!--FORM_STATUS-->/g, PROD ? '' : '<!--FORM_STATUS-->')
    .replace(/\{\{photo:([^}]+)\}\}/g, (_, s) => photo(s))
    .replace(/\{\{form:([a-z]+)\}\}/g, (_, id) => { if (!FORMS[id]) throw new Error(`Unknown form: ${id}`); return renderForm(id, { static: PROD }); })
    .replace(/\{\{donate-form\}\}/g, () => PROD ? renderStaticDonate() : renderDonateForm());
  const url = meta.slug === 'home' ? '/' : `/${meta.slug}/`;

  const nav = NAV.map(([slug, href, label]) =>
    `<li><a href="${href}"${slug === meta.slug || meta.slug.startsWith(slug + '/') ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n          ');
  const donateCurrent = meta.slug === 'donate' ? ' aria-current="page"' : '';

  const org = {
    '@context': 'https://schema.org', '@type': 'NGO', name: 'DNNC Steps to Success', alternateName: "Delane's Natural Nail Care: Steps to Success",
    url: SITE + '/', logo: SITE + '/img/logo.png', founder: { '@type': 'Person', name: 'Delane Sims' },
    description: 'Vocational training scholarships, mentorship and support for women and single parents.',
    address: { '@type': 'PostalAddress', addressLocality: 'San Leandro', addressRegion: 'CA', addressCountry: 'US' },
  }; // VERIFY before launch: legal name, address, founder title, nonprofit status; add telephone, email, sameAs, taxID only once approved
  const parent = meta.slug.includes('/') ? NAV.find(n => n[0] === meta.slug.split('/')[0]) : null;
  const trail = [['Home', '/'], ...(parent ? [[parent[2], parent[1]]] : []), [meta.title.split(' | ')[0], url]];
  const crumbs = meta.slug === 'home' ? null : {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u })) };
  const jsonld = [meta.slug === 'home' ? org : null, crumbs].filter(Boolean)
    .map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');

  const sub = { title: esc(meta.title), description: esc(meta.description), canonical: SITE + url, siteurl: SITE, nav, donateCurrent, jsonld, robots: robotsTag, csp: cspTag, content: body };
    const html = layout.replace(/\{\{(title|description|canonical|siteurl|nav|donateCurrent|jsonld|robots|csp|content)\}\}/g, (_, k) => sub[k]);

  if (meta.sitemap !== false) pages.push(url);
  const dest = meta.slug === 'home' ? path.join(OUT, 'index.html') : path.join(OUT, meta.slug, 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log('built', url);
}


const writeSitemap = () => fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + pages.sort().map(u => '  <url><loc>' + SITE + u + '</loc></url>').join('\n') + '\n</urlset>\n');

if (!PROD) {
  // Staging: block all crawlers. Production robots/sitemap are decided by config/site.json launchApproved.
  fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  writeSitemap();
} else {
  const copyDir = (from, to) => {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const s = path.join(from, e.name), d = path.join(to, e.name);
      if (e.isDirectory()) copyDir(s, d); else if (!/\.(gitkeep|md)$/i.test(e.name)) fs.copyFileSync(s, d);
    }
  };
  // Allowlist only: never copy public/images/<category> originals, server code, config, assets or review files.
  const PUB = path.join(__dirname, 'public');
  for (const d of ['css', 'js', 'img']) copyDir(path.join(PUB, d), path.join(OUT, d));
  copyDir(path.join(PUB, 'images', 'optimized'), path.join(OUT, 'images', 'optimized'));
  fs.copyFileSync(path.join(PUB, '404.html'), path.join(OUT, '404.html'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  // GitHub Pages cannot send 301s: each verified, active redirect becomes a static page (meta refresh + canonical).
  let stubs = 0;
  for (const r of redirectsConfig.redirects) {
    if (!r.active || !r.verified || r.status !== 301 || !r.to || r.prefix) continue;
    const target = SITE + r.to;
    const rel = r.from.replace(/^\/|\/$/g, '');
    const dest = /\.html$/.test(rel) ? path.join(OUT, rel) : path.join(OUT, rel, 'index.html');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Page moved | DNNC Steps to Success</title>\n<link rel="canonical" href="${target}">\n<meta http-equiv="refresh" content="0; url=${r.to}">\n<meta name="viewport" content="width=device-width, initial-scale=1"></head>\n<body><p>This page has moved. <a href="${r.to}">Continue to the new page</a>.</p></body></html>\n`);
    stubs++;
  }
  console.log(`redirect stubs: ${stubs}`);

  if (LIVE) {
    fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
    writeSitemap();
    fs.writeFileSync(path.join(OUT, 'CNAME'), site.domain + '\n');
  } else {
    fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }
  console.log(LIVE ? 'PRODUCTION build (launchApproved)' : 'PRODUCTION PREVIEW build (launch not approved: noindex, no sitemap, no CNAME)');
}
