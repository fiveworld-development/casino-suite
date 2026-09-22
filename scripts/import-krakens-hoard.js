// Imports the ChatGPT-generated source PNGs into web-ready, trimmed WebP files.
// Usage: node scripts/import-krakens-hoard.js <srcDir>
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
const out = 'public/assets/krakens-hoard';
mkdirSync(out, { recursive: true });

// source file → [target name, max edge px, trim transparent border]
const MAP = {
  call_91DVX3TccnMS6z7uKzb23vX9: ['win_mega', 1000, true],
  call_CHtlMBMbV4HiJTvoXKAEhq2T: ['plank', 1200, true],
  call_Dbh6yL1K4o3dBHbRAxTJOenB: ['sym_wild', 400, true],
  call_IducLJRiTizX2U3h7o3kEbg2: ['sym_A', 400, true],
  call_MAwhRKhZQMsbAzqEERMl1fNF: ['sym_scatter', 400, true],
  call_Mtcbbzl9YWJFS14b2bXfGzWv: ['sym_Q', 400, true],
  call_SjSDxP3QvWLXvtYRTcNfLoGI: ['bg_main', 1920, false],
  call_UxkEg6spEjW971RAQ5VgS6qu: ['logo', 900, true],
  call_XmdBi2E2iY4KLBolNKx46ULu: ['win_epic', 1000, true],
  call_clcfu9Xu8JNGJPzLR2Pr62T2: ['sym_rum', 400, true],
  call_dLfVh8gL46AnlD9iPKTkp3EA: ['sym_chest', 400, true],
  call_dig6tSgJGm2eHnM6kVEBU9Ox: ['bg_freespins', 1920, false],
  call_dvnIhErB1fZFMzg93ntUduLa: ['sym_T', 400, true],
  call_i9t0sLWyAU2p55rcMYMIKRP6: ['frame', 1536, false],
  call_mXH9hnjO0jp4mxAfgmwVue9i: ['sym_pistol', 400, true],
  call_ofJMEfAHoWrPHNWmpgCoah3p: ['sym_ship', 400, true],
  call_ope7oh1fJyx2hd1e1N71S3Ph: ['sym_captain', 400, true],
  call_pP5mA3S2whj21LGxoapkjBIN: ['sym_K', 400, true],
  call_seBTpApKJrWxuLQFHUUqD2o9: ['sym_J', 400, true],
  call_txHZCj2AUUCRhuufbsQsaUpw: ['sym_parrot', 400, true],
  call_uqh8IN8kXGu9YmPUJ3Dm80vb: ['win_big', 1000, true],
  // call_zb9hB2n5JQg8hDlqX82urIVG: duplicate K, unused
};

// Frame is rebuilt in code from 3 parts so ornaments never distort (see main.js buildFrame):
// top (y 0–650) + stretched plain post strips + bottom (y 650–1024). The bottom part gets the
// few pixels of cloth tips that hang past the cut erased, otherwise they'd float below the stretch.
export async function buildFrameBottom() {
  const CUT = 650;
  const { data, info } = await sharp(join(out, 'frame.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = CUT; y < CUT + 16; y++)
    for (let x = 0; x < info.width; x++)
      if (x < 92 || x > 1452) data[(y * info.width + x) * 4 + 3] = 0;
  await sharp(data, { raw: info }).extract({ left: 0, top: CUT, width: info.width, height: info.height - CUT })
    .webp({ quality: 90, alphaQuality: 95 }).toFile(join(out, 'frame_bottom.webp'));
  console.log('frame_bottom   built');
}

for (const [file, [name, max, trim]] of Object.entries(MAP)) {
  let img = sharp(join(src, `${file}.png`));
  if (trim) img = sharp(await img.trim({ threshold: 1 }).toBuffer());
  const info = await img
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(join(out, `${name}.webp`));
  console.log(name.padEnd(14), `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
}

await buildFrameBottom();
