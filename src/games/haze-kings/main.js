import { Application, Assets, Container, Sprite, Graphics, Texture } from 'pixi.js';
import { guardRenderGroups } from '../../shared/pixi-guard.js';
import { Motion, ease } from '../../shared/motion.js';
import './i18n.js';
import { t, locale } from '../../shared/i18n.js';
import { wallet, money } from '../../shared/wallet.js';
import * as M from './math.js';
import { sfx, play, loop, stopLoop } from './sfx.js';
import { makeTextures, GoldText } from './textures.js';

// ---------------------------------------------------------------- layout
// Grid is fixed 7x7 (no growing board like Kraken's Hoard) – geometry is static.
const W = 1920, H = 1080;
const FRAME_SCALE = 0.74;
// frame.webp (1536x1536): transparent square opening, measured with scripts/import-haze-kings.js.
const FR = { openL: 266, openR: 1271, openT: 342, openB: 1233 };
const frameW = 1536 * FRAME_SCALE;
const frameX = (W - frameW) / 2, frameY = 0;
// visible part of frame.webp (outer glow trimmed): used as tight layout bounds
const FRAME_VIS = { t: 40 * FRAME_SCALE, b: 1460 * FRAME_SCALE, l: 60 * FRAME_SCALE, r: 1476 * FRAME_SCALE };
const GX = frameX + FR.openL * FRAME_SCALE, GY = frameY + FR.openT * FRAME_SCALE;
const GW = (FR.openR - FR.openL) * FRAME_SCALE, GH = (FR.openB - FR.openT) * FRAME_SCALE;
const CELL_W = GW / M.SIZE, CELL_H = GH / M.SIZE;
const cx = (c) => GX + c * CELL_W + CELL_W / 2;
const cy = (r) => GY + r * CELL_H + CELL_H / 2;
const BB = GY + GH; // board bottom
const BASE = '/assets/haze-kings/';
const BETS = [0.2, 0.4, 0.6, 1, 2, 4, 5, 10, 20, 50, 100];
// Lucky Lighter: measured with scripts/sim-haze-lighter.js – one boosted spin returns 3.09x bet on
// average; the player also pays the normal bet for that spin, so 98 % needs 3.09 / 0.98 − 1 ≈ 2.15x.
const LIGHTER_PRICE = 2.15;
const TIERS = [['big', 15], ['mega', 30], ['epic', 50], ['legendary', 200]];
const HOTBOX_COLOR = (v) => (v >= 64 ? 0xffffff : v >= 16 ? 0xb24bff : v >= 8 ? 0xffd23c : 0x7dff5a); // green → gold → purple → white (max x64)

const SYM_LIST = M.PAYING.concat(['wild', 'scatter']);
const IMAGES = [
  ...SYM_LIST.map((s) => `sym_${s}`), 'bg_main', 'bg_freespins', 'frame', 'logo',
  'fs_intro', 'super_fs_intro', 'bonus_buy', 'multiplier_frame', 'lighter_big',
  'win_big', 'win_mega', 'win_epic', 'win_legendary',
];

// ---------------------------------------------------------------- state
const S = {
  bet: Number(localStorage.getItem('hk.bet')) || 1,
  busy: false,
  turbo: localStorage.getItem('hk.turbo') === '1',
  auto: 0,
  fs: null, // { left, played, total, hotbox, cloud9 }
  grid: null,
  hotbox: new Array(M.SIZE * M.SIZE).fill(0),
  slam: false,
  ledger: [], // { bet, win, balance } per paid spin – audited in debug mode
  luckyLighter: 0, // remaining spins with doubled scatter chance (bought)
};
if (!BETS.includes(S.bet)) S.bet = 1;

const cents = (v) => Math.round(v * 100) / 100;
const $ = (id) => document.getElementById(id);

// ?embed=1: hosted inside the in-game phone – hide the lobby link, never go fullscreen
const params = new URLSearchParams(location.search);
const embedded = params.get('embed') === '1' || window.self !== window.top;
if (params.get('embed') === '1') document.body.classList.add('embedded');

let app, motion, TX, TEX, world, bgMain, bgFree, hotboxLayer, symLayer, glowLayer, fxLayer, hud, overlay, frame;
let cells = []; // [r*7+c] = Container | null
let shake = { amp: 0, t: 0, ms: 1 };

boot();

async function boot() {
  const bar = $('load-bar');
  await Promise.all(['900 40px Montserrat', '800 20px Montserrat'].map((f) => document.fonts.load(f).catch(() => {})));
  IMAGES.forEach((n) => Assets.add({ alias: n, src: `${BASE}${n}.webp` }));
  TEX = await Assets.load(IMAGES, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  $('load-text').textContent = t('load.ready');
  $('load-start').hidden = false;
  $('load-start').onclick = async () => {
    if (!embedded && matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    await sfx.unlock();
    play('click');
    $('loader').classList.add('gone');
    setTimeout(() => $('loader').remove(), 900);
    await start();
  };
}

async function start() {
  app = new Application();
  await app.init({ resizeTo: $('stage'), antialias: true, backgroundColor: 0x05130a, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  guardRenderGroups(app);
  $('stage').appendChild(app.canvas);
  motion = new Motion(app.ticker);
  motion.speed = S.turbo ? 1.9 : 1;
  TX = makeTextures();
  buildScene();
  buildUI();
  app.renderer.on('resize', layout);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', () => {
    if (overlay.children.length || !$('paytable').hidden || !$('buymenu').hidden) return;
    if (S.busy) slam();
    else spinOnce();
  });
  layout();
  app.ticker.add(tick);
  loop('music');

  if (params.has('debug')) window.HK = {
    audit(start) {
      const bets = S.ledger.reduce((a, l) => a + l.bet, 0), wins = S.ledger.reduce((a, l) => a + l.win, 0);
      const expected = Math.round((start - bets + wins) * 100) / 100;
      return { spins: S.ledger.length, bets, wins: Math.round(wins * 100) / 100, expected, balance: wallet.balance, ok: Math.abs(expected - wallet.balance) < 0.011 };
    },
    S, M, freeSpins, maybeBigWin, presentWin, creditWin, spinOnce, buyFeature, motion, world, app, wallet, get cells() { return cells; },
    async run(ms, step = 16) {
      let t = performance.now();
      for (let i = 0; i < ms / step; i++) {
        t += step;
        app.ticker.update(t);
        for (let k = 0; k < 4; k++) await Promise.resolve();
      }
    },
  };

  S.busy = true;
  world.alpha = 0;
  motion.tween(world, { alpha: 1 }, 700);
  S.grid = M.freshGrid(Math.random);
  await dropIn(S.grid, false);
  S.busy = false;
}

// ---------------------------------------------------------------- scene
function buildScene() {
  const bgLayer = new Container();
  app.stage.addChild(bgLayer);
  bgMain = new Sprite(TEX.bg_main);
  bgFree = new Sprite(TEX.bg_freespins);
  bgFree.alpha = 0;
  const vignette = new Sprite(TX.vignette);
  bgLayer.addChild(bgMain, bgFree, vignette);
  bgLayer.vignette = vignette;
  app.stage.bgLayer = bgLayer;

  world = new Container();
  app.stage.addChild(world);
  world.ambient = new Container();
  world.addChild(world.ambient);

  const back = new Graphics();
  back.roundRect(GX - 6, GY - 6, GW + 12, GH + 12, 14).fill({ color: 0x030d06, alpha: 0.78 });
  for (let c = 1; c < M.SIZE; c++) back.rect(GX + c * CELL_W - 1, GY, 2, GH).fill({ color: 0x3aff8a, alpha: 0.08 });
  for (let r = 1; r < M.SIZE; r++) back.rect(GX, GY + r * CELL_H - 1, GW, 2).fill({ color: 0x3aff8a, alpha: 0.08 });
  world.addChild(back);

  const gridBox = new Container();
  const mask = new Graphics().rect(GX - 4, GY - 4, GW + 8, GH + 8).fill(0xffffff);
  gridBox.mask = mask;
  hotboxLayer = new Container();
  glowLayer = new Container();
  symLayer = new Container();
  gridBox.addChild(hotboxLayer, glowLayer, symLayer);
  world.addChild(gridBox, mask);

  frame = new Sprite(TEX.frame);
  frame.scale.set(FRAME_SCALE);
  frame.position.set(frameX, frameY);
  world.addChild(frame);

  fxLayer = new Container();
  world.addChild(fxLayer);
  hud = new Container();
  world.addChild(hud);
  buildHud();

  overlay = new Container();
  app.stage.addChild(overlay);

  cells = new Array(M.SIZE * M.SIZE).fill(null);
  for (let i = 0; i < M.SIZE * M.SIZE; i++) hotboxSlots.push(null);
}

function buildHud() {
  const logo = new Sprite(TEX.logo);
  logo.anchor.set(0.5);
  logo.scale.set(420 / logo.texture.width);
  logo.position.set(300, 220);
  hud.addChild(logo);
  hud.logo = logo;

  const maxLbl = new GoldText(420, 60, 24, { palette: 'white', glow: 'rgba(125,255,90,.5)', stroke: '#031a0c' });
  maxLbl.text = t('hk.maxWin', { x: M.MAX_WIN_X.toLocaleString(locale) });
  maxLbl.position.set(1600, 90);
  hud.addChild(maxLbl);
  hud.maxLbl = maxLbl;

  const tw = new GoldText(460, 110, 60);
  tw.position.set(1600, 210);
  tw.alpha = 0;
  const twl = new GoldText(420, 60, 26, { palette: 'white', glow: 'rgba(210,130,255,.6)', stroke: '#1a0326' });
  twl.text = t('hk.win');
  twl.position.set(1600, 155);
  twl.alpha = 0;
  hud.addChild(twl, tw);
  hud.tumble = tw;
  hud.tumbleLbl = twl;

  const fs = new Container();
  fs.position.set(300, 480);
  fs.alpha = 0;
  const fsl = new GoldText(420, 60, 28, { palette: 'white', glow: 'rgba(178,75,255,.6)', stroke: '#1a0326' });
  fsl.text = t('hk.freeSpins');
  fsl.y = -50;
  const fsc = new GoldText(420, 100, 60);
  fs.addChild(fsl, fsc);
  hud.addChild(fs);
  Object.assign(hud, { fs, fsCount: fsc });
}

const BB_ = () => BB;
const LAYOUTS = {
  // Bounds hug the visible frame (no dead space above it, nothing hidden behind the bar) plus
  // two side columns for logo / win info – the machine gets every pixel of height available.
  landscape: () => {
    const top = frameY + FRAME_VIS.t, bottom = frameY + FRAME_VIS.b;
    const left = frameX + FRAME_VIS.l, right = frameX + FRAME_VIS.r;
    const col = 380;
    return {
      bounds: { x: left - col, y: top, w: right - left + col * 2, h: bottom - top },
      logo: [left - col / 2, top + 150, 340], maxLbl: [right + col / 2, top + 60],
      tumbleLbl: [right + col / 2, top + 170], tumble: [right + col / 2, top + 235], fs: [left - col / 2, top + 420],
      hudScale: 1, portrait: false,
    };
  },
  portrait: () => ({
    bounds: { x: GX - 60, y: frameY - 190, w: GW + 120, h: (frameY + frameW) + 320 - (frameY - 190) },
    logo: [GX + GW / 2, frameY - 110, 300], maxLbl: [GX + GW / 2, frameY + frameW + 60],
    tumbleLbl: [GX + GW / 2, frameY + frameW + 140], tumble: [GX + GW / 2, frameY + frameW + 195],
    fs: [GX + GW / 2, frameY - 110], hudScale: 1, portrait: true,
  }),
};

let portrait = false;
function applyHudLayout(L) {
  portrait = L.portrait;
  hud.logo.scale.set(L.logo[2] / hud.logo.texture.width);
  hud.logo.position.set(L.logo[0], L.logo[1]);
  hud.maxLbl.position.set(...L.maxLbl);
  hud.maxLbl.visible = !portrait;
  hud.tumbleLbl.position.set(...L.tumbleLbl);
  hud.tumble.position.set(...L.tumble);
  hud.fs.position.set(...L.fs);
  hud.fs.visible = !(portrait && !S.fs) || !!S.fs;
}

function layout() {
  const sw = app.screen.width, sh = app.screen.height;
  const L = (sw / sh < 0.95 ? LAYOUTS.portrait : LAYOUTS.landscape)();
  applyHudLayout(L);
  const b = L.bounds;
  const s = Math.min(sw / b.w, sh / b.h);
  world.scale.set(s);
  world.position.set((sw - b.w * s) / 2 - b.x * s, (sh - b.h * s) / 2 - b.y * s);
  world.base = { x: world.x, y: world.y };
  for (const bg of [bgMain, bgFree]) {
    const k = Math.max(sw / bg.texture.width, sh / bg.texture.height) * 1.04;
    bg.scale.set(k);
    bg.position.set((sw - bg.texture.width * k) / 2, (sh - bg.texture.height * k) / 2);
  }
  const v = app.stage.bgLayer.vignette;
  v.width = sw;
  v.height = sh;
  overlay.children.forEach((ch) => ch.onResize?.());
}

// ---------------------------------------------------------------- per-frame
let ambientT = 0;
function tick(tk) {
  const dt = tk.deltaMS;
  if (shake.t > 0) {
    shake.t -= dt;
    const k = Math.max(shake.t / shake.ms, 0) * shake.amp * world.scale.x;
    world.x = world.base.x + (Math.random() - 0.5) * k * 2;
    world.y = world.base.y + (Math.random() - 0.5) * k * 2;
  } else if (world.base) {
    world.x = world.base.x;
    world.y = world.base.y;
  }
  const t = performance.now() / 1000;
  hud.logo.y = (portrait ? frameY - 70 : 220) + Math.sin(t * 1.1) * 6;
  ambientT += dt;
  if (ambientT > 900) {
    ambientT = 0;
    motion.emit({ texture: TX.smoke, parent: world.ambient, x: GX + Math.random() * GW, y: BB + 20, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20, life: 6000, scale: 0.6 + Math.random() * 0.8, endScale: 1.6, alpha: 0.18, blend: 'add' });
  }
}

function doShake(amp, ms) {
  shake = { amp, ms, t: ms };
  if (amp >= 10) navigator.vibrate?.(Math.min(ms / 4, 120));
}

// ---------------------------------------------------------------- hotbox tiles
const hotboxSlots = [];
function setHotbox(p, v) {
  const r = Math.floor(p / M.SIZE), c = p % M.SIZE;
  let slot = hotboxSlots[p];
  if (v <= 0) {
    if (slot) { motion.tween(slot, { alpha: 0 }, 250).then(() => slot.destroy()); hotboxSlots[p] = null; }
    return;
  }
  if (!slot) {
    slot = new Container();
    slot.position.set(cx(c), cy(r));
    const img = new Sprite(TEX.multiplier_frame);
    img.anchor.set(0.5);
    img.scale.set((Math.min(CELL_W, CELL_H) * 0.98) / img.texture.width);
    const t = new GoldText(220, 100, 34, { palette: 'white', glow: 'rgba(255,255,255,.9)', stroke: '#031a0c' });
    slot.addChild(img, t);
    slot.img = img;
    slot.t = t;
    slot.alpha = 0;
    hotboxLayer.addChild(slot);
    hotboxSlots[p] = slot;
    motion.tween(slot, { alpha: 1 }, 200);
  }
  slot.img.tint = v < 0 ? 0x88a8ff : HOTBOX_COLOR(v);
  slot.t.text = v > 0 ? `x${v}` : '';
  slot.scale.set(1.5);
  motion.tween(slot, { scale: 1 }, 400, ease.outElastic);
}

function applyHotboxSnapshot(hb) {
  for (let p = 0; p < hb.length; p++) setHotbox(p, hb[p]);
}

function clearHotbox() {
  for (let p = 0; p < hotboxSlots.length; p++) if (hotboxSlots[p]) { hotboxSlots[p].destroy(); hotboxSlots[p] = null; }
}

// ---------------------------------------------------------------- cells
function makeCell(sym, p) {
  const r = Math.floor(p / M.SIZE), c = p % M.SIZE;
  const box = new Container();
  const s = new Sprite(TEX[`sym_${sym}`]);
  s.anchor.set(0.5);
  const k = (Math.min(CELL_W, CELL_H) * 0.92) / Math.max(s.texture.width, s.texture.height);
  s.scale.set(k);
  box.addChild(s);
  box.sprite = s;
  box.sym = sym;
  box.p = p;
  box.position.set(cx(c), cy(r));
  symLayer.addChild(box);
  return box;
}

function setSym(box, sym) {
  box.sym = sym;
  box.sprite.texture = TEX[`sym_${sym}`];
  box.sprite.scale.set((Math.min(CELL_W, CELL_H) * 0.92) / Math.max(box.sprite.texture.width, box.sprite.texture.height));
}

const allCells = () => cells.filter(Boolean);

async function dropOut() {
  const old = cells.filter(Boolean);
  cells = new Array(M.SIZE * M.SIZE).fill(null);
  await Promise.all(old.map((box) =>
    motion.tween(box, { y: box.y + GH + 200 }, 300, ease.inQuad, (box.p % M.SIZE) * 30)
      .then(() => box.destroy())));
}

async function dropIn(grid, withAnticipation = true) {
  let scatters = 0, antic = null;
  const jobs = [];
  for (let c = 0; c < M.SIZE; c++) {
    let colScatter = false;
    for (let r = 0; r < M.SIZE; r++) {
      const p = r * M.SIZE + c;
      const box = makeCell(grid[p], p);
      cells[p] = box;
      const y = box.y;
      box.y = y - (M.SIZE + 1) * CELL_H - 60;
      jobs.push(motion.tween(box, { y }, 340, (t) => ease.outBack(t, 1.1), c * 55 + r * 16));
      if (grid[p] === 'scatter') colScatter = true;
    }
    if (colScatter && withAnticipation && scatters >= 2 && !S.slam) { if (!antic) antic = play('anticipation'); }
    const step = scatters;
    jobs.push(motion.wait(c * 55 + 260).then(() => { play('land', { rate: 1 + c * 0.03 }); if (colScatter) play('scatterLand', { step }); }));
    if (colScatter) scatters++;
  }
  await Promise.all(jobs);
  antic?.stop();
}

function glowAt(p, tint, ms) {
  const r = Math.floor(p / M.SIZE), c = p % M.SIZE;
  const g = new Sprite(TX.glow);
  g.anchor.set(0.5);
  g.position.set(cx(c), cy(r));
  g.tint = tint;
  g.blendMode = 'add';
  g.scale.set(1.5);
  g.alpha = 0;
  glowLayer.addChild(g);
  motion.tween(g, { alpha: 0.9 }, 150).then(() => motion.tween(g, { alpha: 0 }, ms)).then(() => g.destroy());
  return g;
}

// ---------------------------------------------------------------- pre-spin events
async function playBlaze(step) {
  play('blaze');
  const lighter = new Sprite(TEX.lighter_big);
  lighter.anchor.set(0.5);
  const k = (Math.min(GW, GH) * 0.5) / lighter.texture.width;
  lighter.scale.set(k);
  const isRow = step.isRow, n = step.n;
  const from = isRow ? { x: GX - 60, y: cy(n) } : { x: cx(n), y: GY - 60 };
  const to = isRow ? { x: GX + GW + 60, y: cy(n) } : { x: cx(n), y: GY + GH + 60 };
  lighter.position.set(from.x, from.y);
  lighter.alpha = 0;
  fxLayer.addChild(lighter);
  doShake(6, 400);
  await motion.tween(lighter, { alpha: 1 }, 150);
  await motion.tween(lighter, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 350, ease.outQuad);
  for (const p of step.cells) {
    const box = cells[p];
    for (let k2 = 0; k2 < 6; k2++) motion.emit({ texture: TX.spark, parent: fxLayer, x: box.x, y: box.y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 500, scale: 1.1, endScale: 0.1, tint: 0xff8a3c, blend: 'add' });
    motion.tween(box, { scale: 1.4 }, 90, ease.outQuad).then(() => motion.tween(box, { scale: 0.01 }, 120, ease.inQuad)).then(() => setSym(box, step.sym));
    motion.wait(210).then(() => { box.scale.set(1.5); motion.tween(box, { scale: 1 }, 260, (t) => ease.outBack(t, 2)); });
  }
  await motion.tween(lighter, { x: to.x, y: to.y }, 350, ease.inQuad);
  await motion.tween(lighter, { alpha: 0 }, 200);
  lighter.destroy();
  await motion.wait(200);
}

// ---------------------------------------------------------------- win / tumble
async function showWin(step) {
  const win = new Set(step.cells);
  const level = Math.floor(Math.log2(1 + step.x * 4));
  play('win', { level });
  for (const box of allCells()) if (!win.has(box.p)) motion.tween(box, { alpha: 0.4 }, 180);
  for (const p of step.cells) {
    glowAt(p, 0x7dff5a, 900);
    const box = cells[p];
    motion.tween(box, { scale: 1.2 }, 180, ease.outQuad)
      .then(() => motion.tween(box, { scale: 1 }, 220, ease.inOutCubic))
      .then(() => motion.tween(box, { scale: 1.14 }, 180, ease.outQuad))
      .then(() => motion.tween(box, { scale: 1 }, 220, ease.inOutCubic));
  }
  applyHotboxSnapshot(step.hotbox);

  const amt = step.x * S.bet;
  const [sx, sy] = step.cells.reduce((a, p) => [a[0] + cx(p % M.SIZE), a[1] + cy(Math.floor(p / M.SIZE))], [0, 0]);
  const ft = new GoldText(420, 90, 50);
  ft.text = money(amt);
  ft.position.set(sx / step.cells.length, sy / step.cells.length);
  ft.scale.set(0.3);
  fxLayer.addChild(ft);
  motion.tween(ft, { scale: 1 }, 400, ease.outBack)
    .then(() => motion.tween(ft, { y: ft.y - 70, alpha: 0 }, 700, ease.inQuad, 350))
    .then(() => ft.destroy());

  const total = (S.fs ? S.fs.total : 0) + step.total * S.bet;
  hud.tumble.text = money(total);
  motion.tween(hud.tumble, { alpha: 1 }, 200);
  motion.tween(hud.tumbleLbl, { alpha: 1 }, 200);
  hud.tumble.scale.set(1.25);
  motion.tween(hud.tumble, { scale: 1 }, 450, ease.outElastic);
  setWinDisplay(total);

  await motion.wait(850);
}

async function doTumble(step) {
  play('explode');
  const boom = step.removed.map(async (p) => {
    const box = cells[p];
    if (!box) return;
    cells[p] = null;
    for (let k = 0; k < 6; k++) motion.emit({ texture: TX.spark, parent: fxLayer, x: box.x, y: box.y, vx: (Math.random() - 0.5) * 500, vy: (Math.random() - 0.5) * 500 - 80, gravity: 500, drag: 0.94, life: 600, scale: 1.2, endScale: 0.2, tint: 0x9dff7a, blend: 'add' });
    const ring = new Sprite(TX.ring);
    ring.anchor.set(0.5);
    ring.position.set(box.x, box.y);
    ring.tint = 0x7dff5a;
    ring.blendMode = 'add';
    ring.scale.set(0.2);
    ring.alpha = 0.9;
    fxLayer.addChild(ring);
    motion.tween(ring, { alpha: 0 }, 450);
    motion.tween(ring, { scale: 1.4 }, 450, ease.outCubic).then(() => ring.destroy());
    await motion.tween(box, { scale: 1.25 }, 80, ease.outQuad);
    await motion.tween(box, { scale: 0, alpha: 0 }, 150, ease.inQuad);
    box.destroy();
  });
  await Promise.all(boom);
  allCells().forEach((b) => motion.tween(b, { alpha: 1 }, 150));

  // grinder-wild: ground cells flash and turn wild in place
  if (step.ground?.length) {
    play('grind');
    for (const p of step.ground) {
      const box = cells[p];
      if (!box) continue;
      const ring = glowAt(p, 0xffd23c, 500);
      motion.tween(ring, { scale: 2.2 }, 500, ease.outCubic);
      motion.tween(box, { scale: 0.2 }, 90, ease.inQuad).then(() => { setSym(box, 'wild'); box.scale.set(1.4); motion.tween(box, { scale: 1 }, 280, (t) => ease.outBack(t, 2)); });
    }
    doShake(6, 250);
  }

  const next = new Array(M.SIZE * M.SIZE).fill(null);
  for (let p = 0; p < M.SIZE * M.SIZE; p++) if (cells[p]) next[p] = cells[p];
  const jobs = [];
  for (const mv of step.moves) {
    const box = cells[mv.from * M.SIZE + mv.c];
    if (!box) continue;
    const fromP = mv.from * M.SIZE + mv.c, toP = mv.to * M.SIZE + mv.c;
    if (next[fromP] === box) next[fromP] = null;
    next[toP] = box;
    box.p = toP;
    jobs.push(motion.tween(box, { y: cy(mv.to) }, 280, (t) => ease.outBack(t, 1.2), mv.c * 30));
  }
  const freshCount = {};
  for (const f of step.fresh) {
    const p = f.r * M.SIZE + f.c;
    const box = makeCell(f.sym, p);
    next[p] = box;
    const n = (freshCount[f.c] = (freshCount[f.c] ?? 0) + 1);
    box.y = GY - n * CELL_H - 40;
    jobs.push(motion.tween(box, { y: cy(f.r) }, 340, (t) => ease.outBack(t, 1.1), 100 + f.c * 30));
  }
  cells = next;
  jobs.push(motion.wait(380).then(() => play('land', { rate: 1.1 })));
  await Promise.all(jobs);
}

async function scatterCelebrate(step) {
  for (const box of allCells()) if (box.sym === 'scatter') {
    glowAt(box.p, 0xffd23c, 700);
    box.scale.set(1.25);
    motion.tween(box, { scale: 1 }, 500, ease.outElastic);
  }
  play('scatterLand', { step: 4 });
  await motion.wait(1200);
}

// ---------------------------------------------------------------- flow
async function playSpin(res) {
  S.slam = false;
  hideTumble();
  await dropOut();
  // the hotbox now survives between winning spins – only redraw it, don't wipe it
  const steps = res.steps;
  const dropStep = steps.find((s) => s.t === 'drop');
  S.grid = dropStep.grid;
  await dropIn(dropStep.grid);
  applyHotboxSnapshot(dropStep.hotbox);
  for (const step of steps) {
    if (step.t === 'blaze') await playBlaze(step);
    else if (step.t === 'bigsmoke') await playBigSmokeDirect(step);
    else if (step.t === 'win') await showWin(step);
    else if (step.t === 'tumble') await doTumble(step);
    else if (step.t === 'scatter') await scatterCelebrate(step);
    else if (step.t === 'hotboxClear') await hotboxBurnsOut();
  }
}

// dead spin in the base game: the hotbox smoke drifts away and the multipliers are gone
async function hotboxBurnsOut() {
  play('puff');
  const kids = [...hotboxLayer.children];
  for (const k of kids) {
    for (let n = 0; n < 2; n++) motion.emit({ texture: TX.smoke, parent: fxLayer, x: k.x, y: k.y, vx: (Math.random() - 0.5) * 40, vy: -50, life: 800, scale: 0.6, endScale: 1.6, alpha: 0.4, blend: 'add' });
  }
  const msg = new GoldText(700, 80, 38, { palette: 'white', glow: 'rgba(150,255,150,.5)', stroke: '#031a0c' });
  msg.text = t('hk.hotboxOut');
  msg.position.set(GX + GW / 2, GY + GH / 2);
  msg.alpha = 0;
  fxLayer.addChild(msg);
  motion.tween(msg, { alpha: 1 }, 200);
  await Promise.all(kids.map((k) => motion.tween(k, { alpha: 0 }, 500)));
  clearHotbox();
  await motion.tween(msg, { alpha: 0, y: msg.y - 40 }, 600, ease.inQuad, 300);
  msg.destroy();
}

async function playBigSmokeDirect(step) {
  play('bigsmoke');
  for (const p of step.cells) {
    const r = Math.floor(p / M.SIZE), c = p % M.SIZE;
    for (let k = 0; k < 4; k++) motion.emit({ texture: TX.smoke, parent: fxLayer, x: cx(c), y: cy(r), vx: (Math.random() - 0.5) * 60, vy: -30, life: 900, scale: 1, endScale: 2.2, alpha: 0.5, blend: 'add' });
  }
  doShake(4, 300);
  await motion.wait(500);
}

async function safePlay(res) {
  try {
    await playSpin(res);
  } catch (err) {
    console.error('[haze-kings] animation failed, recovering', err);
    const last = [...res.steps].reverse().find((s) => s.grid);
    cells.forEach((b) => b?.destroy());
    cells = new Array(M.SIZE * M.SIZE).fill(null);
    for (let p = 0; p < M.SIZE * M.SIZE; p++) cells[p] = makeCell(last.grid[p], p);
    S.grid = last.grid;
    motion.speed = S.turbo ? 1.9 : 1;
  }
}

function hideTumble() {
  motion.tween(hud.tumble, { alpha: 0 }, 200);
  motion.tween(hud.tumbleLbl, { alpha: 0 }, 200);
}

function slam() {
  if (S.slam) return;
  S.slam = true;
  motion.speed = Math.max(motion.speed, 4);
}

async function spinOnce() {
  if (S.busy) { slam(); return; }
  if (!wallet.take(S.bet)) { noFunds(); return; }
  S.busy = true;
  setBusy(true);
  setWinDisplay(0);
  play('spin');
  const bet = S.bet;
  const scatterBoost = S.luckyLighter > 0 ? 2 : 1;
  if (S.luckyLighter > 0) S.luckyLighter--;
  // base hotbox carries over while the player keeps winning (cleared by a dead spin in math.js)
  const res = M.spin({ free: false, scatterBoost, hotbox: S.hotbox }, Math.random);
  S.hotbox = res.hotbox;
  await safePlay(res);
  const win = cents(res.x * bet);
  let fsWin = 0, credited = false;
  // presentation/credit/free-spins can never be allowed to skip the ledger entry or leave the
  // game stuck busy – if an animation step throws, still settle the books and recover.
  try {
    if (win > 0) { await presentWin(res.x, win); await creditWin(win); credited = true; }
    if (res.award) fsWin = await freeSpins(res.award, res.cloud9);
  } catch (err) {
    console.error('[haze-kings] post-spin presentation failed, crediting anyway', err);
    if (win > 0 && !credited) wallet.add(win);
  } finally {
    S.ledger.push({ bet, win: win + fsWin, balance: wallet.balance });
    motion.speed = S.turbo ? 1.9 : 1;
    S.busy = false;
    setBusy(false);
  }
  if (S.auto > 0) {
    S.auto--;
    updateAuto();
    if (wallet.balance >= S.bet) setTimeout(spinOnce, 250);
    else { S.auto = 0; updateAuto(); }
  }
}

async function freeSpins(award, cloud9) {
  S.fs = { left: award, played: 0, total: 0, hotbox: cloud9 ? M.makeCloud9Hotbox(Math.random) : new Array(M.SIZE * M.SIZE).fill(0), cloud9 };
  document.body.classList.add('fs');
  stopLoop('music', 1.2);
  loop('musicBonus');
  await banner(cloud9 ? t('hk.cloud9') : t('hk.fsAward', { n: award }), cloud9 ? t('hk.cloud9Sub', { n: M.CLOUD9_SEED_CELLS }) : t('hk.fsSub'), cloud9 ? 'cloud9' : 'fsStart', cloud9 ? TEX.super_fs_intro : TEX.fs_intro);
  motion.tween(bgFree, { alpha: 1 }, 1200);
  hud.fsCount.text = `0 / ${award}`;
  motion.tween(hud.fs, { alpha: 1 }, 500);
  hud.fs.visible = true;
  applyHotboxSnapshot(S.fs.hotbox);

  while (S.fs.left > 0) {
    S.fs.left--;
    S.fs.played++;
    hud.fsCount.text = `${S.fs.played} / ${S.fs.played + S.fs.left}`;
    motion.speed = S.turbo ? 1.9 : 1;
    const res = M.spin({ free: true, hotbox: S.fs.hotbox }, Math.random);
    play('spin');
    await safePlay(res);
    S.fs.hotbox = res.hotbox;
    S.fs.total = cents(S.fs.total + res.x * S.bet);
    if (S.fs.total >= M.MAX_WIN_X * S.bet) { S.fs.total = M.MAX_WIN_X * S.bet; S.fs.left = 0; }
    if (res.award) { S.fs.left += res.award; await banner(t('hk.fsRetrigger', { n: res.award }), null, 'tierUp'); }
    await motion.wait(300);
  }

  const total = S.fs.total, x = total / S.bet;
  if (x >= TIERS[0][1]) await maybeBigWin(x, total);
  else await banner(money(total), t('hk.fsResult', { n: S.fs.played }), 'win');
  if (total > 0) await creditWin(total);
  S.fs = null;
  document.body.classList.remove('fs');
  stopLoop('musicBonus', 1.5);
  loop('music');
  clearHotbox();
  motion.tween(bgFree, { alpha: 0 }, 1200);
  motion.tween(hud.fs, { alpha: 0 }, 500).then(() => (hud.fs.visible = false));
  hideTumble();

  await dropOut();
  S.grid = M.freshGrid(Math.random);
  await dropIn(S.grid, false);
  return total;
}

// ---------------------------------------------------------------- overlays
function dimmer() {
  const d = new Sprite(Texture.WHITE);
  d.tint = 0x000000;
  d.alpha = 0;
  d.eventMode = 'static';
  d.cursor = 'pointer';
  d.onResize = () => { d.width = app.screen.width; d.height = app.screen.height; };
  d.onResize();
  overlay.addChild(d);
  return d;
}

function centerBox() {
  const box = new Container();
  box.onResize = () => {
    const s = world.scale.x;
    box.scale.set(s);
    box.position.set(app.screen.width / 2, app.screen.height / 2);
  };
  box.onResize();
  overlay.addChild(box);
  return box;
}

const clickOnce = (target) => new Promise((res) => target.once('pointertap', res));

async function banner(title, sub, sound, art) {
  play(sound);
  const d = dimmer();
  const box = centerBox();
  if (art) {
    const img = new Sprite(art);
    img.anchor.set(0.5);
    img.scale.set(760 / img.texture.width);
    img.y = -30;
    box.addChild(img);
  } else {
    const t = new GoldText(1400, 220, 110);
    t.text = title;
    box.addChild(t);
  }
  if (sub) {
    const st = new GoldText(1200, 90, 40, { palette: 'white', glow: 'rgba(140,220,255,.7)', stroke: '#031a0c' });
    st.text = sub;
    st.y = art ? 230 : 130;
    box.addChild(st);
  }
  box.alpha = 0;
  box.scale.set(0.3 * world.scale.x);
  motion.tween(d, { alpha: 0.6 }, 300);
  motion.tween(box, { alpha: 1 }, 250);
  await motion.tween(box.children[0], { scale: 1 }, 700, ease.outElastic);
  for (let k = 0; k < 30; k++) motion.emit({ texture: TX.star, parent: box, x: (Math.random() - 0.5) * 900, y: (Math.random() - 0.5) * 180, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 1100, scale: 0.4 + Math.random() * 0.7, endScale: 0, blend: 'add' });
  await Promise.race([motion.wait(1700), clickOnce(d)]);
  motion.tween(d, { alpha: 0 }, 300);
  await motion.tween(box, { alpha: 0 }, 300);
  d.destroy();
  box.destroy({ children: true });
}

async function presentWin(x, amount) {
  if (x >= TIERS[0][1]) return maybeBigWin(x, amount);
  const prev = motion.speed;
  motion.speed = Math.min(prev, 1.9);
  play('win', { level: Math.min(8, Math.floor(Math.log2(1 + x * 4)) + 1) });
  const plate = new Container();
  plate.position.set(GX + GW / 2, (GY + BB) / 2);
  const glow = new Sprite(TX.glow);
  glow.anchor.set(0.5);
  glow.scale.set(7, 2.4);
  glow.tint = 0x000000;
  glow.alpha = 0.7;
  const lbl = new GoldText(600, 70, 32, { palette: 'white', glow: 'rgba(125,255,90,.7)', stroke: '#031a0c' });
  lbl.text = t('hk.totalWin');
  lbl.y = -56;
  const val = new GoldText(700, 150, 90);
  val.text = money(0);
  val.y = 18;
  plate.addChild(glow, lbl, val);
  plate.scale.set(0.4);
  plate.alpha = 0;
  fxLayer.addChild(plate);
  motion.tween(plate, { alpha: 1 }, 150);
  await motion.tween(plate, { scale: 1 }, 380, ease.outBack);
  const counter = { v: 0 };
  const dur = Math.min(400 + x * 100, 1500);
  const iv = setInterval(() => { val.text = money(counter.v); play('tick'); }, 60);
  await motion.tween(counter, { v: amount }, dur, ease.outQuad);
  clearInterval(iv);
  val.text = money(amount);
  val.scale.set(1.2);
  motion.tween(val, { scale: 1 }, 400, ease.outElastic);
  await motion.wait(650);
  await motion.tween(plate, { alpha: 0, scale: 0.85 }, 250);
  plate.destroy({ children: true });
  motion.speed = prev;
}

async function maybeBigWin(x, amount) {
  if (x < TIERS[0][1]) return;
  const reached = TIERS.filter(([, t]) => x >= t);
  const prevSpeed = motion.speed;
  motion.speed = 1;
  play('bigWin');
  // real coin-payout loop runs exactly as long as the counter (file: sfx/coinLoop.mp3)
  const coinLoop = play('coinLoop', { loop: true, vol: 0.55 });
  const d = dimmer();
  const box = centerBox();
  const rays = new Sprite(TX.glow);
  rays.anchor.set(0.5);
  rays.scale.set(9);
  rays.tint = 0x7dff5a;
  rays.blendMode = 'add';
  rays.alpha = 0;
  const logoImg = new Sprite(TEX[`win_${reached[0][0]}`]);
  logoImg.anchor.set(0.5);
  logoImg.y = -110;
  const fit = 820 / logoImg.texture.width;
  logoImg.scale.set(0.1);
  const counter = new GoldText(1100, 180, 110);
  counter.text = money(0);
  counter.y = 240;
  box.addChild(rays, logoImg, counter);
  motion.tween(d, { alpha: 0.72 }, 300);
  motion.tween(rays, { alpha: 0.55 }, 600);
  motion.tween(logoImg, { scale: fit }, 800, ease.outElastic);
  doShake(8, 600);

  let skip = false;
  d.on('pointertap', () => (skip = true));
  const dur = 2200 + reached.length * 2000;
  const t0 = performance.now();
  let tier = 0, coinAcc = 0, lastTick = 0;
  await new Promise((resolve) => {
    const step = (tk) => {
      const k = skip ? 1 : Math.min((performance.now() - t0) / dur, 1);
      const cur = amount * ease.outQuad(k);
      counter.text = money(cur);
      rays.rotation += 0.002 * tk.deltaTime;
      const curX = cur / S.bet;
      if (tier + 1 < reached.length && curX >= reached[tier + 1][1]) {
        tier++;
        logoImg.texture = TEX[`win_${reached[tier][0]}`];
        logoImg.scale.set(fit * 1.5);
        motion.tween(logoImg, { scale: fit }, 600, ease.outElastic);
        play('tierUp');
        doShake(12, 500);
      }
      coinAcc += tk.deltaMS;
      while (coinAcc > 30) {
        coinAcc -= 30;
        motion.emit({ texture: TX.coin, parent: box, x: (Math.random() - 0.5) * 1800, y: -650, vx: (Math.random() - 0.5) * 200, vy: 200 + Math.random() * 300, gravity: 1400, life: 1600, scale: 0.24 + Math.random() * 0.22, spin: (Math.random() - 0.5) * 10 });
      }
      if (!coinLoop && performance.now() - lastTick > 90) { lastTick = performance.now(); play('coin'); play('tick'); }
      if (k >= 1) { app.ticker.remove(step); coinLoop?.stop(0.5); resolve(); }
    };
    app.ticker.add(step);
  });
  counter.scale.set(1.25);
  motion.tween(counter, { scale: 1 }, 600, ease.outElastic);
  play('tierUp');
  skip = false;
  await Promise.race([motion.wait(2400), new Promise((r) => { const iv = setInterval(() => skip && (clearInterval(iv), r()), 50); })]);
  motion.tween(d, { alpha: 0 }, 400);
  await motion.tween(box, { alpha: 0 }, 400);
  d.destroy();
  box.destroy({ children: true });
  motion.speed = prevSpeed;
}

// coins fly from the reels into the balance, then the balance counts up
async function creditWin(amount) {
  setWinDisplay(amount);
  const target = $('balance').getBoundingClientRect();
  const from = world.toGlobal({ x: GX + GW / 2, y: (GY + BB) / 2 });
  const stage = $('stage').getBoundingClientRect();
  const n = Math.min(8 + Math.round(Math.log2(1 + amount / S.bet) * 4), 28);
  const flights = [];
  for (let i = 0; i < n; i++) {
    const coin = document.createElement('div');
    coin.className = 'fly-coin';
    document.body.appendChild(coin);
    const sx = stage.left + from.x + (Math.random() - 0.5) * 160, sy = stage.top + from.y + (Math.random() - 0.5) * 100;
    const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 300, my = Math.min(sy, ty) - 120 - Math.random() * 160;
    const anim = coin.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy - 30}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${mx}px, ${my}px) scale(1.1) rotate(200deg)`, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) scale(.5) rotate(420deg)`, opacity: 0.9 },
    ], { duration: 750 / Math.min(motion.speed, 2), delay: i * 28, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
    const ms = 750 / Math.min(motion.speed, 2) + i * 28;
    flights.push(new Promise((r) => setTimeout(r, ms)).then(() => { anim.cancel(); coin.remove(); if (i % 2 === 0) play('coin'); }));
  }
  await flights[0];
  wallet.add(amount);
  const box = $('balance-box');
  box.classList.remove('credit');
  void box.offsetWidth;
  box.classList.add('credit');
  await Promise.all(flights);
}

// ---------------------------------------------------------------- bonus buy
// Prices are derived from the measured average free-spin value (scripts/sim-haze-kings.js):
// buy price = avg value / 0.96, so the bought feature also returns ~96% RTP.
// measured with scripts/sim-haze-buy.js (20,000 rounds each, 98 % play-money RTP): Munchies 10 spins
// avg 90.2x, Cloud 9 30 spins avg 481.9x  →  /0.98 = 92.0x and 491.7x
let fsPrice = 92, superPrice = 492;
function setBuyPrices(fs, sup) { fsPrice = fs; superPrice = sup; }

async function buyFeature(kind) {
  if (S.busy || S.fs) return;
  const price = kind === 'cloud9' ? superPrice * S.bet : kind === 'lighter' ? LIGHTER_PRICE * S.bet : fsPrice * S.bet;
  if (!wallet.take(price)) { noFunds(); return; }
  play('click');
  if (kind === 'lighter') { S.luckyLighter = 1; S.ledger.push({ bet: price, win: 0, balance: wallet.balance }); return; }
  S.busy = true;
  setBusy(true);
  const award = M.FREE_SPINS_AWARD[kind === 'cloud9' ? 7 : 3]; // exactly what the price was measured for
  const winTotal = await freeSpins(award, kind === 'cloud9');
  S.ledger.push({ bet: price, win: winTotal, balance: wallet.balance });
  S.busy = false;
  setBusy(false);
}

// ---------------------------------------------------------------- DOM UI
function buildUI() {
  let shown = wallet.balance, balAnim = 0;
  wallet.on((b) => {
    cancelAnimationFrame(balAnim);
    if (b <= shown) { shown = b; $('balance').textContent = money(b); return; }
    const from = shown, t0 = performance.now(), dur = 900;
    const f = () => {
      const k = Math.min((performance.now() - t0) / dur, 1);
      shown = from + (b - from) * ease.outCubic(k);
      $('balance').textContent = money(shown);
      if (k < 1) balAnim = requestAnimationFrame(f);
    };
    f();
  });
  $('bet').textContent = money(S.bet);
  $('win').textContent = money(0);
  $('bet-minus').onclick = () => changeBet(-1);
  $('bet-plus').onclick = () => changeBet(1);
  $('spin').onclick = () => { play('click'); spinOnce(); };
  $('turbo').classList.toggle('on', S.turbo);
  $('turbo').onclick = () => {
    S.turbo = !S.turbo;
    localStorage.setItem('hk.turbo', S.turbo ? '1' : '0');
    $('turbo').classList.toggle('on', S.turbo);
    if (!S.slam) motion.speed = S.turbo ? 1.9 : 1;
    play('click');
  };
  $('auto').onclick = () => {
    play('click');
    if (S.auto > 0) { S.auto = 0; updateAuto(); return; }
    $('auto-menu').hidden = !$('auto-menu').hidden;
  };
  document.querySelectorAll('#auto-menu button').forEach((b) => (b.onclick = () => {
    S.auto = Number(b.dataset.n);
    $('auto-menu').hidden = true;
    updateAuto();
    if (!S.busy) spinOnce();
  }));
  $('sound').classList.toggle('off', sfx.muted);
  $('sound').onclick = () => { sfx.setMuted(!sfx.muted); $('sound').classList.toggle('off', sfx.muted); };
  $('info').onclick = () => { play('click'); renderPaytable(); $('paytable').hidden = false; };
  $('pt-close').onclick = () => ($('paytable').hidden = true);
  $('refill').onclick = () => { wallet.refill(); play('coin'); };
  $('buybtn').onclick = () => { play('click'); renderBuyMenu(); $('buymenu').hidden = false; };
  $('buy-close').onclick = () => ($('buymenu').hidden = true);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && $('paytable').hidden && $('buymenu').hidden) { e.preventDefault(); spinOnce(); }
  });
}

function changeBet(dir) {
  if (S.busy || S.fs) return;
  const i = Math.max(0, Math.min(BETS.length - 1, BETS.indexOf(S.bet) + dir));
  S.bet = BETS[i];
  localStorage.setItem('hk.bet', String(S.bet));
  $('bet').textContent = money(S.bet);
  play('click');
}

function setBusy(b) { document.body.classList.toggle('busy', b); }

function updateAuto() {
  $('auto').classList.toggle('on', S.auto > 0);
  $('auto-count').textContent = S.auto > 0 ? (S.auto > 9000 ? '∞' : S.auto) : '';
}

let winAnim = 0;
function setWinDisplay(v) {
  const el = $('win');
  cancelAnimationFrame(winAnim);
  const from = Number(el.dataset.v || 0);
  el.dataset.v = v;
  if (v <= from) { el.textContent = money(v); return; }
  const t0 = performance.now();
  const f = () => {
    const k = Math.min((performance.now() - t0) / 500, 1);
    el.textContent = money(from + (v - from) * k);
    if (k < 1) winAnim = requestAnimationFrame(f);
  };
  f();
}

function noFunds() {
  play('error');
  const el = $('balance-box');
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  $('refill').classList.add('pulse');
}

function renderPaytable() {
  const rows = M.PAYING.map((s) => {
    const pays = M.SYMBOLS[s].pays.map((p, i) => `<span><b>${['5+', '8+', '11+', '15+', '20+'][i]}</b> ${money(p * M.TUNING.payScale * S.bet)}</span>`).join('');
    return `<div class="pt-row"><img src="${BASE}sym_${s}.webp" alt=""><div class="pt-pays">${pays}</div></div>`;
  }).join('');
  $('pt-symbols').innerHTML = rows;
  $('pt-bet').textContent = money(S.bet);
}

function renderBuyMenu() {
  $('buy-symbols').innerHTML = `
    <div class="buy-opt" data-kind="fs"><img src="${BASE}fs_intro.webp" alt=""><div><b>Munchies Mode</b><span>${t('hk.buy.fs')}</span></div><em>${money(fsPrice * S.bet)}</em></div>
    <div class="buy-opt" data-kind="cloud9"><img src="${BASE}super_fs_intro.webp" alt=""><div><b>Cloud 9</b><span>${t('hk.buy.cloud9')}</span></div><em>${money(superPrice * S.bet)}</em></div>
    <div class="buy-opt" data-kind="lighter"><img src="${BASE}bonus_buy.webp" alt=""><div><b>Lucky Lighter</b><span>${t('hk.buy.lighter')}</span></div><em>${money(LIGHTER_PRICE * S.bet)}</em></div>
  `;
  $('buy-symbols').querySelectorAll('.buy-opt').forEach((el) => (el.onclick = () => { $('buymenu').hidden = true; buyFeature(el.dataset.kind); }));
}
