// Records short slot animations for the README (animated WebP, plays like a GIF on GitHub).
// The game ticker is paused and stepped frame by frame, so every clip plays at true speed.
// Usage: npm run dev, then node scripts/record.js
import fs from 'node:fs';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5190';
const OUT = 'docs/screenshots';
const FPS = 20, STEP = 1000 / FPS, WIDTH = 960;
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  await page.goto(BASE + path);
  await page.waitForSelector('#load-start:not([hidden])', { timeout: 30000 });
  await wait(400);
  await page.click('#load-start');
  await wait(3000);
  return page;
}

// step the game `seconds` long, grabbing one frame per step; `during(t)` may trigger actions
async function capture(page, G, seconds, during = async () => {}) {
  await page.evaluate((g) => window[g].app.ticker.stop(), G);
  const frames = [];
  for (let i = 0; i < seconds * FPS; i++) {
    await during(i / FPS);
    await page.evaluate(([g, ms]) => window[g].run(ms, ms / 3), [G, STEP]);
    frames.push(await sharp(await page.screenshot({ type: 'jpeg', quality: 92 })).resize({ width: WIDTH }).raw().toBuffer({ resolveWithObject: true }));
  }
  await page.evaluate((g) => window[g].app.ticker.start(), G);
  return frames;
}

async function save(frames, name) {
  const { info } = frames[0];
  const strip = Buffer.concat(frames.map((f) => f.data));
  await sharp(strip, { raw: { width: info.width, height: info.height * frames.length, channels: info.channels, pageHeight: info.height } })
    .webp({ quality: 72, effort: 5, loop: 0, delay: Array(frames.length).fill(STEP) })
    .toFile(`${OUT}/${name}.webp`);
  console.log('saved', name, `${frames.length} frames`, `${Math.round(fs.statSync(`${OUT}/${name}.webp`).size / 1024)} KB`);
}

const busy = (p) => p.evaluate(() => document.body.classList.contains('busy'));

const only = process.argv[2];

// Kraken's Hoard: a run of base spins with tumbles and plank blasts
if (!only || only === 'kraken') {
  const p = await open('/krakens-hoard.html?debug&lang=en');
  const frames = await capture(p, 'KH', 12, async () => { if (!(await busy(p))) await p.evaluate(() => document.getElementById('spin').click()); });
  await save(frames, 'krakens-hoard-anim');
  await p.context().close();
}

// Haze Kings 420: the Cloud 9 bonus, which starts with a lit Hotbox (a real random round)
if (!only || only === 'haze') {
  const p = await open('/haze-kings.html?debug&lang=en');
  await p.evaluate(() => { window.HK.buyFeature('cloud9'); });
  const frames = await capture(p, 'HK', 16);
  await save(frames, 'haze-kings-anim');
  await p.context().close();
}
await browser.close();
