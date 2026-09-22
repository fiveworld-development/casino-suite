// Captures the README screenshots from the running dev server (npm run dev).
// Usage: node scripts/screenshots.js   → docs/screenshots/*.webp
import fs from 'node:fs';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5190';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(path, viewport, dsf = 1.5) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  await page.goto(BASE + path);
  return page;
}
async function start(page) {
  await page.waitForSelector('#load-start:not([hidden])', { timeout: 30000 });
  await wait(400);
  await page.click('#load-start');
  await wait(1800);
}
async function shot(page, name) {
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 86 }).toFile(`${OUT}/${name}.webp`);
  console.log('saved', name);
  return png;
}

const DESK = { width: 1440, height: 810 };
const PHONE = { width: 390, height: 844 };

// lobby
{ const p = await open('/?lang=en', DESK); await wait(1500); await shot(p, 'lobby'); await p.context().close(); }

// slots: spin until something is happening on the reels
for (const [slug, name] of [['krakens-hoard', 'krakens-hoard'], ['haze-kings', 'haze-kings']]) {
  const p = await open(`/${slug}.html?lang=en`, DESK);
  await start(p);
  await wait(2500);
  for (let i = 0; i < 3; i++) { await p.click('#spin'); await wait(3500); }
  await p.click('#spin'); await wait(1600);
  await shot(p, name + '-still');
  await p.context().close();
}

// blackjack: a live hand
{
  const p = await open('/blackjack.html?debug&lang=en', DESK);
  await start(p);
  await p.click('.chip[data-d="100"]'); await p.click('.chip[data-d="25"]'); await wait(700);
  await p.click('#btn-deal'); await wait(3500);
  if (await p.isVisible('#btn-ins-no')) { await p.click('#btn-ins-no'); await wait(1500); }
  await shot(p, 'blackjack');
  await p.context().close();
}

// poker: play calls until the turn is out and it's our move
async function pokerHand(p, minBoard) {
  // drive the table inside the page until the board has `minBoard` cards and it's our turn
  await p.evaluate(async (minBoard) => {
    const PK = window.PK;
    PK.S.speed = 1;
    const t0 = performance.now();
    while (performance.now() - t0 < 40000) {
      if (!PK.S.seated && !PK.S.inHand) PK.sit();
      if (PK.pending && (PK.table?.board || []).length >= minBoard) break;
      if (PK.pending) PK.act('call');
      await PK.run(32, 16);
    }
    await PK.run(400);
  }, minBoard);
  await wait(300);
}
{
  const p = await open('/poker.html?debug&lang=en', DESK);
  await start(p);
  await pokerHand(p, 4);
  await shot(p, 'poker');
  // video poker with the hint applied
  // stand up (after the running hand) before switching to video poker
  await p.evaluate(() => window.PK.leave());
  for (let i = 0; i < 200; i++) {
    if (!(await p.evaluate(() => window.PK.S.seated))) break;
    await p.evaluate(() => { if (window.PK.pending) window.PK.act('fold'); });
    await wait(150);
  }
  await wait(800);
  await p.click('#tab-vp'); await wait(800);
  await p.click('#vp-deal'); await wait(1800);
  await p.click('#vp-hint'); await wait(3500);
  await shot(p, 'video-poker');
  await p.context().close();
}

// phones: three portrait shots side by side
const phones = [];
{ const p = await open('/blackjack.html?debug&lang=en', PHONE, 2); await start(p);
  await p.click('.chip[data-d="100"]'); await wait(600); await p.click('#btn-deal'); await wait(3500);
  if (await p.isVisible('#btn-ins-no')) { await p.click('#btn-ins-no'); await wait(1500); }
  phones.push(await shot(p, 'phone-blackjack')); await p.context().close(); }
{ const p = await open('/poker.html?debug&lang=en', PHONE, 2); await start(p); await pokerHand(p, 3);
  phones.push(await shot(p, 'phone-poker')); await p.context().close(); }
{ const p = await open('/krakens-hoard.html?lang=en', PHONE, 2); await start(p); await wait(2500);
  await p.click('#spin'); await wait(3500); await p.click('#spin'); await wait(1600);
  phones.push(await shot(p, 'phone-krakens-hoard')); await p.context().close(); }

// strip: 3 phones with a gap on a dark background
const w = PHONE.width * 2, h = PHONE.height * 2, gap = 60;
const joined = await sharp({ create: { width: w * 3 + gap * 4, height: h + gap * 2, channels: 3, background: '#0b1016' } })
  .composite(phones.map((buf, i) => ({ input: buf, left: gap + i * (w + gap), top: gap })))
  .png().toBuffer();
await sharp(joined)
  .resize({ width: 1600 })
  .webp({ quality: 86 })
  .toFile(`${OUT}/phones.webp`);
console.log('saved phones');
for (const n of ['phone-blackjack', 'phone-poker', 'phone-krakens-hoard']) fs.rmSync(`${OUT}/${n}.webp`);

await browser.close();
