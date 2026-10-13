// SEO validation on built output: metadata, canonicals, JSON-LD, sitemap, robots, internal links, redirect plan.
// Run after `npm run build`: npm run seo
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const SITE = process.env.SITE_URL || 'https://example.org';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); };

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? (['images', 'img', 'css', 'js'].includes(e.name) ? [] : walk(path.join(d, e.name))) : e.name === 'index.html' ? [path.join(d, e.name)] : []);
const files = walk(PUB);
const urlOf = f => { const r = path.relative(PUB, path.dirname(f)).replace(/\\/g, '/'); return r ? `/${r}/` : '/'; };
const pages = new Map(files.map(f => [urlOf(f), fs.readFileSync(f, 'utf8')]));
const attr = (h, re) => (h.match(re) || [])[1];

const titles = new Set(), descs = new Set();
const sitemap = fs.existsSync(path.join(PUB, 'sitemap.xml')) ? fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8') : '';
const mapped = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

for (const [url, h] of pages) {
  const title = attr(h, /<title>([^<]*)<\/title>/), desc = attr(h, /<meta name="description" content="([^"]*)"/);
  ok(title && title.length >= 20 && title.length <= 70, `title length 20-70 ${url} (${title && title.length})`);
  ok(desc && desc.length >= 50 && desc.length <= 200, `description length 50-200 ${url} (${desc && desc.length})`);
  ok(!titles.has(title), `unique title ${url}`); titles.add(title);
  ok(!descs.has(desc), `unique description ${url}`); descs.add(desc);
  ok(attr(h, /<link rel="canonical" href="([^"]*)"/) === SITE + url, `canonical = ${SITE + url}`);
  ok(/<html lang="en"/.test(h), `html lang ${url}`);
  ok(/<meta name="robots" content="[^"]*noindex/.test(h), `staging noindex ${url}`);
  ok(/<meta name="viewport"/.test(h), `viewport ${url}`);
  ok((h.match(/<h1[ >]/g) || []).length === 1, `single h1 ${url}`);
  ok(/property="og:title"/.test(h) && /property="og:image"/.test(h), `Open Graph tags ${url}`);
  ok(!/\{\{[a-zA-Z]/.test(h), `no unresolved macros ${url}`);
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const b of blocks) {
    let j; try { j = JSON.parse(b); } catch { ok(false, `JSON-LD parses ${url}`); continue; }
    ok(j['@context'] === 'https://schema.org' && j['@type'], `JSON-LD has @context/@type ${url} (${j['@type']})`);
    if (j['@type'] === 'BreadcrumbList') ok(j.itemListElement.every((x, i) => x.position === i + 1 && x.name && x.item.startsWith(SITE)), `breadcrumb positions/names/items ${url}`);
    if (j['@type'] === 'NGO') {
      ok(j.name && j.url && j.logo, 'Organization has name/url/logo');
      ok(!j.telephone && !j.taxID, 'Organization JSON-LD omits unverified phone/EIN');
      ok(j.email === 'delane@delanesnails.com' && j.address && j.address.streetAddress === '333 Estudillo Ave, Suite 204' && j.address.postalCode === '94577', 'Organization JSON-LD has confirmed address and email');
    }
  }
  if (url !== '/') ok(blocks.length >= 1, `breadcrumb JSON-LD present ${url}`);
  const inMap = mapped.includes(SITE + url);
  if (url === '/contact/thanks/') ok(!inMap, 'thanks page excluded from sitemap'); else ok(inMap, `in sitemap ${url}`);

  for (const m of h.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const t = m[1]; if (t.startsWith('//')) continue;
    const exists = pages.has(t) || (path.extname(t) && fs.existsSync(path.join(PUB, t)));
    if (!exists && !/^\/(api\/|donate\/start)/.test(t)) ok(false, `broken internal link on ${url}: ${t}`);
  }
  for (const m of h.matchAll(/href="(\/[^"#?]*)#([^"]+)"/g)) {
    const target = pages.get(m[1]); if (target) ok(new RegExp(`id="${m[2]}"`).test(target), `anchor ${m[1]}#${m[2]} exists (from ${url})`);
  }
}
ok(mapped.every(u => pages.has(u.replace(SITE, ''))), 'every sitemap URL is a built page');
const robots = fs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8');
ok(/Disallow: \//.test(robots) && !/Allow: \//.test(robots), 'robots.txt blocks all (staging); must be replaced at launch');

const red = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'redirects.json'), 'utf8'));
const rules = Array.isArray(red) ? red : (red.redirects || red.rules || []);
for (const r of rules) if (r.active && r.to) ok(pages.has(r.to), `active redirect ${r.from} -> ${r.to} targets a real page`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
