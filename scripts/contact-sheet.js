// Usage: node scripts/contact-sheet.js <srcDir> <out.png>
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const [src, out] = process.argv.slice(2);
const files = readdirSync(src).filter((f) => f.endsWith('.png')).sort();
const T = 260, COLS = 6, rows = Math.ceil(files.length / COLS);
const tiles = [];
for (const [i, f] of files.entries()) {
  const meta = await sharp(join(src, f)).metadata();
  console.log(i, f, `${meta.width}x${meta.height}`, meta.hasAlpha ? 'alpha' : 'opaque');
  const img = await sharp(join(src, f)).resize(T, T, { fit: 'contain', background: '#ff00ff' }).flatten({ background: '#ff00ff' }).png().toBuffer();
  const label = Buffer.from(`<svg width="${T}" height="30"><rect width="100%" height="100%" fill="#000"/><text x="6" y="22" font-size="22" fill="#fff" font-family="Arial">${i}</text></svg>`);
  tiles.push({ input: img, left: (i % COLS) * T, top: Math.floor(i / COLS) * (T + 30) });
  tiles.push({ input: label, left: (i % COLS) * T, top: Math.floor(i / COLS) * (T + 30) + T });
}
await sharp({ create: { width: COLS * T, height: rows * (T + 30), channels: 3, background: '#222' } }).composite(tiles).png().toFile(out);
