// Imports source PNGs for the shared table-game kit (Blackjack + Poker, "Haze Kings Lounge")
// into trimmed WebP files under public/assets/{tables,blackjack,poker}/.
// Usage: node scripts/import-tables.js
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/import-tables.js <folder with the generated table assets>'); process.exit(1); }

const FOLDERS = {
  tables: ['bg_room', 'card_back', 'court_J', 'court_Q', 'court_K', 'chip_1', 'chip_5', 'chip_25', 'chip_100', 'chip_420', 'chip_1000', 'smoke_layer'],
  blackjack: ['table_blackjack', 'shoe', 'discard_tray', 'dealer', 'logo_blackjack'],
  poker: ['table_poker', 'dealer_button', 'avatar_shark', 'avatar_lucky', 'avatar_maverick', 'avatar_professor', 'avatar_rookie', 'avatar_player', 'logo_poker', 'logo_videopoker', 'win_blackjack', 'win_royal'],
};

// Backgrounds/tables shouldn't be alpha-trimmed (they are full-bleed rectangles); everything else
// is a sprite on transparent background and benefits from trimming to its visible bounds.
const NO_TRIM = new Set(['bg_room', 'table_blackjack', 'table_poker', 'smoke_layer']);

async function run() {
  let ok = 0, missing = 0;
  for (const [folder, names] of Object.entries(FOLDERS)) {
    const outDir = join(ROOT, 'public', 'assets', folder);
    mkdirSync(outDir, { recursive: true });
    for (const name of names) {
      const inFile = join(SRC, folder, `${name}.png`);
      const outFile = join(outDir, `${name}.webp`);
      if (!existsSync(inFile)) { console.warn(`MISSING source: ${inFile}`); missing++; continue; }
      let img = sharp(inFile);
      if (!NO_TRIM.has(name)) img = img.trim();
      await img.webp({ quality: 92 }).toFile(outFile);
      console.log(`OK  ${folder}/${name}.webp`);
      ok++;
    }
  }
  console.log(`\nDone: ${ok} imported, ${missing} missing.`);
  if (missing) process.exitCode = 1;
}

run();
