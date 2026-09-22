// Downscale images that are much larger than they are ever displayed (incl. 2-3x retina).
// Originals are kept in .asset-originals/ (git-ignored). Re-run safely: it always starts from the originals.
// Usage: node scripts/optimize-assets.js
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = '.asset-originals';
const DST = 'public/assets';
// [glob-ish prefix, max width, max height] – the largest on-screen size × device pixel ratio, rounded up
const RULES = [
  [/^tables\/chip_/, 256, 256],
  [/^poker\/avatar_/, 384, 384],
  [/^blackjack\/dealer\./, 448, 448],
  [/^blackjack\/(shoe|discard_tray)\./, 560, 560],
  [/^tables\/(court_[JQK]|card_back)\./, 520, 760],
  [/^(poker\/(logo_|win_)|blackjack\/logo_)/, 1200, 1200],
];

if (!fs.existsSync(SRC)) fs.cpSync(DST, SRC, { recursive: true });

const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.webp$/.test(e.name)) files.push(p);
});
walk(SRC);

let before = 0, after = 0;
for (const src of files) {
  const rel = path.relative(SRC, src).split(path.sep).join('/');
  const rule = RULES.find(([re]) => re.test(rel));
  if (!rule) continue;
  const dst = path.join(DST, rel);
  const img = sharp(src);
  const { width, height } = await img.metadata();
  const [, mw, mh] = rule;
  if (width <= mw && height <= mh) continue;
  const buf = await img.resize({ width: mw, height: mh, fit: 'inside', kernel: 'lanczos3' }).webp({ quality: 88, effort: 6 }).toBuffer();
  const orig = fs.statSync(src).size;
  if (buf.length >= orig) continue;
  fs.writeFileSync(dst, buf);
  before += orig; after += buf.length;
  const m = await sharp(buf).metadata();
  console.log(`${rel}: ${width}x${height} ${Math.round(orig / 1024)} KB -> ${m.width}x${m.height} ${Math.round(buf.length / 1024)} KB`);
}
console.log(`total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
