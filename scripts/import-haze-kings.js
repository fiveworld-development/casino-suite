// Imports the ChatGPT-generated source PNGs into web-ready, trimmed WebP files.
// Usage: node scripts/import-haze-kings.js <srcDir>
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/import-haze-kings.js <folder with the generated PNGs>'); process.exit(1); }
const out = 'public/assets/haze-kings';
mkdirSync(out, { recursive: true });

// source file (no extension) → [target name, max edge px, trim transparent border]
const SYMBOLS = ['sym_king', 'sym_bong', 'sym_joint', 'sym_grinder', 'sym_lighter',
  'sym_bud_green', 'sym_bud_purple', 'sym_bud_orange', 'sym_bud_blue', 'sym_wild', 'sym_scatter'];

const MAP = {
  bg_main: ['bg_main', 1920, false],
  bg_freespins: ['bg_freespins', 1920, false],
  frame: ['frame', 1536, false],
  logo: ['logo', 1000, true],
  fs_intro: ['fs_intro', 1000, true],
  super_fs_intro: ['super_fs_intro', 1000, true],
  bonus_buy: ['bonus_buy', 400, true],
  multiplier_frame: ['multiplier_frame', 400, true],
  smoke_puff: ['smoke_puff', 512, true],
  smoke_ring: ['smoke_ring', 512, true],
  leaf_particle: ['leaf_particle', 256, true],
  flame: ['flame', 400, true],
  lighter_big: ['lighter_big', 512, true],
  win_big: ['win_big', 1000, true],
  win_mega: ['win_mega', 1000, true],
  win_epic: ['win_epic', 1000, true],
  win_legendary: ['win_legendary', 1000, true],
};
for (const s of SYMBOLS) MAP[s] = [s, 400, true];

let done = 0, missing = 0;
for (const [file, [name, max, trim]] of Object.entries(MAP)) {
  const srcFile = join(src, `${file}.png`);
  if (!existsSync(srcFile)) { console.log(name.padEnd(16), 'MISSING source', srcFile); missing++; continue; }
  let img = sharp(srcFile);
  if (trim) img = sharp(await img.trim({ threshold: 1 }).toBuffer());
  const info = await img
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(join(out, `${name}.webp`));
  console.log(name.padEnd(16), `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
  done++;
}
console.log(`\n${done} imported, ${missing} missing`);

// measure the frame's transparent centre opening (like Kraken's frame was measured) so main.js
// can scale the frame without stretching ornaments non-uniformly
const framePath = join(out, 'frame.webp');
if (existsSync(framePath)) {
  const { data, info } = await sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  const cx = Math.floor(info.width / 2), cy = Math.floor(info.height / 2);
  let left = cx, right = cx, top = cy, bottom = cy;
  while (left > 0 && alphaAt(left - 1, cy) < 12) left--;
  while (right < info.width - 1 && alphaAt(right + 1, cy) < 12) right++;
  while (top > 0 && alphaAt(cx, top - 1) < 12) top--;
  while (bottom < info.height - 1 && alphaAt(cx, bottom + 1) < 12) bottom++;
  console.log(`\nframe opening (in ${info.width}x${info.height}): x ${left}-${right}  y ${top}-${bottom}`);
  console.log('-> copy these into FR.open{L,R,T,B} in src/games/haze-kings/main.js');
}
