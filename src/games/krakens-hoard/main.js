import './i18n.js';
import { t as L, locale } from '../../shared/i18n.js';
import { Application, Assets, Container, Sprite, Graphics, Texture, Rectangle } from 'pixi.js';
import { guardRenderGroups } from '../../shared/pixi-guard.js';
import { Motion, ease } from '../../shared/motion.js';
import { wallet, money } from '../../shared/wallet.js';
import * as M from './math.js';
import { sfx, play, loop, stopLoop } from './sfx.js';
import { mountMusicControl } from '../../shared/music-control.js';
import { makeTextures, GoldText } from './textures.js';

// ---------------------------------------------------------------- layout
const W = 1920, H = 1040;
const CELL = 100, SYM = 94;
const GW = M.COLS * CELL, GH = M.MAX_ROWS * CELL;
const GX = (W - GW) / 2, GY = 115;
const cx = (c) => GX + c * CELL + CELL / 2;
const cy = (r) => GY + r * CELL + CELL / 2;
const BASE = `${import.meta.env.BASE_URL}assets/krakens-hoard/`;
const BETS = [0.2, 0.4, 0.6, 1, 2, 4, 5, 10, 20, 50, 100];
// bonus buy, x bet: measured avg free-spin value 45.7x / 0.98 = 46.6x (scripts/sim-kraken-fs.js, 1M spins)
const BUY_PRICE_X = 14.4; // measured average of the three storms / 0.96 (scripts/sim-kraken-fs.js)
// Maximum win per round (a paid spin plus everything it triggers, or one bought bonus):
// MAX_WIN_X times the bet, but never more than MAX_WIN_ABS – like the per-game win limits of real
// casinos. At a bet of 1 that is 150, at a bet of 100 it is 10,000.
const MAX_WIN_ABS = 10000;
const roundCap = (bet) => Math.round(Math.min(M.MAX_WIN_X * bet, MAX_WIN_ABS) * 100) / 100;
/** Pay at most what is left of this round's cap and book it. */
function takeFromCap(amount) {
  const pay = Math.min(amount, S.capLeft ?? amount);
  if (S.capLeft != null) S.capLeft = Math.round((S.capLeft - pay) * 100) / 100;
  return pay;
}

const TIERS = [['big', 15], ['mega', 30], ['epic', 50]];
const SYM_SCALE = { captain: 1.06, wild: 1.1, scatter: 1.08, chest: 1.04, parrot: 1.04 };

const IMAGES = [
  ...M.PAYING.map((s) => `sym_${s}`), 'sym_wild', 'sym_scatter',
  'bg_main', 'bg_freespins', 'frame', 'frame_bottom', 'plank', 'logo', 'win_big', 'win_mega', 'win_epic',
];
const OPTIONAL = ['kraken_tentacle', 'kraken_tentacle_sea']; // coin + orb are drawn procedurally (textures.js)

// ---------------------------------------------------------------- state
const S = {
  bet: Number(localStorage.getItem('kh.bet')) || 1,
  busy: false,
  turbo: localStorage.getItem('kh.turbo') === '1',
  auto: 0,
  fs: null, // { left, played, total, sticky, baseRows }
  // progression survives reloads: open planks + Kraken meter
  rows: clampInt(localStorage.getItem('kh.rows'), M.MIN_ROWS, M.MAX_ROWS, M.MIN_ROWS),
  meter: clampInt(localStorage.getItem('kh.meter'), 0, M.METER_MAX, 0),
  voyage: readVoyage(),
  grid: null,
  slam: false,
  ledger: [], // { bet, win, balance } per paid spin – audited in debug mode
};
if (!BETS.includes(S.bet)) S.bet = 1;

// every payout is rounded to whole cents before it touches the balance
const cents = (v) => Math.round(v * 100) / 100;

// the voyage survives page reloads – it is the long-term progression of the machine
function readVoyage() {
  try {
    const v = JSON.parse(localStorage.getItem('kh.voyage'));
    if (v && Number.isFinite(v.miles) && v.island >= 0 && v.island < M.ISLANDS.length) return { ...M.initialVoyage(), ...v };
  } catch { /* corrupted or first run */ }
  return M.initialVoyage();
}

function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

function persist() {
  try {
    localStorage.setItem('kh.rows', String(S.fs ? S.fs.baseRows : S.rows));
    localStorage.setItem('kh.meter', String(S.meter));
    localStorage.setItem('kh.voyage', JSON.stringify(S.voyage));
  } catch { /* private mode */ }
}

const $ = (id) => document.getElementById(id);

// Embedded as an app on the in-game phone: running in an iframe or with ?embed=1
const EMBEDDED = window.self !== window.top || new URLSearchParams(location.search).has('embed');
if (EMBEDDED) document.documentElement.classList.add('embedded');
let app, motion, TX, TEX, world, bgMain, bgFree, symLayer, glowLayer, plankLayer, fxLayer, hud, overlay;
let cells = []; // cells[c][r] = Container | null
const board = { rows: Math.min(M.MAX_ROWS, S.rows + 1), drawn: 0 };
// frame.webp: transparent opening x 205–1330, y 229–846. Scaled so the opening width matches the
// reels exactly (no horizontal stretch); height grows only via plain post strips at y 649–650.
const FR = { openL: 205, openR: 1330, openT: 229, openB: 846, cut: 650, postL: [96, 120], postR: [1328, 120] };
const FRAME_M = 8;
const FRAME_SCALE = (GW + FRAME_M * 2) / (FR.openR - FR.openL);
const FRAME_TOP = (FR.openT * FRAME_SCALE) + FRAME_M; // frame height above the board
const FRAME_BOTTOM = ((1024 - FR.openB) * FRAME_SCALE) + FRAME_M; // below the board
const FRAME_SIDE = FR.openL * FRAME_SCALE + FRAME_M;
const planks = [];
let shake = { amp: 0, t: 0, ms: 1 };

// ---------------------------------------------------------------- boot
boot();

async function boot() {
  const bar = $('load-bar');
  await Promise.all(['900 40px Montserrat', '800 20px Montserrat'].map((f) => document.fonts.load(f).catch(() => {})));
  IMAGES.forEach((n) => Assets.add({ alias: n, src: `${BASE}${n}.webp` }));
  TEX = await Assets.load(IMAGES, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  // optional art: replaces the procedural fallback when the file exists (see docs/06-asset-guide.md)
  for (const n of OPTIONAL) {
    try {
      const r = await fetch(`${BASE}${n}.webp`, { method: 'HEAD' });
      if (r.ok && r.headers.get('content-type')?.startsWith('image')) TEX[n] = await Assets.load(`${BASE}${n}.webp`);
    } catch { /* keep fallback */ }
  }
  $('load-text').textContent = L('load.ready');
  $('load-start').hidden = false;
  $('load-start').onclick = async () => {
    // phones: go fullscreen like a native game (not supported on iOS Safari – harmless there)
    // never inside the in-game phone (iframe) – the host game owns the screen
    if (!EMBEDDED && matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    await sfx.unlock();
    play('click');
    $('loader').classList.add('gone');
    setTimeout(() => $('loader').remove(), 900);
    await start();
  };
}

async function start() {
  app = new Application();
  await app.init({ resizeTo: $('stage'), antialias: true, backgroundColor: 0x03060c, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  guardRenderGroups(app);
  $('stage').appendChild(app.canvas);
  motion = new Motion(app.ticker);
  motion.speed = S.turbo ? 1.9 : 1;
  TX = makeTextures();
  if (TEX.coin) TX.coin = TEX.coin;
  if (TEX.multiplier_orb) TX.orb = TEX.multiplier_orb;
  buildScene();
  buildUI();
  app.renderer.on('resize', layout);
  // tap the reels to spin, tap again to quick-stop (like native mobile slots)
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', () => {
    if (overlay.children.length || !$('paytable').hidden) return;
    if (S.fs) slam(); // free spins auto-play: a tap only speeds up the current spin
    else spinOnce();
  });
  layout();
  app.ticker.add(tick);
  loop('music', { music: true }); // ocean recording (sfx/music.mp3), else the procedural shanty

  if (new URLSearchParams(location.search).has('debug')) window.KH = {
    // ledger audit: balance must equal start − Σbets + Σwins
    audit(start) {
      const bets = S.ledger.reduce((a, l) => a + l.bet, 0), wins = S.ledger.reduce((a, l) => a + l.win, 0);
      const expected = Math.round((start - bets + wins) * 100) / 100;
      return { spins: S.ledger.length, bets, wins: Math.round(wins * 100) / 100, expected, balance: wallet.balance, ok: Math.abs(expected - wallet.balance) < 0.011 };
    },
    S, M, sfx, freeSpins, maybeBigWin, presentWin, creditWin, spinOnce, motion, world, app, wallet, get cells() { return cells; },
    // drive frames manually (background tabs throttle requestAnimationFrame)
    async run(ms, step = 16) {
      let t = performance.now();
      for (let i = 0; i < ms / step; i++) {
        t += step;
        app.ticker.update(t);
        for (let k = 0; k < 4; k++) await Promise.resolve(); // let tween promises chain on
      }
    },
  };

  // intro: frame + first grid
  S.busy = true;
  world.alpha = 0;
  motion.tween(world, { alpha: 1 }, 700);
  S.grid = M.freshGrid(S.rows, Math.random);
  await dropIn(S.grid, S.rows, false);
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

  const ambient = new Container();
  world.addChild(ambient);
  world.ambient = ambient;

  // things that rise from the sea behind the machine (free spins cameo)
  world.behind = new Container();
  world.addChild(world.behind);

  // dark glass behind the reels (redrawn as the board grows)
  board.back = new Graphics();
  world.addChild(board.back);

  const gridBox = new Container();
  board.mask = new Graphics();
  gridBox.mask = board.mask;
  world.addChild(gridBox, board.mask);
  glowLayer = new Container();
  symLayer = new Container();
  gridBox.addChild(glowLayer, symLayer);

  plankLayer = new Container();
  world.addChild(plankLayer);
  for (let r = 0; r < M.MAX_ROWS; r++) planks.push(makePlank(r));
  setPlanks(S.rows);

  board.frame = buildFrame();
  world.addChild(board.frame);
  updateBoard();

  fxLayer = new Container();
  world.addChild(fxLayer);
  hud = new Container();
  world.addChild(hud);
  buildHud();

  overlay = new Container();
  app.stage.addChild(overlay);

  for (let c = 0; c < M.COLS; c++) cells.push(new Array(M.MAX_ROWS).fill(null));
}

function makePlank(r) {
  const p = new Container();
  const s = new Sprite(TEX.plank);
  s.anchor.set(0.5);
  s.width = GW + 36;
  s.height = CELL * 1.08;
  s.tint = [0xffffff, 0xe8ddd0, 0xf4efe6, 0xdcd2c4][r % 4];
  if (r % 2) s.scale.x *= -1;
  p.addChild(s);
  p.position.set(GX + GW / 2, cy(r));
  p.rotation = (Math.random() - 0.5) * 0.02;
  plankLayer.addChild(p);
  p.sprite = s;
  return p;
}

// ---------------------------------------------------------------- board / camera
// The frame shows the active rows plus ONE plank row above (the next one to blast).
// board.rows is animated; frame, mask, glass and camera follow it every frame.
function viewRowsFor(rows) {
  return Math.min(M.MAX_ROWS, rows + 1);
}

const boardTop = () => GY + (M.MAX_ROWS - board.rows) * CELL;

function buildFrame() {
  const src = TEX.frame.source;
  const part = (x, y, w, h) => new Sprite(new Texture({ source: src, frame: new Rectangle(x, y, w, h) }));
  const f = new Container();
  f.top = part(0, 0, 1536, FR.cut);
  f.midL = part(FR.postL[0], FR.cut - 1, FR.postL[1], 1);
  f.midR = part(FR.postR[0], FR.cut - 1, FR.postR[1], 1);
  f.bottom = new Sprite(TEX.frame_bottom);
  f.midL.x = FR.postL[0];
  f.midR.x = FR.postR[0];
  f.addChild(f.midL, f.midR, f.top, f.bottom);
  f.scale.set(FRAME_SCALE);
  f.x = GX - FRAME_SIDE;
  return f;
}

function updateBoard() {
  const top = boardTop(), h = board.rows * CELL;
  const f = board.frame;
  // texture px of post that must be added so the opening covers the board
  const stretch = Math.max(0, (h + FRAME_M * 2) / FRAME_SCALE - (FR.openB - FR.openT));
  f.midL.y = f.midR.y = FR.cut;
  f.midL.height = f.midR.height = stretch + 1;
  f.bottom.y = FR.cut + stretch;
  f.y = top - FRAME_TOP;
  board.mask.clear().rect(GX - 8, top - 4, GW + 16, h + 8).fill(0xffffff);
  board.back.clear().roundRect(GX - 6, top - 6, GW + 12, h + 12, 10).fill({ color: 0x050b14, alpha: 0.8 });
  for (let c = 1; c < M.COLS; c++) board.back.rect(GX + c * CELL - 1, top, 2, h).fill({ color: 0x3a5a78, alpha: 0.18 });
  board.drawn = board.rows;
}

function zoomTo(rows, ms = 700) {
  return motion.tween(board, { rows: viewRowsFor(rows) }, ms, ease.inOutCubic);
}

// only the plank directly above the active rows is in view
function setPlanks(rows) {
  planks.forEach((p, r) => {
    p.visible = r === M.MAX_ROWS - rows - 1;
    p.alpha = 1;
    p.position.set(GX + GW / 2, cy(r));
    p.rotation = (Math.random() - 0.5) * 0.02;
    p.scale.set(1);
  });
}

function buildHud() {
  const logo = new Sprite(TEX.logo);
  logo.anchor.set(0.5);
  logo.scale.set(470 / logo.texture.width);
  logo.position.set(330, 250);
  hud.addChild(logo);
  hud.logo = logo;

  // ways counter (right side)
  const waysLbl = new GoldText(420, 60, 30, { palette: 'white', glow: 'rgba(80,160,255,.6)', stroke: '#06101c' });
  waysLbl.text = L('kh.ways');
  waysLbl.position.set(1590, 270);
  const ways = new GoldText(460, 120, 72);
  ways.position.set(1590, 345);
  const maxLbl = new GoldText(420, 60, 26, { palette: 'white', glow: 'rgba(80,160,255,.5)', stroke: '#06101c' });
  maxLbl.text = L('kh.maxWin', { x: M.MAX_WIN_X.toLocaleString(locale) });
  maxLbl.position.set(1590, 430);
  hud.addChild(waysLbl, ways, maxLbl);
  Object.assign(hud, { ways, waysLbl, maxLbl });
  updateWays(S.rows, false);

  // tumble win (right side, lower)
  const tw = new GoldText(460, 110, 64);
  tw.position.set(1590, 640);
  tw.alpha = 0;
  const twl = new GoldText(420, 60, 28, { palette: 'white', glow: 'rgba(255,190,80,.6)', stroke: '#1c0e02' });
  twl.text = L('kh.win');
  twl.position.set(1590, 575);
  twl.alpha = 0;
  hud.addChild(twl, tw);
  hud.tumble = tw;
  hud.tumbleLbl = twl;

  // free spins panel (left side, below logo)
  const fs = new Container();
  fs.position.set(330, 610);
  fs.alpha = 0;
  const fsl = new GoldText(420, 60, 30, { palette: 'white', glow: 'rgba(120,255,200,.6)', stroke: '#02140e' });
  fsl.text = L('kh.freeSpins');
  fsl.y = -110;
  const fsc = new GoldText(420, 100, 64);
  fsc.y = -45;
  const orb = new Sprite(TX.orb);
  orb.anchor.set(0.5);
  orb.scale.set(0.9);
  orb.y = 110;
  orb.blendMode = 'add';
  const mul = new GoldText(260, 120, 70, { palette: 'white', glow: 'rgba(40,255,170,.9)', stroke: '#01261b' });
  mul.y = 110;
  const mull = new GoldText(420, 50, 24, { palette: 'green', glow: 'rgba(40,255,170,.6)', stroke: '#01261b' });
  mull.text = L('kh.krakenMulti');
  mull.y = 205;
  fs.addChild(fsl, fsc, orb, mul, mull);
  hud.addChild(fs);
  Object.assign(hud, { fs, fsCount: fsc, orb, mult: mul });

  // Kraken meter: every blasted plank charges it, full = guaranteed Kraken strike
  const meter = new Container();
  const ml = new GoldText(520, 60, 30, { palette: 'white', glow: 'rgba(190,90,255,.8)', stroke: '#14031c' });
  ml.text = L('kh.krakenStrike');
  ml.y = -44;
  const W2 = 330, H2 = 30;
  const track = new Graphics().roundRect(-W2 / 2, -H2 / 2, W2, H2, H2 / 2).fill({ color: 0x12061c, alpha: 0.85 }).stroke({ width: 3, color: 0xc9a14a });
  const fill = new Graphics();
  const eye = new Sprite(TX.orb);
  eye.anchor.set(0.5);
  eye.scale.set(0.42);
  eye.tint = 0xd070ff;
  eye.blendMode = 'add';
  eye.x = W2 / 2 + 14;
  const count = new GoldText(360, 46, 24, { palette: 'white', glow: 'rgba(0,0,0,.9)', stroke: '#14031c' });
  count.y = 1;
  // dark glass panel behind label + bar: readable over the stormy sea in every situation
  const mpanel = new Graphics().roundRect(-215, -74, 430, 118, 20).fill({ color: 0x0a0414, alpha: 0.72 }).stroke({ width: 2, color: 0xc9a14a, alpha: 0.5 });
  meter.addChild(mpanel, ml, track, fill, eye, count);
  Object.assign(meter, { fillG: fill, eye, count, lbl: ml, W: W2, H: H2, shown: -1 });
  hud.addChild(meter);
  hud.meter = meter;
  drawMeter(S.meter, false);

  // The voyage: nautical miles towards the next island on the chart
  const voy = new Container();
  const vl = new GoldText(520, 60, 30, { palette: 'white', glow: 'rgba(120,200,255,.8)', stroke: '#04121c' });
  vl.y = -44;
  const VW = 330, VH = 18;
  const vtrack = new Graphics().roundRect(-VW / 2, -VH / 2, VW, VH, VH / 2).fill({ color: 0x061422, alpha: 0.85 }).stroke({ width: 3, color: 0xc9a14a });
  const vfill = new Graphics();
  const dots = new Container();
  for (let i = 0; i < M.ISLANDS.length; i++) {
    const d = new Graphics();
    d.x = -VW / 2 + (VW / (M.ISLANDS.length - 1)) * i;
    d.y = VH / 2 + 16;
    dots.addChild(d);
  }
  const vcount = new GoldText(420, 44, 23, { palette: 'white', glow: 'rgba(0,0,0,.9)', stroke: '#04121c' });
  vcount.y = 0;
  const vpanel = new Graphics().roundRect(-215, -74, 430, 128, 20).fill({ color: 0x04101c, alpha: 0.72 }).stroke({ width: 2, color: 0x5ba9e0, alpha: 0.5 });
  voy.addChild(vpanel, vl, vtrack, vfill, dots, vcount);
  Object.assign(voy, { fillG: vfill, lbl: vl, count: vcount, dots, W: VW, H: VH });
  hud.addChild(voy);
  hud.voyage = voy;
  drawVoyage(false);
}

/** Chart bar: progress to the next island plus a dot per island of this voyage. */
function drawVoyage(pop = true) {
  const v = hud.voyage;
  if (!v) return;
  const need = M.islandMiles(S.voyage.island);
  const k = Math.min(S.voyage.miles / need, 1);
  v.lbl.text = L('kh.course', { name: L(`kh.island.${M.ISLANDS[S.voyage.island].key}`) }).toUpperCase();
  v.count.text = L('kh.milesOf', { a: Math.floor(S.voyage.miles), b: need });
  v.fillG.clear();
  if (k > 0) {
    const w = Math.max(v.H, v.W * k);
    v.fillG.roundRect(-v.W / 2 + 3, -v.H / 2 + 3, w - 6, v.H - 6, (v.H - 6) / 2).fill({ color: 0x3db7ff });
    v.fillG.roundRect(-v.W / 2 + 6, -v.H / 2 + 5, w - 12, (v.H - 6) / 3, 3).fill({ color: 0xffffff, alpha: 0.3 });
  }
  v.dots.children.forEach((d, i) => {
    const done = i < S.voyage.island;
    d.clear().circle(0, 0, done || i === S.voyage.island ? 7 : 5)
      .fill({ color: done ? 0xf5c542 : i === S.voyage.island ? 0x3db7ff : 0x2a3a4a })
      .stroke({ width: 2, color: done ? 0xfff3c4 : 0x0a1b28 });
  });
  if (pop) {
    v.count.scale.set(1.3);
    motion.tween(v.count, { scale: 1 }, 400, ease.outElastic);
  }
}

// base game and free spins keep separate meters: base → Kraken strike, storm → Kraken's Wrath
const meterMax = () => (S.fs ? M.METER_MAX_FS : M.METER_MAX);
const getMeter = () => (S.fs ? S.fs.meter : S.meter);
function setMeter(v) {
  if (S.fs) S.fs.meter = v; else S.meter = v;
}

function drawMeter(v, pop = true) {
  const m = hud.meter;
  const max = meterMax();
  if (m.lbl) m.lbl.text = S.fs ? L('kh.wrath') : L('kh.krakenStrike');
  const k = Math.min(v / max, 1);
  m.fillG.clear();
  if (k > 0) {
    const w = Math.max(m.H, m.W * k);
    m.fillG.roundRect(-m.W / 2 + 3, -m.H / 2 + 3, w - 6, m.H - 6, (m.H - 6) / 2).fill({ color: k >= 1 ? 0xff5cf0 : 0x9b3dff });
    m.fillG.roundRect(-m.W / 2 + 6, -m.H / 2 + 5, w - 12, (m.H - 6) / 3, 4).fill({ color: 0xffffff, alpha: 0.25 });
  }
  m.count.text = k >= 1 ? L('kh.ready') : `${v} / ${max}`;
  m.full = k >= 1;
  if (pop && v !== m.shown) {
    m.eye.scale.set(0.7);
    motion.tween(m.eye, { scale: 0.42 }, 500, ease.outElastic);
  }
  m.shown = v;
}

function updateWays(rows, pop = true) {
  hud.ways.text = (rows ** M.COLS).toLocaleString(locale);
  if (pop) {
    const b = hud.ways.base ?? 1;
    hud.ways.scale.set(1.35 * b);
    motion.tween(hud.ways, { scale: b }, 500, ease.outElastic);
  }
}

// Two arrangements around the board: landscape (logo left, info right) and portrait
// (logo above, info row below). Bounds hug the frame so the reels fill the screen; they
// follow the animated board height, so blasting a plank zooms the camera out.
const BB = GY + GH; // board bottom (fixed)
const LAYOUTS = {
  landscape: (bt) => {
    const top = bt - FRAME_TOP - 8, bottom = BB + FRAME_BOTTOM + 8;
    const L = GX - FRAME_SIDE - 150, R = GX + GW + FRAME_SIDE + 150;
    return {
      bounds: { x: GX - FRAME_SIDE - 300, y: top, w: GW + 2 * FRAME_SIDE + 600, h: bottom - top },
      logo: [L, bt + 60, 285], hudScale: 0.7,
      waysLbl: [R, bt + 10], ways: [R, bt + 68], maxLbl: [R, bt + 124],
      tumbleLbl: [R, bt + 230], tumble: [R, bt + 288], fs: [L, bt + 370],
      meter: [R - 70, bt + 420], voyage: [R - 70, bt + 560],
    };
  },
  portrait: (bt) => {
    const top = bt - FRAME_TOP - 330, fb = BB + FRAME_BOTTOM;
    return {
      bounds: { x: GX - FRAME_SIDE - 4, y: top, w: GW + 2 * FRAME_SIDE + 8, h: fb + 330 - top },
      meter: [GX + GW / 2, fb + 205], voyage: [GX + GW / 2, fb + 285],
      logo: [GX + GW / 2, bt - FRAME_TOP - 160, 470], hudScale: 0.78,
      waysLbl: [GX + 120, fb + 30], ways: [GX + 120, fb + 78], maxLbl: [GX + 120, fb + 124],
      // free spins panel takes the logo's place (logo hides during free spins)
      tumbleLbl: [GX + GW - 120, fb + 30], tumble: [GX + GW - 120, fb + 82], fs: [GX + GW / 2, bt - FRAME_TOP - 170],
      portrait: true,
    };
  },
};

let portrait = false;
let hudSRef = 0, hudComp = 1;
function applyHudLayout(L) {
  portrait = !!L.portrait;
  hud.logo.scale.set(L.logo[2] / hud.logo.texture.width);
  hud.logo.position.set(L.logo[0], L.logo[1]);
  hud.logo.baseY = L.logo[1];
  for (const k of ['waysLbl', 'ways', 'maxLbl', 'tumbleLbl', 'tumble', 'fs', 'meter', 'voyage']) {
    hud[k].position.set(...L[k]);
    hud[k].base = L.hudScale * hudComp;
    if (!motion.tweens || ![...motion.tweens].some((t) => t.obj === hud[k])) hud[k].scale.set(hud[k].base);
  }
}

function layout() {
  const sw = app.screen.width, sh = app.screen.height;
  const L = (sw / sh < 0.95 ? LAYOUTS.portrait : LAYOUTS.landscape)(boardTop());
  const b = L.bounds;
  const s = Math.min(sw / b.w, sh / b.h);
  // a bigger deck zooms the camera out – the HUD must NOT shrink with it, so it is scaled back up
  if (S.rows <= M.MIN_ROWS || !hudSRef) hudSRef = s;
  hudComp = Math.min(1.8, Math.max(1, hudSRef / s));
  applyHudLayout(L);
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
let ambientT = 0, lightningAt = 0;
function tick(tk) {
  const dt = tk.deltaMS;
  if (board.rows !== board.drawn) { updateBoard(); layout(); }
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
  hud.logo.y = hud.logo.baseY + Math.sin(t * 1.1) * 6;
  hud.logo.visible = !(portrait && S.fs);
  hud.orb.alpha = 0.75 + Math.sin(t * 3) * 0.2;
  hud.orb.rotation = t * 0.4;
  world.behind.tentacles?.forEach((tt, i) => (tt.rotation = Math.sin(t * 0.8 + i * 2) * 0.05));

  ambientT += dt;
  const storm = !!S.fs;
  if (ambientT > (storm ? 12 : 140)) {
    ambientT = 0;
    if (storm) {
      for (let i = 0; i < 3; i++) motion.emit({ texture: TX.rain, parent: world.ambient, x: Math.random() * (W + 600) - 300, y: -120, vx: -280, vy: 1700, life: 900, rotation: 0.16, alpha: 0.7, scale: 1 });
    } else {
      motion.emit({ texture: TX.spark, parent: world.ambient, x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 50, life: 9000, scale: 0.3 + Math.random() * 0.5, endScale: 0.1, tint: 0xffb050, blend: 'add', alpha: 0.8 });
    }
  }
  if (storm && performance.now() > lightningAt) {
    lightningAt = performance.now() + 5000 + Math.random() * 7000;
    lightning();
  }
}

function doShake(amp, ms) {
  shake = { amp, ms, t: ms };
  // haptic feedback on phones that support it (Android); strong hits only
  if (amp >= 10) navigator.vibrate?.(Math.min(ms / 4, 120));
}

async function lightning() {
  const flash = new Sprite(Texture.WHITE);
  flash.width = app.screen.width;
  flash.height = app.screen.height;
  flash.tint = 0xcfd8ff;
  flash.alpha = 0;
  flash.blendMode = 'add';
  app.stage.bgLayer.addChild(flash);
  play('thunder');
  await motion.tween(flash, { alpha: 0.7 }, 60);
  await motion.tween(flash, { alpha: 0.1 }, 120);
  await motion.tween(flash, { alpha: 0.5 }, 50);
  await motion.tween(flash, { alpha: 0 }, 700);
  flash.destroy();
}

// ---------------------------------------------------------------- cells
function makeCell(sym, c, r) {
  const box = new Container();
  const s = new Sprite(TEX[`sym_${sym}`]);
  s.anchor.set(0.5);
  const k = (SYM * (SYM_SCALE[sym] ?? 1)) / Math.max(s.texture.width, s.texture.height);
  s.scale.set(k);
  box.addChild(s);
  box.sprite = s;
  box.sym = sym;
  box.position.set(cx(c), cy(r));
  symLayer.addChild(box);
  return box;
}

function setSym(box, sym) {
  box.sym = sym;
  box.sprite.texture = TEX[`sym_${sym}`];
  box.sprite.scale.set((SYM * (SYM_SCALE[sym] ?? 1)) / Math.max(box.sprite.texture.width, box.sprite.texture.height));
}

function allCells() {
  return cells.flat().filter(Boolean);
}

// ---------------------------------------------------------------- spin animation
async function dropOut() {
  const old = cells.map((col) => col.filter(Boolean));
  cells = cells.map(() => new Array(M.MAX_ROWS).fill(null));
  const jobs = old.map((col, c) =>
    Promise.all(col.map((box) =>
      motion.tween(box, { y: box.y + GH + 200 }, 330, ease.inQuad, c * 55 + (M.MAX_ROWS - Math.round((box.y - GY) / CELL)) * 12)
        .then(() => box.destroy()))));
  await Promise.all(jobs);
}

// new spin: board shrinks back (camera zooms in), the teaser plank slams down
async function closePlanks(rows) {
  const target = viewRowsFor(rows);
  const plank = planks[M.MAX_ROWS - rows - 1];
  const wasVisible = plank?.visible;
  setPlanks(rows);
  if (board.rows === target && wasVisible) return;
  const zoom = zoomTo(rows, 550);
  if (plank && !wasVisible) {
    const y = plank.y;
    plank.y = y - 160;
    plank.alpha = 0;
    await motion.tween(plank, { y, alpha: 1 }, 420, ease.outBounce, 150);
    play('land', { rate: 0.6 });
  }
  await zoom;
}

async function dropIn(grid, rows, withAnticipation = true) {
  const top = M.MAX_ROWS - rows;
  let delay = 0, scatters = 0, antic = null, beam = null;
  const jobs = [];
  for (let c = 0; c < M.COLS; c++) {
    if (withAnticipation && scatters >= 2 && !S.slam) {
      delay += 900;
      if (!antic) antic = play('anticipation');
      beam = columnBeam(c, delay);
    }
    const colDelay = delay + c * 95;
    for (let r = M.MAX_ROWS - 1; r >= top; r--) {
      const box = makeCell(grid[c][r], c, r);
      cells[c][r] = box;
      const y = box.y;
      box.y = y - (rows + 1) * CELL - 60;
      jobs.push(motion.tween(box, { y }, 380, (t) => ease.outBack(t, 1.1), colDelay + (M.MAX_ROWS - 1 - r) * 22));
    }
    const hasScatter = grid[c].slice(top).includes('scatter');
    const step = scatters;
    jobs.push(motion.wait(colDelay + 300).then(() => {
      play('land', { rate: 1 + c * 0.04 });
      if (hasScatter) {
        play('scatterLand', { step });
        pulseSym(c, grid[c].indexOf('scatter', top));
      }
    }));
    if (hasScatter) scatters++;
    if (beam) jobs.push(beam);
  }
  await Promise.all(jobs);
  antic?.stop();
}

async function columnBeam(c, delay) {
  await motion.wait(delay - 900 + c * 95);
  const b = new Sprite(TX.beam);
  b.anchor.set(0.5);
  b.position.set(cx(c), (boardTop() + BB) / 2);
  b.width = CELL * 1.6;
  b.height = BB - boardTop() + 80;
  b.blendMode = 'add';
  b.alpha = 0;
  fxLayer.addChild(b);
  await motion.tween(b, { alpha: 0.85 }, 250);
  await motion.wait(600);
  await motion.tween(b, { alpha: 0 }, 400);
  b.destroy();
}

function pulseSym(c, r) {
  const box = cells[c][r];
  if (!box) return;
  glowAt(c, r, 0xffe08a, 700);
  box.scale.set(1.25);
  motion.tween(box, { scale: 1 }, 500, ease.outElastic);
}

function glowAt(c, r, tint, ms) {
  const g = new Sprite(TX.glow);
  g.anchor.set(0.5);
  g.position.set(cx(c), cy(r));
  g.tint = tint;
  g.blendMode = 'add';
  g.scale.set(1.6);
  g.alpha = 0;
  glowLayer.addChild(g);
  motion.tween(g, { alpha: 0.9 }, 150).then(() => motion.tween(g, { alpha: 0 }, ms)).then(() => g.destroy());
  return g;
}

// Kraken strike: a geyser + violet energy surge rips up the reel and slams it wild.
// With a real kraken_tentacle.webp the tentacle rises through the surge as well.
async function krakenAttack(step) {
  if (step.fromMeter) await meterRelease();
  play('kraken');
  doShake(10, 1400);
  await strikeReel(step.reel, step.grid, step.mult);
  S.grid = step.grid;
}

// KRAKEN'S WRATH: the storm meter is full – three tentacles tear up three reels at once
async function wrathAttack(step) {
  await meterRelease();
  play('fsStart');
  doShake(18, 1600);
  const flash = new Sprite(Texture.WHITE);
  flash.tint = 0xb040ff;
  flash.blendMode = 'add';
  flash.alpha = 0.7;
  flash.width = app.screen.width;
  flash.height = app.screen.height;
  app.stage.addChild(flash);
  motion.tween(flash, { alpha: 0 }, 900).then(() => flash.destroy());
  const title = new GoldText(1100, 170, 110, { palette: 'white', glow: 'rgba(200,80,255,1)', stroke: '#1a0326' });
  title.text = L('kh.wrath');
  title.position.set(GX + GW / 2, (GY + (M.MAX_ROWS - S.rows) * CELL + BB) / 2);
  title.scale.set(2.2);
  title.alpha = 0;
  fxLayer.addChild(title);
  motion.tween(title, { alpha: 1 }, 150);
  await motion.tween(title, { scale: 0.85 }, 500, (v) => ease.outBack(v, 1.6));
  play('kraken');
  await Promise.all(step.reels.map((k, i) => motion.wait(i * 170).then(() => strikeReel(k.reel, step.grid, k.mult))));
  await motion.tween(title, { alpha: 0, scale: 1.2 }, 350);
  title.destroy();
  S.grid = step.grid;
}

async function strikeReel(c, grid, mult) {
  const top = M.MAX_ROWS - S.rows;
  const y0 = GY + top * CELL;
  const step = { grid, mult };
  {
    const x = cx(c);
    for (let k = 0; k < 46; k++) motion.emit({ texture: TX.drop, parent: fxLayer, x: x + (Math.random() - 0.5) * 90, y: BB + 20, vx: (Math.random() - 0.5) * 380, vy: -900 - Math.random() * 1100, gravity: 2600, life: 1200, scale: 0.5 + Math.random() * 1.2, blend: 'add' });
    for (let k = 0; k < 10; k++) motion.emit({ texture: TX.glow, parent: fxLayer, x: x + (Math.random() - 0.5) * 60, y: BB - Math.random() * (BB - y0), vx: (Math.random() - 0.5) * 80, vy: -60, life: 1100, scale: 0.8, endScale: 2.6, tint: 0x5a1a8a, alpha: 0.55 });

    const surge = new Sprite(TX.beam);
    surge.anchor.set(0.5, 1);
    surge.position.set(x, BB + 30);
    surge.width = CELL * 1.5;
    surge.height = 0;
    surge.tint = 0xc060ff;
    surge.blendMode = 'add';
    fxLayer.addChild(surge);
    motion.tween(surge, { height: BB - y0 + 90 }, 260, ease.outCubic);

    // the tentacle whips up through the surge, lashes, and drags back down – leaving wilds behind
    if (TEX.kraken_tentacle) {
      const t = new Sprite(TEX.kraken_tentacle);
      t.anchor.set(0.5, 1);
      const k = ((BB - y0) * 1.2) / t.texture.height;
      t.scale.set(Math.random() < 0.5 ? -k : k, k);
      t.position.set(x, BB + t.height + 40);
      t.rotation = (Math.random() - 0.5) * 0.25;
      fxLayer.addChild(t);
      await motion.tween(t, { y: BB + 50, rotation: 0 }, 420, (v) => ease.outBack(v, 1.4));
      doShake(14, 350);
      await motion.tween(t, { rotation: t.scale.x > 0 ? 0.12 : -0.12 }, 160, ease.outQuad);
      await motion.tween(t, { rotation: t.scale.x > 0 ? -0.06 : 0.06 }, 160, ease.inOutCubic);
      motion.tween(t, { y: BB + t.height + 60, rotation: 0 }, 380, ease.inQuad).then(() => t.destroy());
      await motion.wait(140);
    } else {
      await motion.wait(220);
    }

    // slam wilds in, bottom to top
    for (let r = M.MAX_ROWS - 1; r >= top; r--) {
      if (step.grid[c][r] !== 'wild') continue;
      const box = cells[c][r];
      await motion.tween(box, { scale: 0.3 }, 55, ease.inQuad);
      setSym(box, 'wild');
      play('wildFlip');
      const ring = glowAt(c, r, 0xd070ff, 450);
      motion.tween(ring, { scale: 2.8 }, 500, ease.outCubic);
      box.scale.set(1.45);
      motion.tween(box, { scale: 1 }, 320, (t) => ease.outBack(t, 2));
    }
    if (step.mult > 0) await addBadge(c, step.mult); // Wrath reels are pure wilds (no plaque)
    await motion.tween(surge, { alpha: 0 }, 350);
    surge.destroy();
  }
}

// full meter: the eye bursts open and the bar drains into the strike
async function meterRelease() {
  const m = hud.meter;
  play('tierUp');
  for (let k = 0; k < 30; k++) motion.emit({ texture: TX.spark, parent: hud, x: m.x + m.eye.x * m.scale.x, y: m.y, vx: (Math.random() - 0.5) * 900, vy: (Math.random() - 0.5) * 900, drag: 0.92, life: 800, scale: 1.6, endScale: 0.2, tint: 0xe080ff, blend: 'add' });
  m.eye.scale.set(1.2);
  await motion.tween(m.eye, { scale: 0.42 }, 600, ease.outElastic);
  setMeter(0);
  drawMeter(0, false);
}

// ---------------------------------------------------------------- Kraken reel plaques
// A Kraken reel carries a multiplier plaque and a violet aura for as long as it stays wild.
const badges = new Map(); // reel -> Container

async function addBadge(reel, mult) {
  const b = new Container();
  const orb = new Sprite(TX.orb);
  orb.anchor.set(0.5);
  orb.tint = 0xc050ff;
  orb.blendMode = 'add';
  orb.scale.set(0.7);
  const t = new GoldText(240, 120, 72, { palette: 'white', glow: 'rgba(210,90,255,1)', stroke: '#1a0326' });
  t.text = `x${mult}`;
  b.addChild(orb, t);
  const aura = new Sprite(TX.beam);
  aura.anchor.set(0.5);
  aura.tint = 0x9a3dff;
  aura.blendMode = 'add';
  aura.alpha = 0.35;
  glowLayer.addChild(aura);
  Object.assign(b, { reel, mult, orb, aura });
  fxLayer.addChild(b);
  badges.set(reel, b);
  placeBadges();
  b.scale.set(3);
  b.alpha = 0;
  play('multUp', { mult });
  motion.tween(b, { alpha: 1 }, 150);
  await motion.tween(b, { scale: 1 }, 450, (v) => ease.outBack(v, 2));
  doShake(8, 250);
  updateKrakenMulti();
}

function placeBadges() {
  const top = GY + (M.MAX_ROWS - S.rows) * CELL;
  for (const b of badges.values()) {
    // plaque sits at the top of its reel so tumble win amounts in the middle never overlap it
    b.position.set(cx(b.reel), top + CELL * 0.55);
    b.aura.position.set(cx(b.reel), (top + BB) / 2);
    b.aura.width = CELL * 1.25;
    b.aura.height = BB - top;
  }
}

function clearBadges() {
  for (const b of badges.values()) {
    motion.tween(b, { alpha: 0, scale: 0.5 }, 300).then(() => b.destroy({ children: true }));
    motion.tween(b.aura, { alpha: 0 }, 300).then(() => b.aura.destroy());
  }
  badges.clear();
  updateKrakenMulti();
}

function updateKrakenMulti() {
  const sum = [...badges.values()].reduce((a, b) => a + b.mult, 0);
  hud.mult.text = sum ? `x${sum}` : '–';
}

// One text announcement at a time (plank loot, Kraken eye, max ways): they queue instead of
// stacking on top of each other, and the floating win amount steps aside while one is showing.
let announcing = 0;
let announceQueue = Promise.resolve();
function announce(show) {
  announceQueue = announceQueue.then(async () => {
    announcing++;
    if (showWin.label && !showWin.label.destroyed) showWin.label.destroy();
    try { await show(); } catch (e) { console.warn('[kraken] announcement failed', e); } finally { announcing--; }
  });
  return announceQueue;
}

async function showWin(step) {
  const win = new Set(step.cells.map(([c, r]) => `${c},${r}`));
  const level = Math.floor(Math.log2(1 + step.x * 4));
  play('win', { level });
  for (const box of allCells()) {
    const c = Math.round((box.x - GX - CELL / 2) / CELL), r = Math.round((box.y - GY - CELL / 2) / CELL);
    if (!win.has(`${c},${r}`)) motion.tween(box, { alpha: 0.4 }, 180);
  }
  for (const [c, r] of step.cells) {
    const box = cells[c][r];
    glowAt(c, r, 0xffc940, 900);
    motion.tween(box, { scale: 1.2 }, 180, ease.outQuad)
      .then(() => motion.tween(box, { scale: 1 }, 220, ease.inOutCubic))
      .then(() => motion.tween(box, { scale: 1.14 }, 180, ease.outQuad))
      .then(() => motion.tween(box, { scale: 1 }, 220, ease.inOutCubic));
  }

  // Kraken plaques involved in this win flare up
  const maxMult = Math.max(...step.wins.map((w) => w.mult ?? 1));
  if (maxMult > 1) {
    for (const b of badges.values()) {
      b.scale.set(1.5);
      motion.tween(b, { scale: 1 }, 500, ease.outElastic);
    }
    play('multUp', { mult: maxMult });
  }

  // floating amount at the centre of the winning cluster
  const amt = step.x * S.bet;
  const [sx, sy] = step.cells.reduce(([a, b], [c, r]) => [a + cx(c), b + cy(r)], [0, 0]);
  // one floating amount at a time: a new tumble win replaces the previous label instead of
  // stacking on top of it; kept clear of the reel-top Kraken plaques
  if (showWin.label && !showWin.label.destroyed) showWin.label.destroy();
  if (announcing) { hud.tumble.text = money(S.fs ? S.fs.total + step.total * S.bet : step.total * S.bet); }
  const ft = announcing ? null : new GoldText(420, 90, 54);
  if (ft) {
    showWin.label = ft;
    ft.text = money(amt);
    const top = GY + (M.MAX_ROWS - S.rows) * CELL;
    ft.position.set(sx / step.cells.length, Math.max(sy / step.cells.length, top + CELL * 1.5));
    ft.scale.set(0.3);
    fxLayer.addChild(ft);
    motion.tween(ft, { scale: 1 }, 400, ease.outBack)
      .then(() => motion.tween(ft, { y: ft.y - 70, alpha: 0 }, 700, ease.inQuad, 350))
      .then(() => { if (!ft.destroyed) ft.destroy(); });
  }

  // running tumble total on the right
  const total = S.fs ? S.fs.total + step.total * S.bet : step.total * S.bet;
  hud.tumble.text = money(total);
  motion.tween(hud.tumble, { alpha: 1 }, 200);
  motion.tween(hud.tumbleLbl, { alpha: 1 }, 200);
  const tb = hud.tumble.base ?? 1;
  hud.tumble.scale.set(1.25 * tb);
  motion.tween(hud.tumble, { scale: tb }, 450, ease.outElastic);
  setWinDisplay(total);

  await motion.wait(950);
}

async function doTumble(step) {
  play('explode');
  // explode winners
  const boom = step.removed.map(async ([c, r]) => {
    const box = cells[c][r];
    cells[c][r] = null;
    for (let k = 0; k < 7; k++) motion.emit({ texture: TX.spark, parent: fxLayer, x: box.x, y: box.y, vx: (Math.random() - 0.5) * 700, vy: (Math.random() - 0.5) * 700 - 120, gravity: 600, drag: 0.94, life: 650, scale: 1.3, endScale: 0.2, tint: 0xffd070, blend: 'add' });
    if (Math.random() < 0.35) motion.emit({ texture: TX.coin, parent: fxLayer, x: box.x, y: box.y, vx: (Math.random() - 0.5) * 400, vy: -300 - Math.random() * 300, gravity: 1600, life: 900, scale: 0.28, spin: (Math.random() - 0.5) * 12 });
    await motion.tween(box, { scale: 1.3 }, 90, ease.outQuad);
    await motion.tween(box, { scale: 0, alpha: 0 }, 160, ease.inQuad);
    box.destroy();
  });
  await Promise.all(boom);
  allCells().forEach((b) => motion.tween(b, { alpha: 1 }, 150));

  if (step.grew) {
    const y = cy(M.MAX_ROWS - step.rows);
    await breakPlank(M.MAX_ROWS - step.rows, step.rows);
    S.rows = step.rows;
    placeBadges();
    chargeMeter(y, step.meter);
    if (step.loot) plankLoot(step.loot, y, step.total);
  }
  S.rows = step.rows;
  if (step.grew && step.rows === M.MAX_ROWS) maxWaysCelebration();

  // survivors fall, fresh symbols drop in
  const next = cells.map(() => new Array(M.MAX_ROWS).fill(null));
  const jobs = [];
  for (let c = 0; c < M.COLS; c++) for (let r = 0; r < M.MAX_ROWS; r++) if (cells[c][r]) next[c][r] = cells[c][r];
  for (const mv of step.moves) {
    const box = cells[mv.c][mv.from];
    if (next[mv.c][mv.from] === box) next[mv.c][mv.from] = null;
    next[mv.c][mv.to] = box;
    jobs.push(motion.tween(box, { y: cy(mv.to) }, 300, (t) => ease.outBack(t, 1.2), mv.c * 40));
  }
  const freshCount = {};
  for (const f of step.fresh) {
    const box = makeCell(f.sym, f.c, f.r);
    next[f.c][f.r] = box;
    const n = (freshCount[f.c] = (freshCount[f.c] ?? 0) + 1);
    box.y = GY - n * CELL - 40;
    jobs.push(motion.tween(box, { y: cy(f.r) }, 380, (t) => ease.outBack(t, 1.1), 120 + f.c * 55));
  }
  cells = next;
  S.grid = step.grid;
  jobs.push(motion.wait(420).then(() => play('land', { rate: 1.1 })));
  await Promise.all(jobs);
}

async function breakPlank(r, rows) {
  const p = planks[r];
  const tex = p.sprite.texture;
  const half = (x0) => {
    const t = new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + x0, tex.frame.y, tex.frame.width / 2, tex.frame.height) });
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.width = (GW + 36) / 2;
    s.height = CELL * 1.08;
    s.tint = p.sprite.tint;
    s.position.set(GX + GW / 2 + (x0 ? GW / 4 : -GW / 4), p.y);
    fxLayer.addChild(s);
    return s;
  };
  p.visible = false;
  const L = half(0), R = half(tex.frame.width / 2);
  play('plank');
  doShake(12, 450);
  for (let k = 0; k < 30; k++) motion.emit({ texture: TX.chip, parent: fxLayer, x: GX + Math.random() * GW, y: p.y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 600, gravity: 2200, life: 1100, scale: 0.6 + Math.random() * 0.9, spin: (Math.random() - 0.5) * 20 });
  for (let k = 0; k < 16; k++) motion.emit({ texture: TX.spark, parent: fxLayer, x: GX + GW / 2 + (Math.random() - 0.5) * 80, y: p.y, vx: (Math.random() - 0.5) * 1200, vy: (Math.random() - 0.5) * 300, drag: 0.9, life: 500, scale: 1.4, endScale: 0.3, tint: 0xffe2a0, blend: 'add' });
  updateWays(rows);
  const fly = (s, dir) => {
    motion.tween(s, { x: s.x + dir * 420, rotation: dir * (0.8 + Math.random() * 0.6) }, 900, ease.outQuad);
    return motion.tween(s, { y: s.y + 700, alpha: 0 }, 900, ease.inQuad).then(() => { s.texture.destroy(); s.destroy(); });
  };
  // camera pulls back to reveal the next plank above
  const next = planks[r - 1];
  if (next) {
    next.visible = true;
    next.alpha = 0;
    motion.tween(next, { alpha: 1 }, 400, ease.outQuad, 150);
  }
  zoomTo(rows, 650);
  await Promise.race([fly(L, -1), fly(R, 1), motion.wait(300)]);
}

// a violet spark flies from the blasted plank into the meter
function chargeMeter(fromY, value) {
  const m = hud.meter;
  const target = m.toGlobal({ x: 0, y: 0 });
  const local = world.toLocal(target);
  for (let k = 0; k < 3; k++) {
    const s = new Sprite(TX.star);
    s.anchor.set(0.5);
    s.tint = 0xd070ff;
    s.blendMode = 'add';
    s.position.set(GX + GW / 2 + (k - 1) * 120, fromY);
    s.scale.set(0.9);
    fxLayer.addChild(s);
    motion.tween(s, { x: local.x, y: local.y, scale: 0.4 }, 550, ease.inOutCubic, k * 60).then(() => {
      s.destroy();
      if (k === 2) {
        setMeter(value);
        drawMeter(value);
        persist();
        if (hud.meter.full) play('scatterLand', { step: 3 });
      }
    });
  }
}

// loot hidden behind the plank: coins (instant win) or a Kraken eye (+2 meter)
function plankLoot(loot, y, total) {
  const cxm = GX + GW / 2;
  announce(async () => {
    const label = new GoldText(700, 120, loot.type === 'coin' ? 70 : 56, loot.type === 'coin' ? {} : { palette: 'white', glow: 'rgba(210,90,255,1)', stroke: '#1a0326' });
    label.text = loot.type === 'coin' ? `+${money(loot.x * S.bet)}` : L('kh.krakenEye');
    label.position.set(cxm, boardTop() + 70);
    label.scale.set(0.3);
    fxLayer.addChild(label);
    await motion.tween(label, { scale: 1 }, 380, ease.outBack);
    await motion.tween(label, { y: label.y - 60, alpha: 0 }, 550, ease.inQuad, 450);
    label.destroy();
  });
  if (loot.type === 'coin') {
    play('tierUp');
    for (let k = 0; k < 5; k++) setTimeout(() => play('coin'), k * 70);
    for (let k = 0; k < 26; k++) motion.emit({ texture: TX.coin, parent: fxLayer, x: cxm + (Math.random() - 0.5) * GW * 0.8, y, vx: (Math.random() - 0.5) * 600, vy: -400 - Math.random() * 500, gravity: 1700, life: 1300, scale: 0.22 + Math.random() * 0.2, spin: (Math.random() - 0.5) * 12 });
    const sum = S.fs ? S.fs.total + total * S.bet : total * S.bet;
    hud.tumble.text = money(sum);
    motion.tween(hud.tumble, { alpha: 1 }, 200);
    motion.tween(hud.tumbleLbl, { alpha: 1 }, 200);
    setWinDisplay(sum);
  } else {
    play('multUp', { mult: 6 });
    for (let k = 0; k < 20; k++) motion.emit({ texture: TX.spark, parent: fxLayer, x: cxm, y, vx: (Math.random() - 0.5) * 800, vy: (Math.random() - 0.5) * 500, drag: 0.92, life: 700, scale: 1.4, endScale: 0.2, tint: 0xd070ff, blend: 'add' });
  }
}

// Free spins start: two giant tentacles burst out of the sea behind the machine and stay
// swaying there for the whole storm.
async function krakenRises() {
  if (!TEX.kraken_tentacle_sea) return;
  const made = [-1, 1].map((side) => {
    const t = new Sprite(TEX.kraken_tentacle_sea);
    t.anchor.set(0.5, 1);
    const k = 700 / t.texture.height;
    t.scale.set(-side * k, k); // curls face the machine
    t.position.set(GX + GW / 2 + side * (GW / 2 + FRAME_SIDE + 45), BB + FRAME_BOTTOM + 800);
    t.tint = 0x9c8cb0; // pushed back into the storm so the HUD stays readable
    world.behind.addChild(t);
    return t;
  });
  world.behind.tentacles = made;
  await Promise.all(made.map((t, i) => motion.tween(t, { y: BB + FRAME_BOTTOM + 40 }, 1100, (v) => ease.outBack(v, 1.2), i * 250)));
}

function krakenSinks() {
  for (const t of world.behind.tentacles ?? []) motion.tween(t, { y: t.y + 800 }, 1200, ease.inQuad).then(() => t.destroy());
  world.behind.tentacles = null;
}

// all planks gone: the whole hold is open
function maxWaysCelebration() {
  return announce(() => maxWaysShow());
}

async function maxWaysShow() {
  play('tierUp');
  doShake(14, 700);
  const t = new GoldText(900, 150, 84);
  t.text = L('kh.maxWays', { n: (M.MAX_ROWS ** M.COLS).toLocaleString(locale) });
  t.position.set(GX + GW / 2, boardTop() + 70);
  t.scale.set(0.2);
  fxLayer.addChild(t);
  for (let k = 0; k < 40; k++) motion.emit({ texture: TX.coin, parent: fxLayer, x: GX + Math.random() * GW, y: boardTop() - 40, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 400, gravity: 1500, life: 1400, scale: 0.2 + Math.random() * 0.2, spin: (Math.random() - 0.5) * 10 });
  await motion.tween(t, { scale: 1 }, 600, ease.outElastic);
  await motion.wait(900);
  await motion.tween(t, { alpha: 0, y: t.y - 60 }, 400);
  t.destroy();
}

async function scatterCelebrate(step) {
  const top = M.MAX_ROWS - S.rows;
  for (let c = 0; c < M.COLS; c++) {
    const r = S.grid[c].indexOf('scatter', top);
    if (r >= 0) pulseSym(c, r);
  }
  play('scatterLand', { step: 4 });
  await motion.wait(1400);
}

// ---------------------------------------------------------------- flow
async function playSpin(res) {
  S.slam = false;
  const [first, ...rest] = res.steps;
  hideTumble();
  if (!S.fs) clearBadges(); // base game: Kraken reels only last one spin
  await dropOut();
  const changed = S.rows !== first.rows;
  S.rows = first.rows;
  await closePlanks(first.rows);
  if (changed) updateWays(first.rows);
  placeBadges();
  S.grid = first.grid;
  await dropIn(first.grid, first.rows);
  // A long cascade must never feel like a waiting room: from the fourth tumble on the
  // playback speeds up step by step (rare, but then it runs at up to 3.5x).
  const baseSpeed = motion.speed;
  let chain = 0;
  for (const step of rest) {
    if (step.t === 'tumble') motion.speed = baseSpeed * Math.min(3.5, 1 + Math.max(0, ++chain - 3) * 0.35);
    if (step.t === 'kraken') await krakenAttack(step);
    else if (step.t === 'wrath') await wrathAttack(step);
    else if (step.t === 'win') await showWin(step);
    else if (step.t === 'tumble') await doTumble(step);
    else if (step.t === 'scatter') await scatterCelebrate(step);
  }
  motion.speed = baseSpeed;
  await announceQueue; // queued messages finish before the win presentation starts
  // no plank blasted this spin → one slams shut again
  if (res.rows < res.endRows) await plankSlams(res.rows);
  S.rows = res.rows;
  setMeter(res.meter);
  drawMeter(getMeter(), false);
  persist();
}

async function plankSlams(rows) {
  const r = M.MAX_ROWS - rows - 1; // the top active row gets boarded up
  const doomed = cells.map((col) => col[r]).filter(Boolean);
  for (const c of cells) c[r] = null;
  await Promise.all(doomed.map((b) => motion.tween(b, { alpha: 0, scale: 0.6 }, 180).then(() => b.destroy())));
  setPlanks(rows);
  const p = planks[r];
  const y = p.y;
  p.y = y - 220;
  p.alpha = 0;
  p.rotation = -0.08;
  play('plank');
  await motion.tween(p, { y, alpha: 1, rotation: 0 }, 380, ease.outBounce);
  doShake(6, 250);
  S.rows = rows;
  updateWays(rows);
  placeBadges();
  await zoomTo(rows, 450);
}

function hideTumble() {
  motion.tween(hud.tumble, { alpha: 0 }, 200);
  motion.tween(hud.tumbleLbl, { alpha: 0 }, 200);
}

async function spinOnce() {
  if (S.busy) { slam(); return; }
  if (!wallet.take(S.bet)) { noFunds(); return; }
  S.busy = true;
  setBusy(true);
  setWinDisplay(0);
  play('spin');
  const bet = S.bet;
  // debug only: replay a pre-computed spin result (used to reproduce specific situations)
  const forced = window.KH?.forceNext;
  if (forced) window.KH.forceNext = null;
  const res = forced ?? M.spin({ free: false, rows: S.rows, meter: S.meter });
  await safePlay(res);
  S.capLeft = roundCap(bet);
  const win = takeFromCap(cents(res.x * bet));
  if (win > 0) {
    await presentWin(res.x, win);
    await creditWin(win);
  }
  let fsWin = 0;
  if (res.award) fsWin = await freeSpins(res.scatters);
  const islandWin = await sailOn(res, bet);
  S.ledger.push({ bet, win: win + fsWin + islandWin, balance: wallet.balance });
  motion.speed = S.turbo ? 1.9 : 1;
  S.busy = false;
  setBusy(false);
  if (S.auto > 0) {
    S.auto--;
    updateAuto();
    if (wallet.balance >= S.bet) setTimeout(spinOnce, 250);
    else { S.auto = 0; updateAuto(); }
  }
}

// The spin result is already decided by the math – if any animation step ever fails, show the
// final grid and carry on so the game can never lock up and every win is still paid.
async function safePlay(res) {
  try {
    await playSpin(res);
  } catch (err) {
    console.error('[kraken] animation failed, recovering', err);
    const last = [...res.steps].reverse().find((s) => s.grid);
    cells.flat().forEach((b) => b?.destroy());
    cells = cells.map(() => new Array(M.MAX_ROWS).fill(null));
    S.rows = last.rows ?? S.rows;
    setPlanks(S.rows);
    board.rows = viewRowsFor(S.rows);
    for (let c = 0; c < M.COLS; c++)
      for (let r = M.MAX_ROWS - S.rows; r < M.MAX_ROWS; r++) cells[c][r] = makeCell(last.grid[c][r], c, r);
    S.grid = last.grid;
    motion.speed = S.turbo ? 1.9 : 1;
  }
}

// Every win gets a presentation: Big/Mega/Epic from 15x, otherwise a total-win plate on the reels.
async function presentWin(x, amount) {
  if (x >= TIERS[0][1]) return maybeBigWin(x, amount);
  const prev = motion.speed;
  motion.speed = Math.min(prev, 1.9);
  play('win', { level: Math.min(8, Math.floor(Math.log2(1 + x * 4)) + 1) });
  const plate = new Container();
  plate.position.set(GX + GW / 2, (boardTop() + BB) / 2);
  const glow = new Sprite(TX.glow);
  glow.anchor.set(0.5);
  glow.scale.set(7, 2.6);
  glow.tint = 0x000000;
  glow.alpha = 0.75;
  const lbl = new GoldText(600, 70, 34, { palette: 'white', glow: 'rgba(255,190,80,.7)', stroke: '#1c0e02' });
  lbl.text = L('kh.totalWin');
  lbl.y = -62;
  const val = new GoldText(700, 150, 96);
  val.text = money(0);
  val.y = 20;
  plate.addChild(glow, lbl, val);
  plate.scale.set(0.4);
  plate.alpha = 0;
  fxLayer.addChild(plate);
  motion.tween(plate, { alpha: 1 }, 150);
  await motion.tween(plate, { scale: 1 }, 380, ease.outBack);
  const counter = { v: 0 };
  const dur = Math.min(400 + x * 120, 1600);
  const iv = setInterval(() => { val.text = money(counter.v); play('tick'); }, 60);
  await motion.tween(counter, { v: amount }, dur, ease.outQuad);
  clearInterval(iv);
  val.text = money(amount);
  val.scale.set(1.2);
  motion.tween(val, { scale: 1 }, 400, ease.outElastic);
  for (let k = 0; k < 24; k++) motion.emit({ texture: TX.star, parent: fxLayer, x: plate.x + (Math.random() - 0.5) * 500, y: plate.y + (Math.random() - 0.5) * 120, vx: (Math.random() - 0.5) * 200, vy: -60 - Math.random() * 120, life: 900, scale: 0.3 + Math.random() * 0.6, endScale: 0, blend: 'add' });
  await motion.wait(700);
  await motion.tween(plate, { alpha: 0, scale: 0.85 }, 250);
  plate.destroy({ children: true });
  motion.speed = prev;
}

// Coins fly from the reels into the balance, then the balance counts up.
async function creditWin(amount) {
  setWinDisplay(amount);
  const target = $('balance').getBoundingClientRect();
  const from = world.toGlobal({ x: GX + GW / 2, y: (boardTop() + BB) / 2 });
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
    // timer instead of anim.finished: finishes reliably even if the tab is hidden mid-flight
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

// Bonus buy: pay the measured fair price, then choose a storm like a natural 3-compass trigger.
async function buyBonus(price) {
  if (S.busy || S.fs) return;
  if (!wallet.take(price)) { noFunds(); return; }
  S.busy = true;
  setBusy(true);
  setWinDisplay(0);
  S.capLeft = roundCap(S.bet);
  let fsWin = 0;
  try {
    fsWin = await freeSpins(3);
  } finally {
    S.ledger.push({ bet: price, win: fsWin, balance: wallet.balance });
    motion.speed = S.turbo ? 1.9 : 1;
    S.busy = false;
    setBusy(false);
  }
}

// click during a spin → quick stop (like a real slot)
function slam() {
  if (S.slam) return;
  S.slam = true;
  motion.speed = Math.max(motion.speed, 4);
}

// The player picks one of three storms (equal average value, different risk – see math.js FS_OPTIONS).
function chooseStorm(scatters) {
  const el = $('storm-pick');
  el.querySelectorAll('.sp-spins').forEach((b) => {
    const o = M.FS_OPTIONS[b.dataset.k];
    b.textContent = o.base + o.perScatter * (Math.min(scatters, 6) - 3);
  });
  el.hidden = false;
  play('scatterLand', { step: 3 });
  return new Promise((resolve) => {
    el.querySelectorAll('.sp-card').forEach((c) => {
      c.onclick = () => { el.hidden = true; play('tierUp'); resolve(c.dataset.k); };
    });
  });
}

async function freeSpins(scatters) {
  const key = await chooseStorm(scatters);
  return freeSpinsRound(M.freeSpinSetup(key, scatters), L(`kh.opt.${key}`).toUpperCase());
}

/**
 * Play one free-spin round from a ready-made setup (storm choice, bonus buy or an island).
 * betOverride: island rounds pay on the average bet of the leg, not on the bet set right now.
 */
async function freeSpinsRound(setup, label, betOverride) {
  const bet = betOverride ?? S.bet;
  // the storm is played on a fresh 4-row deck with its own Wrath meter; the base deck
  // (open planks) and base meter are restored afterwards
  S.fs = { left: setup.spins, played: 0, total: 0, sticky: setup.sticky, meter: setup.meter, baseRows: S.rows };
  let rows = M.MIN_ROWS;
  clearBadges();
  krakenRises();
  await banner(L('kh.fsBanner', { n: setup.spins }), label, 'fsStart');
  stopLoop('music', 1.2);
  loop('musicStorm', { music: true });
  motion.tween(bgFree, { alpha: 1 }, 1500);
  lightningAt = performance.now() + 800;
  drawMeter(S.fs.meter, false);
  for (const k of setup.sticky) await addBadge(k.reel, k.mult); // Kraken-Jagd starts with a reel
  updateKrakenMulti();
  hud.fsCount.text = `0 / ${setup.spins}`;
  motion.tween(hud.fs, { alpha: 1 }, 500);

  while (S.fs.left > 0) {
    S.fs.left--;
    S.fs.played++;
    hud.fsCount.text = `${S.fs.played} / ${S.fs.played + S.fs.left}`;
    motion.speed = S.turbo ? 1.9 : 1;
    const res = M.spin({ free: true, rows, meter: S.fs.meter, sticky: S.fs.sticky });
    play('spin');
    await safePlay(res);
    rows = res.rows;
    S.fs.sticky = res.sticky;
    S.fs.total = cents(S.fs.total + res.x * bet);
    const cap = S.capLeft ?? roundCap(bet);
    if (S.fs.total >= cap) { S.fs.total = cap; S.fs.left = 0; }
    if (res.award) {
      S.fs.left += res.award;
      await banner(L('kh.fsMore', { n: res.award }), null, 'tierUp');
    }
    await motion.wait(350);
  }

  const total = takeFromCap(S.fs.total);
  const x = total / bet;
  if (x >= TIERS[0][1]) await maybeBigWin(x, total);
  else await banner(money(total), L('kh.fsWin', { n: S.fs.played }), 'win');
  if (total > 0) await creditWin(total);
  const baseRows = S.fs.baseRows;
  S.fs = null;
  drawMeter(S.meter, false); // back to the base-game Kraken meter
  krakenSinks();
  clearBadges();
  stopLoop('musicStorm', 1.2);
  loop('music', { music: true });
  motion.tween(bgFree, { alpha: 0 }, 1500);
  motion.tween(hud.fs, { alpha: 0 }, 500);
  hideTumble();

  // back on deck: restore the planks the player had blasted before the storm
  await dropOut();
  S.rows = baseRows;
  setPlanks(baseRows);
  updateWays(baseRows);
  await zoomTo(baseRows, 600);
  S.grid = M.freshGrid(baseRows, Math.random);
  await dropIn(S.grid, baseRows, false);
  persist();
  return total;
}

// ---------------------------------------------------------------- the voyage
/**
 * Sail on after a paid spin: add the nautical miles this spin earned and, when the chart's next
 * island is reached, play its chapter. Returns the island win (0 if no island was reached).
 */
async function sailOn(res, bet) {
  const gained = M.milesFor(res);
  const { voyage, arrived } = M.advanceVoyage(S.voyage, res, bet);
  if (gained > 0) play('voyageMile');
  S.voyage = voyage;
  drawVoyage(gained > 0);
  persist();
  if (!arrived) return 0;

  const island = M.ISLANDS[arrived.island];
  const bonusBet = cents(arrived.avgBet); // paid on the average bet of this leg – late bet changes gain nothing
  await banner(L(`kh.island.${island.key}`).toUpperCase(), L(`kh.islandStory.${island.key}`), 'island');
  let win = 0;
  if (island.reward.type === 'pick') {
    win = await chestPick(island.reward.scale, bonusBet);
  } else {
    win = await freeSpinsRound(M.islandFreeSpins(island.reward), L(`kh.island.${island.key}`).toUpperCase(), bonusBet);
  }
  if (arrived.island === M.ISLANDS.length - 1) await banner(L('kh.voyageDone', { n: S.voyage.voyage }), L('kh.voyageNext'), 'tierUp');
  drawVoyage(false);
  persist();
  return win;
}

/** Treasure pick: nine chests, the player opens three. Values were drawn by the math up front. */
async function chestPick(scale, bonusBet) {
  const { chests } = M.chestBonus(scale);
  stopLoop('music', 1.2);
  loop('musicStorm', { music: true });
  const d = dimmer();
  motion.tween(d, { alpha: 0.72 }, 300);
  const box = centerBox();
  const title = new GoldText(900, 110, 60);
  title.text = L('kh.chestTitle');
  title.y = -330;
  const sub = new GoldText(800, 70, 30, { palette: 'white', glow: 'rgba(0,0,0,.8)', stroke: '#04121c' });
  sub.y = -250;
  const totalTxt = new GoldText(700, 120, 68);
  totalTxt.y = 320;
  totalTxt.alpha = 0;
  box.addChild(title, sub, totalTxt);

  let picks = M.CHEST_PICKS, total = 0, next = 0;
  const updateSub = () => { sub.text = L('kh.chestPicks', { n: picks }); };
  updateSub();

  const opened = [];
  await new Promise((resolve) => {
    for (let i = 0; i < M.CHESTS; i++) {
      const c = new Container();
      c.position.set((i % 3 - 1) * 250, Math.floor(i / 3) * 210 - 60);
      const img = new Sprite(TEX.sym_chest);
      img.anchor.set(0.5);
      img.scale.set(190 / img.texture.width);
      c.addChild(img);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (!c.eventMode || picks <= 0) return;
        c.eventMode = 'none';
        c.cursor = 'default';
        const value = chests[next++];
        total = Math.min(cents(total + value * bonusBet), S.capLeft ?? Infinity);
        picks--;
        updateSub();
        play(value * bonusBet >= bonusBet * 10 ? 'chestBig' : 'chestOpen');
        const val = new GoldText(300, 90, 52);
        val.text = money(cents(value * bonusBet));
        val.y = -10;
        c.addChild(val);
        val.scale.set(0.3);
        motion.tween(val, { scale: 1 }, 400, ease.outBack);
        motion.tween(img, { alpha: 0.35 }, 300);
        for (let k = 0; k < 10; k++) motion.emit({ texture: TX.coin, parent: box, x: c.x, y: c.y, vx: (Math.random() - 0.5) * 520, vy: -260 - Math.random() * 420, gravity: 1500, life: 900, scale: 0.3, spin: (Math.random() - 0.5) * 12 });
        if (picks === 0) {
          totalTxt.text = money(total);
          motion.tween(totalTxt, { alpha: 1 }, 300);
          // reveal what the other chests held – all values were drawn before the first pick
          for (const o of opened) {
            if (o.eventMode === 'none') continue;
            const v = new GoldText(300, 90, 40, { palette: 'white', glow: 'rgba(0,0,0,.7)', stroke: '#04121c' });
            v.text = money(cents(chests[next++] * bonusBet));
            v.alpha = 0.7;
            o.addChild(v);
            o.eventMode = 'none';
            motion.tween(o, { alpha: 0.55 }, 300);
          }
          motion.wait(1600).then(resolve);
        }
      });
      opened.push(c);
      box.addChild(c);
    }
  });
  await fadeOverlay(d, box);
  total = takeFromCap(total);
  if (total > 0) await creditWin(total);
  stopLoop('musicStorm', 1.2);
  loop('music', { music: true });
  return total;
}

function fadeOverlay(d, box) {
  return Promise.all([motion.tween(d, { alpha: 0 }, 350), motion.tween(box, { alpha: 0 }, 350)])
    .then(() => { d.destroy(); box.destroy({ children: true }); });
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

async function banner(title, sub, sound) {
  play(sound);
  const d = dimmer();
  const box = centerBox();
  const t = new GoldText(1400, 220, 130);
  t.text = title;
  box.addChild(t);
  if (sub) {
    const st = new GoldText(1200, 90, 44, { palette: 'white', glow: 'rgba(120,200,255,.7)', stroke: '#06101c' });
    st.text = sub;
    st.y = 130;
    box.addChild(st);
  }
  box.alpha = 0;
  t.scale.set(0.3);
  motion.tween(d, { alpha: 0.6 }, 300);
  motion.tween(box, { alpha: 1 }, 250);
  await motion.tween(t, { scale: 1 }, 700, ease.outElastic);
  for (let k = 0; k < 40; k++) motion.emit({ texture: TX.star, parent: box, x: (Math.random() - 0.5) * 1000, y: (Math.random() - 0.5) * 200, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 1200, scale: 0.4 + Math.random() * 0.8, endScale: 0, blend: 'add' });
  await Promise.race([motion.wait(1800), clickOnce(d)]);
  motion.tween(d, { alpha: 0 }, 300);
  await motion.tween(box, { alpha: 0 }, 300);
  d.destroy();
  box.destroy({ children: true });
}

const clickOnce = (target) => new Promise((res) => target.once('pointertap', res));

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
  rays.tint = 0xffb030;
  rays.blendMode = 'add';
  rays.alpha = 0;
  const logo = new Sprite(TEX[`win_${reached[0][0]}`]);
  logo.anchor.set(0.5);
  logo.y = -110;
  const fit = 820 / logo.texture.width;
  logo.scale.set(0.1);
  const counter = new GoldText(1100, 180, 120);
  counter.text = money(0);
  counter.y = 240;
  box.addChild(rays, logo, counter);
  motion.tween(d, { alpha: 0.72 }, 300);
  motion.tween(rays, { alpha: 0.55 }, 600);
  motion.tween(logo, { scale: fit }, 800, ease.outElastic);
  doShake(8, 600);

  let skip = false;
  d.on('pointertap', () => (skip = true));
  const dur = 2500 + reached.length * 2200;
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
        logo.texture = TEX[`win_${reached[tier][0]}`];
        logo.scale.set(fit * 1.5);
        motion.tween(logo, { scale: fit }, 600, ease.outElastic);
        play('tierUp');
        doShake(12, 500);
      }
      coinAcc += tk.deltaMS;
      while (coinAcc > 28) {
        coinAcc -= 28;
        motion.emit({ texture: TX.coin, parent: box, x: (Math.random() - 0.5) * 1800, y: -650, vx: (Math.random() - 0.5) * 200, vy: 200 + Math.random() * 300, gravity: 1400, life: 1600, scale: 0.25 + Math.random() * 0.25, spin: (Math.random() - 0.5) * 10 });
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
  await Promise.race([motion.wait(2600), new Promise((r) => { const iv = setInterval(() => skip && (clearInterval(iv), r()), 50); })]);
  motion.tween(d, { alpha: 0 }, 400);
  await motion.tween(box, { alpha: 0 }, 400);
  d.destroy();
  box.destroy({ children: true });
  motion.speed = prevSpeed;
}

// ---------------------------------------------------------------- DOM UI
function buildUI() {
  // balance counts up on credits, snaps on debits
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
  $('win').textContent = money(0); // markup placeholder is German-formatted
  $('bet-minus').onclick = () => changeBet(-1);
  $('bet-plus').onclick = () => changeBet(1);
  $('spin').onclick = () => { play('click'); spinOnce(); };
  $('turbo').classList.toggle('on', S.turbo);
  $('turbo').onclick = () => {
    S.turbo = !S.turbo;
    localStorage.setItem('kh.turbo', S.turbo ? '1' : '0');
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
  // background music: on/off + volume in a touch-friendly panel; effects and bonus music are not affected
  mountMusicControl($('music'), sfx);
  $('info').onclick = () => { play('click'); renderPaytable(); $('paytable').hidden = false; };
  $('pt-close').onclick = () => ($('paytable').hidden = true);
  $('refill').onclick = () => { wallet.refill(); play('coin'); };
  // bonus buy: price = measured average free-spin value / 0.96 (scripts/sim-kraken-fs.js)
  const price = () => cents(BUY_PRICE_X * S.bet);
  const showPrice = () => { $('buy-price').textContent = money(price()); $('buy-price-2').textContent = money(price()); };
  showPrice();
  $('bet-plus').addEventListener('click', showPrice);
  $('bet-minus').addEventListener('click', showPrice);
  $('buy').onclick = () => { if (S.busy || S.fs) return; play('click'); showPrice(); $('buy-confirm').hidden = false; };
  $('buy-no').onclick = () => { $('buy-confirm').hidden = true; };
  $('buy-yes').onclick = () => { $('buy-confirm').hidden = true; buyBonus(price()); };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && $('paytable').hidden) { e.preventDefault(); spinOnce(); }
  });
}

function changeBet(dir) {
  if (S.busy || S.fs) return;
  const i = Math.max(0, Math.min(BETS.length - 1, BETS.indexOf(S.bet) + dir));
  S.bet = BETS[i];
  localStorage.setItem('kh.bet', String(S.bet));
  $('bet').textContent = money(S.bet);
  play('click');
}

function setBusy(b) {
  document.body.classList.toggle('busy', b);
}

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
    const pays = M.SYMBOLS[s].pays.map((p, i) => `<span><b>${i + 3}×</b> ${money(p * M.TUNING.payScale * M.rowFactor(S.rows) * S.bet)}</span>`).join('');
    return `<div class="pt-row"><img src="${BASE}sym_${s}.webp" alt=""><div class="pt-pays">${pays}</div></div>`;
  }).join('');
  $('pt-symbols').innerHTML = rows;
  $('pt-bet').textContent = money(S.bet);
}
