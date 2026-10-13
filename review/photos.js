// Image pipeline. For every non-"hold" photo in assets/photos.json:
//  1. copies the untouched original to assets/originals/<same relative path> (hash-verified, never overwritten)
//  2. writes optimized WebP (640/1280/1920, never upscaled) to public/images/optimized/<category>/
//  3. writes assets/photo-index.json for build.js ({{photo:id}} macro)
// Originals are never modified or deleted.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const pubImg = path.join(root, 'public', 'images');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'photos.json'), 'utf8'));
const SIZES = [640, 1280, 1920];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

(async () => {
  const index = {};
  let errors = 0;
  for (const p of manifest.photos) {
    const src = path.join(pubImg, p.src);
    if (!fs.existsSync(src)) { console.log(`ERROR ${p.id}: missing ${p.src}`); errors++; continue; }
    const keep = path.join(root, 'assets', 'originals', p.src);
    fs.mkdirSync(path.dirname(keep), { recursive: true });
    if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);
    if (hash(src) !== hash(keep)) { console.log(`ERROR ${p.id}: preserved original differs from source`); errors++; continue; }
    if (p.status === 'hold') { console.log(`HOLD  ${p.id}: preserved, not published`); continue; }
    if (!p.alt) { console.log(`ERROR ${p.id}: alt required`); errors++; continue; }

    const meta = await sharp(src).metadata();
    const dir = path.join(pubImg, 'optimized', p.category);
    fs.mkdirSync(dir, { recursive: true });
    const widths = SIZES.filter(w => w < meta.width);
    if (!widths.length || meta.width <= SIZES[SIZES.length - 1]) widths.push(meta.width);
    const files = [];
    for (const w of [...new Set(widths)].filter(w => w <= meta.width)) {
      const file = `${p.name}-${w}.webp`;
      const info = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, file));
      files.push({ w: info.width, h: info.height, url: `/images/optimized/${p.category}/${file}`, kb: Math.round(info.size / 1024) });
    }
    index[p.id] = { alt: p.alt, focus: p.focus || '50% 50%', status: p.status, files };
    console.log(`OK    ${p.id}: ${files.map(f => `${f.w}px/${f.kb}KB`).join(', ')} (original ${Math.round(fs.statSync(src).size / 1024)}KB)`);
  }
  fs.writeFileSync(path.join(root, 'assets', 'photo-index.json'), JSON.stringify(index, null, 2));
  const pending = manifest.photos.filter(p => p.status === 'staging').length;
  console.log(`\n${Object.keys(index).length} published to staging (${pending} awaiting identity/consent confirmation), ${errors} errors`);
  process.exit(errors ? 1 : 0);
})();
