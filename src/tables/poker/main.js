// Texas Hold'em (vs. 5 AI) + "Kush or Better" video poker — Haze Kings Lounge.
// Pure, node-tested logic: ./evaluator.js, ./holdem.js, ./ai.js, ./videopoker.js.
// This file is presentation only: Pixi scene + DOM controls from ../lounge.css.
import { Application, Assets, Container, Sprite, Graphics, Text, Texture } from 'pixi.js';
import { guardRenderGroups } from '../../shared/pixi-guard.js';
import { Motion, ease } from '../../shared/motion.js';
import { lang, tr } from '../../shared/i18n.js';
import '../i18n.js';
import { wallet, money } from '../../shared/wallet.js';
import { GoldText, plaqueText } from '../../games/krakens-hoard/textures.js';
import { setupEmbedViewport, requestFullscreenIfStandalone, blurredTexture } from '../kit/embed.js';
import { buildCardTextures, CardView } from '../kit/cards.js';
import { chipBreakdown } from '../kit/chips.js';
import { shuffle } from '../kit/deck.js';
import { evaluate5, evaluateBest, cardRank, cardSuit, fullDeck } from './evaluator.js';
import { Table, Player, BUY_IN, BIG_BLIND } from './holdem.js';
import { PERSONALITIES } from './ai.js';
import { payoutFor, solveBestHold } from './videopoker.js';
import { sfx, play, loop } from './sfx.js';
import { mountMusicControl } from '../../shared/music-control.js';

const $ = (id) => document.getElementById(id);
const TBASE = `${import.meta.env.BASE_URL}assets/tables/`;
const PBASE = `${import.meta.env.BASE_URL}assets/poker/`;
const DEBUG = new URLSearchParams(location.search).has('debug');
const cents = (v) => Math.round(v * 100) / 100;
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; // fair shuffles

const HAND_DE = lang === 'de'
  ? ['Höchste Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush', 'Royal Flush']
  : ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
const SUIT = ['S', 'H', 'D', 'C'];
const RANK = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const toKit = (id) => ({ rank: RANK[cardRank(id)], suit: SUIT[cardSuit(id)], id });

const AI = [
  { key: 'kingpin', name: 'The Kingpin', avatar: 'avatar_shark', color: 0xd9b45c },
  { key: 'luckyMary', name: 'Lucky Mary', avatar: 'avatar_lucky', color: 0xff79b8 },
  { key: 'blaze', name: 'Blaze', avatar: 'avatar_maverick', color: 0xff8a3d },
  { key: 'drKush', name: 'Dr. Kush', avatar: 'avatar_professor', color: 0x4dff9a },
  { key: 'couchRookie', name: 'Couch Rookie', avatar: 'avatar_rookie', color: 0x9aa4ff },
];
const SPEEDS = [{ label: tr('Normal', 'Normal'), ms: 850 }, { label: tr('Schnell', 'Fast'), ms: 380 }, { label: 'Turbo', ms: 140 }];

const S = {
  mode: 'holdem', seated: false, inHand: false, wantLeave: false, speed: Number(localStorage.getItem('pk.speed')) || 0,
  start: 0, ledger: [], // { type, out, in } – out = taken from wallet, in = paid to wallet
  vp: { coins: 5, hand: [], deck: [], holds: [0, 0, 0, 0, 0], phase: 'idle', lastWin: 0 },
};

let app, motion, atlas, TEX, table, human;
let holdemWorld, vpWorld, fx, tableSprite, potPill, dealerBtn, boardLayer;
let seats = []; // seat views, index = table seat
let pending = null; // human decision { resolve, state }
const L = {};
let streetStart = new Map(); // player.id -> committedThisHand at the start of the street
let vpCards = [];

boot();

async function boot() {
  const bar = $('load-bar');
  await Promise.all(['900 20px Montserrat', '800 20px Montserrat', '800 40px Cinzel'].map((f) => document.fonts.load(f).catch(() => {})));
  const IMAGES = {
    bg_room: `${TBASE}bg_room.webp`, card_back: `${TBASE}card_back.webp`,
    court_J: `${TBASE}court_J.webp`, court_Q: `${TBASE}court_Q.webp`, court_K: `${TBASE}court_K.webp`,
    table_poker: `${PBASE}table_poker.webp`, dealer_button: `${PBASE}dealer_button.webp`, logo_videopoker: `${PBASE}logo_videopoker.webp`,
    win_royal: `${PBASE}win_royal.webp`, avatar_player: `${PBASE}avatar_player.webp`,
    ...Object.fromEntries(AI.map((a) => [a.avatar, `${PBASE}${a.avatar}.webp`])),
    ...Object.fromEntries([1, 5, 25, 100, 420, 1000].map((c) => [`chip_${c}`, `${TBASE}chip_${c}.webp`])),
  };
  for (const [alias, src] of Object.entries(IMAGES)) Assets.add({ alias, src });
  TEX = await Assets.load(Object.keys(IMAGES), (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  $('load-text').textContent = tr('Die Lounge ist bereit', 'The lounge is ready');
  $('load-start').hidden = false;
  $('load-start').onclick = async () => {
    requestFullscreenIfStandalone();
    await sfx.unlock();
    play('click');
    $('loader').classList.add('gone');
    setTimeout(() => $('loader').remove(), 800);
    await start();
  };
}

async function start() {
  setupEmbedViewport();
  app = new Application();
  await app.init({ resizeTo: $('stage'), antialias: true, backgroundColor: 0x020806, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  guardRenderGroups(app);
  $('stage').appendChild(app.canvas);
  motion = new Motion(app.ticker);
  atlas = buildCardTextures({ court_J: TEX.court_J.source.resource, court_Q: TEX.court_Q.source.resource, court_K: TEX.court_K.source.resource, card_back: TEX.card_back.source.resource });
  S.start = wallet.balance;
  buildScene();
  buildUI();
  $('topbar').hidden = false;
  app.renderer.on('resize', layout);
  for (const id of ['dock-holdem', 'dock-vp', 'topbar']) new ResizeObserver(layout).observe($(id));
  setMode('holdem');
  loop('music');
  if (DEBUG) {
    window.PK = {
      S, motion, audit, get table() { return table; }, get fx() { return fx; }, sit, leave, vpDeal,
      async run(ms, step = 16) { let t = performance.now(); for (let i = 0; i < ms / step; i++) { t += step; app.ticker.update(t); for (let k = 0; k < 4; k++) await Promise.resolve(); } },
      act: (a, amt) => humanAct(a, amt), get pending() { return pending; },
    };
  }
}

// ---------------------------------------------------------------- scene
function featherTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 342;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 171, 70, 256, 171, 270);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.66, 'rgba(255,255,255,1)');
  r.addColorStop(0.9, 'rgba(255,255,255,.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 342);
  return Texture.from(c);
}

function buildScene() {
  const bg = new Sprite(blurredTexture(TEX.bg_room.source.resource, Texture));
  bg.anchor.set(0.5);
  const dim = new Sprite(Texture.WHITE);
  dim.tint = 0x020806;
  dim.alpha = 0.6;
  app.stage.addChild(bg, dim);
  Object.assign(L, { bg, dim });

  // ---- Hold'em
  holdemWorld = new Container();
  app.stage.addChild(holdemWorld);
  tableSprite = new Sprite(TEX.table_poker);
  tableSprite.anchor.set(0.5);
  const mask = new Sprite(featherTexture());
  mask.anchor.set(0.5);
  mask.width = tableSprite.texture.width;
  mask.height = tableSprite.texture.height;
  tableSprite.addChild(mask);
  tableSprite.mask = mask;
  holdemWorld.addChild(tableSprite);

  boardLayer = new Container();
  potPill = pill(26);
  dealerBtn = new Sprite(TEX.dealer_button);
  dealerBtn.anchor.set(0.5);
  dealerBtn.visible = false;
  holdemWorld.addChild(boardLayer, potPill, dealerBtn);

  seats = [];
  const metas = [{ name: tr('Du', 'You'), avatar: 'avatar_player', color: 0x4dff9a, human: true }, ...AI];
  metas.forEach((m, i) => seats.push(makeSeat(i, m)));

  // ---- Video poker
  vpWorld = new Container();
  vpWorld.visible = false;
  app.stage.addChild(vpWorld);
  const logo = new Sprite(TEX.logo_videopoker);
  logo.anchor.set(0.5);
  vpWorld.addChild(logo);
  vpWorld.logo = logo;
  vpCards = [];
  for (let i = 0; i < 5; i++) {
    const cv = new CardView({ rank: 'A', suit: 'S' }, atlas);
    cv.eventMode = 'static';
    cv.cursor = 'pointer';
    cv.on('pointertap', () => toggleHold(i));
    const hold = pill(22);
    hold.set(tr('HALTEN', 'HELD'), 'gold');
    hold.visible = false;
    vpWorld.addChild(cv, hold);
    cv.hold = hold;
    vpCards.push(cv);
  }

  fx = new Container();
  app.stage.addChild(fx);
}

// rounded label (pot, bets, bubbles, hold tags)
function pill(size = 24) {
  const p = new Container();
  p.bg = new Graphics();
  p.txt = new Text({ text: '', style: { fontFamily: 'Montserrat', fontWeight: '900', fontSize: size, fill: 0xffffff } });
  p.txt.anchor.set(0.5);
  p.addChild(p.bg, p.txt);
  p.set = (text, kind = 'dark') => {
    p.txt.text = text;
    const c = { dark: [0x06140e, 0xd9b45c, 0xffffff], gold: [0xf2c350, 0xfff1c0, 0x2b1403], green: [0x0b3d24, 0x4dff9a, 0xd8ffe8], red: [0x3a0808, 0xff6a6a, 0xffe0e0], blue: [0x10203a, 0x8fb4ff, 0xe0ebff] }[kind];
    const w = p.txt.width + size * 1.2, h = size * 1.75;
    p.bg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: c[0], alpha: 0.94 }).stroke({ width: 2.5, color: c[1] });
    p.txt.style.fill = c[2];
  };
  return p;
}

function makeSeat(i, meta) {
  const c = new Container();
  const glow = new Graphics();
  const timer = new Graphics();
  const photo = new Sprite(TEX[meta.avatar]);
  photo.anchor.set(0.5);
  const pmask = new Graphics();
  photo.mask = pmask;
  const ring = new Graphics();
  const plate = new Container();
  const plateBg = new Graphics();
  const name = new Text({ text: meta.name, style: { fontFamily: 'Montserrat', fontWeight: '800', fontSize: 17, fill: 0xf3e6c4 } });
  const stack = new Text({ text: '', style: { fontFamily: 'Montserrat', fontWeight: '900', fontSize: 19, fill: 0x4dff9a } });
  name.anchor.set(0.5); stack.anchor.set(0.5);
  plate.addChild(plateBg, name, stack);
  const bubble = pill(18);
  bubble.visible = false;
  const cards = new Container();
  const bet = new Container();
  const betChips = new Container();
  const betTxt = pill(15);
  bet.addChild(betChips, betTxt);
  bet.visible = false;
  c.addChild(glow, timer, photo, pmask, ring, plate, bubble);
  holdemWorld.addChild(bet, cards, c);
  return { i, meta, c, glow, timer, photo, pmask, ring, plate, plateBg, name, stack, bubble, cards, bet, betChips, betTxt, views: [], player: null, R: 40 };
}

// ---------------------------------------------------------------- layout
function layout() {
  if (!app) return;
  const sw = app.screen.width, sh = app.screen.height;
  const top = $('topbar').offsetHeight || 70;
  const dock = S.mode === 'holdem' ? $('dock-holdem') : $('dock-vp');
  const bottom = dock.offsetHeight || 140;
  const aw = sw, ah = Math.max(220, sh - top - bottom);
  const portrait = aw / ah < 1;
  Object.assign(L, { sw, sh, top, ah, aw, portrait });
  L.bg.scale.set(Math.max(sw / L.bg.texture.width, sh / L.bg.texture.height));
  L.bg.position.set(sw / 2, sh / 2);
  L.dim.width = sw; L.dim.height = sh;
  layoutHoldem();
  layoutVP();
}

function layoutHoldem() {
  const { aw, ah, top, portrait } = L;
  const low = !portrait && ah < 420; // phones held sideways: very little height
  const C = { x: aw / 2, y: top + ah * (low ? 0.53 : 0.48) };
  const rx = portrait ? aw * 0.36 : Math.min(aw * 0.38, ah * 0.95);
  const ry = portrait ? ah * 0.36 : ah * 0.34;
  Object.assign(L, { C, rx, ry });

  // table art: its oval is ~66% of the image width; rotated upright on portrait screens
  const tw = TEX.table_poker.width;
  tableSprite.rotation = portrait ? Math.PI / 2 : 0;
  tableSprite.scale.set(((portrait ? ry : rx) * 2) / (tw * 0.64));
  tableSprite.position.set(C.x, C.y);

  const R = Math.max(24, Math.min(54, Math.min(aw, ah) * (portrait ? 0.07 : 0.06)));
  L.R = R;
  L.cw = portrait ? Math.min(aw * 0.13, ah * 0.075) : Math.min(aw * 0.05, ah * 0.1); // community card width
  L.cs = L.cw / atlas.width;

  seats.forEach((sv, i) => {
    const a = Math.PI / 2 + i * (Math.PI / 3);
    let x = C.x + Math.cos(a) * rx * 1.08, y = C.y + Math.sin(a) * ry * 1.1;
    x = Math.min(Math.max(x, R + 12), aw - R - 12);
    y = Math.min(Math.max(y, top + R + 10), top + ah - R - 34);
    sv.R = R;
    sv.c.position.set(x, y);
    sv.photo.scale.set((R * 2.1) / sv.photo.texture.width);
    sv.pmask.clear().circle(0, 0, R).fill(0xffffff);
    sv.ring.clear().circle(0, 0, R + 2).stroke({ width: Math.max(3, R * 0.09), color: 0xd9b45c });
    const pw = Math.max(R * 2.9, 110), ph = R * 0.95;
    sv.plate.position.set(0, R + ph * 0.45);
    sv.plateBg.clear().roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2).fill({ color: 0x03100a, alpha: 0.9 }).stroke({ width: 2, color: 0xd9b45c, alpha: 0.7 });
    sv.name.style.fontSize = Math.max(11, R * 0.3);
    sv.stack.style.fontSize = Math.max(12, R * 0.34);
    sv.name.y = -ph * 0.2;
    sv.stack.y = ph * 0.22;
    sv.bubble.position.set(0, -R - 20);
    sv.bubble.scale.set(Math.max(0.7, R / 50));
    // bets and cards sit between the seat and the table centre
    const t = (k) => ({ x: x + (C.x - x) * k, y: y + (C.y - y) * k });
    const b = t(i === 0 ? 0.36 : 0.4);
    sv.bet.position.set(b.x, b.y);
    sv.bet.scale.set(Math.max(0.7, R / 48));
    const cp = i === 0 ? { x: x + R * 2.35, y: y - R * 0.2 } : t(0.2);
    sv.cards.position.set(cp.x, cp.y);
    sv.cardScale = L.cs * (i === 0 ? 1.25 : 0.62);
    sv.views.forEach((cv, k) => { cv.scale.set(sv.cardScale); cv.position.set((k - 0.5) * atlas.width * sv.cardScale * (i === 0 ? 0.62 : 0.45), 0); cv.rotation = (k - 0.5) * (i === 0 ? 0.08 : 0.12); });
  });
  // human seat: keep avatar + big cards centered as a group
  const hs = seats[0];
  if (hs) {
    const groupW = hs.R * 2 + atlas.width * hs.cardScale * 1.6;
    hs.c.x = C.x - groupW / 2 + hs.R;
    hs.cards.x = hs.c.x + hs.R + atlas.width * hs.cardScale * 0.95;
  }

  placeBoard(false);
  const b0 = boardSpot(2);
  potPill.scale.set(Math.max(0.75, L.R / 48));
  if (low) {
    // no room above the board (top seat): the pot sits in the gap between the community cards and your seat
    potPill.position.set(C.x, b0.y + (atlas.height * b0.s) / 2 + 6 + 16 * potPill.scale.y);
  } else potPill.position.set(C.x, b0.y - atlas.height * b0.s * 0.5 - (portrait ? ry * 0.22 : 26 * Math.max(0.8, L.R / 48)));
  dealerBtn.scale.set((L.R * 0.7) / dealerBtn.texture.width);
  placeDealerButton();
}

// community cards: on landscape tables they sit exactly on the card slots printed on the felt
// (texture px relative to the table centre, measured from table_poker.webp: slots at ±110 / ±192, row at −54, 61 px wide;
// the middle card covers the centrepiece). Portrait rotates the table, so the board is simply centred there.
const SLOT_X = [-192, -110, 0, 110, 192], SLOT_Y = -54, SLOT_W = 61;
function boardSpot(i) {
  if (L.portrait) return { x: L.C.x + (i - 2) * atlas.width * L.cs * 1.1, y: L.C.y, s: L.cs };
  const k = tableSprite.scale.x;
  return { x: L.C.x + SLOT_X[i] * k, y: L.C.y + SLOT_Y * k, s: (SLOT_W * k * 1.1) / atlas.width };
}

function placeBoard(animate) {
  boardLayer.children.forEach((cv, i) => {
    const { x, y, s } = boardSpot(i);
    cv.scale.set(s);
    if (animate) motion.tween(cv, { x, y }, 250, ease.outCubic); else cv.position.set(x, y);
  });
}

function placeDealerButton() {
  if (!table || table.buttonSeat < 0) { dealerBtn.visible = false; return; }
  const sv = seats[table.buttonSeat];
  const p = sv.c.position;
  dealerBtn.visible = true;
  dealerBtn.position.set(p.x + (L.C.x - p.x) * 0.22 + L.R * 0.8, p.y + (L.C.y - p.y) * 0.22);
}

function layoutVP() {
  const { aw, ah, top, portrait } = L;
  const ptVisible = !$('vp-paytable').hidden;
  const ptRect = ptVisible ? $('vp-paytable').getBoundingClientRect() : null;
  const sideRoom = ptVisible && !portrait && aw > 900 ? ptRect.width + 30 : 0;
  const usableW = aw - sideRoom;
  const cx = usableW / 2;
  const topFree = portrait && ptRect ? ptRect.bottom - (app.canvas.getBoundingClientRect().top) + 10 : top;
  const cw = Math.min(usableW / 5.9, (ah - (topFree - top)) * 0.42 * (atlas.width / atlas.height) * 1.6, 210);
  const cs = cw / atlas.width;
  const ch = atlas.height * cs;
  const logo = vpWorld.logo;
  const room = (top + ah) - topFree;
  const logoH = Math.min(room * 0.26, 170);
  logo.visible = logoH > 60;
  logo.scale.set(Math.min(logoH / logo.texture.height, (usableW * 0.7) / logo.texture.width));
  // logo + cards + HOLD pills as one group, vertically centred in the free space
  const off = Math.max(0, (room - ((logo.visible ? logoH + 16 : 10) + ch + 80)) / 2);
  logo.position.set(cx, topFree + off + logoH / 2 + 6);
  const cardsY = (logo.visible ? topFree + logoH + 16 : topFree + 10) + off + ch / 2 + 10;
  L.vp = { cx, cardsY, cs, ch };
  vpCards.forEach((cv, i) => {
    cv.scale.set(cs);
    cv.position.set(cx + (i - 2) * cw * 1.08, cardsY);
    cv.hold.position.set(cv.x, cardsY + ch / 2 + 26 * Math.max(0.7, cs * 2));
    cv.hold.scale.set(Math.max(0.7, cs * 2.2));
  });
}

// ---------------------------------------------------------------- mode switching
function setMode(mode) {
  if (mode !== S.mode && S.seated) { hint(tr('Erst aufstehen, dann wechseln.', 'Leave the table first, then switch.')); play('error'); return; }
  S.mode = mode;
  holdemWorld.visible = mode === 'holdem';
  vpWorld.visible = mode === 'vp';
  $('dock-holdem').hidden = mode !== 'holdem';
  $('dock-vp').hidden = mode !== 'vp';
  $('vp-paytable').hidden = mode !== 'vp';
  $('tab-holdem').classList.toggle('on', mode === 'holdem');
  $('tab-vp').classList.toggle('on', mode === 'vp');
  if (mode === 'vp') buildPaytable();
  refreshStats();
  layout();
  requestAnimationFrame(layout); // again once the new dock has its final height
}

function refreshStats() {
  if (S.mode === 'holdem') {
    $('stat-2-lbl').textContent = tr('Am Tisch', 'At table');
    $('stat-2-val').textContent = S.seated ? money(human.stack) : '–';
    $('stat-3-lbl').textContent = 'Pot';
    $('stat-3-val').textContent = S.inHand && potPill.visible ? money(currentPot()) : '–';
  } else {
    $('stat-2-lbl').textContent = tr('Einsatz', 'Bet');
    $('stat-2-val').textContent = money(S.vp.coins);
    $('stat-3-lbl').textContent = tr('Gewinn', 'Win');
    $('stat-3-val').textContent = S.vp.lastWin ? `+${money(S.vp.lastWin)}` : '–';
  }
}

function hint(t) {
  $(S.mode === 'holdem' ? 'hd-hint' : 'vp-msg').textContent = t;
}

// ==================================================================
// HOLD'EM
// ==================================================================
function sit() {
  if (S.seated) return;
  table = new Table(cryptoRandom);
  human = new Player('human', tr('Du', 'You'));
  if (!table.seatPlayer(human, 0)) { hint(tr(`Nicht genug Guthaben – ${money(BUY_IN)} nötig.`, `Not enough balance – ${money(BUY_IN)} needed.`)); play('error'); table = null; return; }
  S.ledger.push({ type: 'buyin', out: BUY_IN, in: 0 });
  AI.forEach((m, k) => { const p = new Player(m.key, m.name); p.stack = BUY_IN; p.seat = k + 1; table.seats[k + 1] = p; });
  seats.forEach((sv, i) => { sv.player = table.seats[i]; });
  S.seated = true;
  S.wantLeave = false;
  $('hd-sit').hidden = true;
  $('hd-leave').hidden = false;
  refreshSeats();
  refreshStats();
  play('chip');
  handsLoop();
}

function leave() {
  if (!S.seated) return;
  if (S.inHand) { S.wantLeave = true; hint(tr('Du stehst nach dieser Hand auf.', 'You will leave after this hand.')); return; }
  const back = human.cashOut();
  S.ledger.push({ type: 'cashout', out: 0, in: back });
  S.seated = false;
  table = null;
  seats.forEach((sv) => { sv.player = null; clearSeatCards(sv); sv.bet.visible = false; });
  boardLayer.removeChildren().forEach((c) => c.destroy());
  dealerBtn.visible = false;
  potPill.visible = false;
  $('hd-sit').hidden = false;
  $('hd-leave').hidden = true;
  showDock('idle');
  refreshSeats();
  refreshStats();
  hint(back > 0
    ? tr(`Du bist aufgestanden – ${money(back)} gutgeschrieben.`, `You left the table – ${money(back)} returned to your balance.`)
    : tr('Keine Chips mehr – setz dich neu an den Tisch.', 'Out of chips – take a seat again to play on.'));
}

function refreshSeats() {
  seats.forEach((sv) => {
    const p = sv.player;
    sv.c.alpha = !p ? 0.35 : p.folded && S.inHand ? 0.5 : 1;
    sv.stack.text = p ? money(p.stack) : sv.meta.human ? 'frei' : '';
  });
}

function clearSeatCards(sv) {
  sv.views.forEach((cv) => cv.destroy());
  sv.views = [];
}

function currentPot() {
  return table ? table.seats.filter(Boolean).reduce((a, p) => a + p.committedThisHand, 0) : 0;
}

let loopId = 0;
async function handsLoop() {
  // leave + re-sit within the pause between hands must never leave two loops running on one table
  const me = ++loopId;
  while (S.seated && me === loopId) {
    // AI players who went broke re-buy (their chips are not wallet money)
    for (const p of table.seats) if (p && p !== human && p.stack <= 0) p.stack = BUY_IN;
    if (human.stack <= 0) { hint(tr('Keine Chips mehr am Tisch.', 'You are out of chips at this table.')); leave(); return; }
    S.inHand = true;
    $('hd-leave').disabled = false;
    try { await playHand(); } catch (e) { console.error('[poker] hand failed', e); if (DEBUG) window.__pkErr = e.stack; }
    S.inHand = false;
    refreshSeats();
    refreshStats();
    if (S.wantLeave) { leave(); return; }
    await motion.wait(1100);
    if (me !== loopId) return;
  }
}

async function playHand() {
  // reset table visuals
  boardLayer.removeChildren().forEach((c) => c.destroy());
  seats.forEach((sv) => { clearSeatCards(sv); sv.bet.visible = false; sv.glow.clear(); sv.timer.clear(); });
  potPill.visible = false;
  streetStart = new Map();

  const onStreet = async (street, board) => {
    await collectBets();
    if (street === 'preflop') {
      placeDealerButton();
      for (const p of table.seats) if (p) streetStart.set(p.id, 0);
      await dealHoles();
      showBets();
    } else {
      for (const p of table.seats) if (p) streetStart.set(p.id, p.committedThisHand);
      await dealBoard(board);
    }
    refreshSeats();
    refreshStats();
  };
  const res = await table.playHand((p, st) => decide(p, st), onStreet);
  await collectBets();
  await showdown(res);
}

async function dealHoles() {
  const order = table.activeSeatOrder();
  for (let round = 0; round < 2; round++) {
    for (const idx of order) {
      const p = table.seats[idx];
      if (!p.hole?.length) continue;
      const sv = seats[idx];
      const cv = new CardView(toKit(p.hole[round]), atlas);
      cv.scale.set(sv.cardScale);
      const from = sv.cards.toLocal({ x: L.C.x, y: L.C.y }, holdemWorld);
      cv.position.set(from.x, from.y);
      sv.cards.addChild(cv);
      sv.views.push(cv);
      play('card');
      const k = sv.views.length - 1;
      const spread = atlas.width * sv.cardScale * (idx === 0 ? 0.62 : 0.45);
      motion.tween(cv, { x: (k - 0.5) * spread, y: 0, rotation: (k - 0.5) * (idx === 0 ? 0.08 : 0.12) }, 260, ease.outCubic);
      await motion.wait(SPEEDS[S.speed].ms * 0.12 + 40);
    }
  }
  await motion.wait(250);
  // only the human's own cards are turned face up
  play('flip');
  await Promise.all(seats[0].views.map((cv) => cv.flip(motion, 240)));
}

async function dealBoard(board) {
  for (let i = boardLayer.children.length; i < board.length; i++) {
    const cv = new CardView(toKit(board[i]), atlas);
    const spot = boardSpot(i);
    cv.scale.set(spot.s);
    cv.position.set(L.C.x, L.C.y - L.ry * 0.9);
    boardLayer.addChild(cv);
    play('card');
    await motion.tween(cv, { x: spot.x, y: spot.y }, 280, ease.outCubic);
    await cv.flip(motion, 240);
    await motion.wait(90);
  }
  play('turn');
}

function streetBet(p) {
  return p.committedThisHand - (streetStart.get(p.id) ?? 0);
}

function showBets() {
  for (const sv of seats) {
    const p = sv.player;
    const amt = p ? streetBet(p) : 0;
    if (amt <= 0) { sv.bet.visible = false; continue; }
    sv.bet.visible = true;
    sv.betChips.removeChildren().forEach((c) => c.destroy());
    const { breakdown } = chipBreakdown(amt);
    let n = 0;
    for (const [d, cnt] of [...breakdown].reverse()) for (let k = 0; k < Math.min(cnt, 4); k++, n++) {
      const s = new Sprite(TEX[`chip_${d}`]);
      s.anchor.set(0.5);
      s.width = s.height = 34;
      s.y = -n * 4;
      sv.betChips.addChild(s);
    }
    sv.betTxt.set(money(amt));
    sv.betTxt.position.set(0, 30);
  }
  const pot = currentPot();
  potPill.visible = pot > 0;
  potPill.set(`POT ${money(pot)}`, 'gold');
  refreshStats();
}

// between streets the bets slide into the pot
async function collectBets() {
  const flights = [];
  for (const sv of seats) {
    if (!sv.bet.visible) continue;
    const b = sv.bet;
    flights.push(motion.tween(b, { x: L.C.x, y: potPill.y, alpha: 0 }, 320, ease.inCubic).then(() => {
      b.visible = false; b.alpha = 1;
    }));
  }
  if (flights.length) { play('collect'); await Promise.all(flights); layoutHoldem(); }
  potPill.visible = currentPot() > 0;
  potPill.set(`POT ${money(currentPot())}`, 'gold');
}

async function decide(player, state) {
  const sv = seats[player.seat];
  showBets();
  refreshSeats();
  setActive(sv);
  let dec;
  if (player === human) {
    dec = await humanTurn(state);
  } else {
    const think = SPEEDS[S.speed].ms * (0.7 + Math.random() * 0.6);
    animateTimer(sv, think);
    await motion.wait(think);
    // AI sees only its own hole cards + public state (see ai.test.js)
    dec = PERSONALITIES[player.id](player.hole, state, { rng: Math.random });
  }
  sv.timer.clear();
  const toCall = Math.min(state.toCall, state.stack);
  let label, kind;
  if (dec.action === 'fold') { label = 'FOLD'; kind = 'red'; play('fold'); foldCards(sv); }
  else if (dec.action === 'check' || (dec.action === 'call' && toCall <= 0)) { label = 'CHECK'; kind = 'blue'; play('check'); }
  else if (dec.action === 'call') { label = toCall >= state.stack ? 'ALL-IN' : `CALL ${money(toCall)}`; kind = 'green'; play(toCall >= state.stack ? 'allin' : 'chip'); }
  else { const allIn = (dec.amount ?? 0) >= state.stack + (state.currentBet - state.toCall); label = allIn ? 'ALL-IN' : `RAISE ${money(dec.amount)}`; kind = 'gold'; play(allIn ? 'allin' : 'chip'); }
  bubble(sv, label, kind);
  return dec;
}

function setActive(sv) {
  seats.forEach((s) => s.glow.clear());
  sv.glow.circle(0, 0, sv.R + 10).fill({ color: 0x4dff9a, alpha: 0.18 }).stroke({ width: 3, color: 0x4dff9a, alpha: 0.9 });
}

function animateTimer(sv, ms) {
  const o = { k: 0 };
  motion.tween(o, { k: 1 }, ms, (t) => t).then(() => sv.timer.clear());
  const draw = () => {
    if (o.k >= 1) return;
    sv.timer.clear().arc(0, 0, sv.R + 7, -Math.PI / 2, -Math.PI / 2 + o.k * Math.PI * 2).stroke({ width: 4, color: 0xf2c350 });
    requestAnimationFrame(draw);
  };
  draw();
}

function bubble(sv, text, kind) {
  const b = sv.bubble;
  b.set(text, kind);
  b.visible = true;
  b.alpha = 0;
  const s = Math.max(0.7, sv.R / 50);
  b.scale.set(s * 0.6);
  motion.tween(b, { alpha: 1, scale: s }, 200, ease.outBack)
    .then(() => motion.wait(Math.max(500, SPEEDS[S.speed].ms * 1.2)))
    .then(() => motion.tween(b, { alpha: 0 }, 250))
    .then(() => { b.visible = false; });
}

function foldCards(sv) {
  for (const cv of sv.views) {
    const to = sv.cards.toLocal({ x: L.C.x, y: L.C.y }, holdemWorld);
    motion.tween(cv, { x: to.x, y: to.y, alpha: 0 }, 350, ease.inCubic);
  }
  sv.c.alpha = 0.5;
}

// ---- human turn ---------------------------------------------------------
function humanTurn(state) {
  return new Promise((resolve) => {
    pending = { resolve, state };
    const toCall = Math.min(state.toCall, state.stack);
    const stakeBefore = state.currentBet - state.toCall;
    const maxTo = stakeBefore + state.stack;
    const minTo = Math.min(maxTo, state.currentBet + state.minRaise);
    pending.minTo = minTo;
    pending.maxTo = maxTo;
    $('hd-call-lbl').textContent = toCall > 0 ? (toCall >= state.stack ? `All-in ${money(toCall)}` : `Call ${money(toCall)}`) : 'Check';
    $('hd-call-i').innerHTML = toCall > 0
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 8.5v7"/></svg>' // chip = call
      : '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; // tick = check
    const canRaise = maxTo > state.currentBet && state.stack > toCall;
    $('hd-raise').disabled = !canRaise;
    $('raise-box').style.visibility = canRaise ? 'visible' : 'hidden';
    const sl = $('rz-slider');
    sl.min = String(minTo);
    sl.max = String(maxTo);
    sl.step = String(BIG_BLIND);
    sl.value = String(minTo);
    updateRaiseLabel();
    showDock('turn');
    hint(tr(`Du bist dran · Pot ${money(state.pot)}`, `Your turn · Pot ${money(state.pot)}`));
    play('turn');
  });
}

function updateRaiseLabel() {
  if (!pending) return;
  const v = Number($('rz-slider').value);
  $('hd-raise-lbl').textContent = v >= pending.maxTo ? `All-in ${money(v)}` : `Raise ${money(v)}`;
}

function humanAct(action, amount) {
  if (!pending) return;
  const { resolve } = pending;
  pending = null;
  showDock('idle');
  hint('');
  resolve(amount != null ? { action, amount } : { action });
}

function showDock(which) {
  $('hd-idle').hidden = which !== 'idle';
  $('hd-turn').hidden = which !== 'turn';
  layout();
}

// ---- showdown -----------------------------------------------------------
function bestFive(cards) {
  const target = evaluateBest(cards).value;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
    const r = evaluate5(five);
    if (r.value === target) return { five, r };
  }
  return null;
}

async function showdown({ board, players, result }) {
  seats.forEach((s) => s.glow.clear());
  const contenders = players.filter((p) => !p.folded);
  const winners = new Set(result.pots.flatMap((pt) => pt.winners));
  let bestText = null;
  if (contenders.length > 1) {
    // reveal every remaining hand
    await Promise.all(contenders.flatMap((p) => seats[p.seat].views.filter((cv) => !cv.faceUp).map((cv) => cv.flip(motion, 260))));
    await motion.wait(300);
    const w = contenders.find((p) => winners.has(p.id));
    const bf = w && bestFive([...w.hole, ...board]);
    if (bf) {
      bestText = HAND_DE[bf.r.category];
      const ids = new Set(bf.five);
      const all = [...boardLayer.children, ...seats[w.seat].views];
      for (const cv of all) {
        const hit = ids.has(cv.card.id);
        cv.sprite.tint = hit ? 0xffffff : 0x777777;
        if (hit) motion.tween(cv, { y: cv.y - 10 }, 220, ease.outBack);
      }
    }
  }
  // pot flies to each winner
  for (const id of winners) {
    const p = players.find((pl) => pl.id === id);
    const sv = seats[p.seat];
    const won = result.payouts.get(id);
    sv.glow.clear().circle(0, 0, sv.R + 12).fill({ color: 0xf2c350, alpha: 0.25 }).stroke({ width: 4, color: 0xf2c350 });
    play('allin');
    for (let k = 0; k < 5; k++) flyChip(potPill.position, sv.c.position, k * 60);
    bubble(sv, `+${money(won)}`, 'gold');
  }
  potPill.visible = false;
  const humanWon = winners.has('human');
  const humanPaid = result.payouts.get('human') ?? 0;
  const title = new GoldText(1000, 150, 64, humanWon ? {} : { palette: 'white', glow: 'rgba(120,200,255,.6)', stroke: '#06101c' });
  const names = [...winners].map((id) => players.find((p) => p.id === id).name);
  title.text = humanWon
    ? tr(`DU GEWINNST ${money(humanPaid)}`, `YOU WIN ${money(humanPaid)}`)
    : names.length > 1 ? tr(`${names.join(' & ')} teilen`, `${names.join(' & ')} split the pot`) : tr(`${names[0]} gewinnt`, `${names[0]} wins`);
  const sub = new GoldText(900, 80, 34, { palette: 'white', glow: 'rgba(0,0,0,.8)', stroke: '#06101c' });
  sub.text = bestText ?? tr('Alle anderen haben gefoldet', 'Everyone else folded');
  // one dark plaque carries both lines so the message stays readable over cards, chips and felt
  sub.y = 58;
  const box = plaqueText(title, sub, 8);
  const bounds = box.getLocalBounds();
  const k = Math.min(1, L.aw / 820, (app.screen.width * 0.9) / bounds.width, (L.ah * 0.3) / bounds.height);
  // just below the board, so the highlighted winning cards stay visible
  const spot = boardSpot(2);
  const y = spot.y + atlas.height * spot.s * 0.5 + 12 - bounds.y * k;
  box.position.set(L.C.x, Math.min(y, L.top + L.ah - (bounds.height + bounds.y) * k - 8));
  box.scale.set(0.3 * k);
  fx.addChild(box);
  play(humanWon ? (humanPaid >= 300 ? 'big' : 'win') : 'lose');
  motion.tween(box, { scale: k }, 450, ease.outBack);
  refreshSeats();
  refreshStats();
  await motion.wait(Math.max(1800, SPEEDS[S.speed].ms * 3));
  await motion.tween(box, { alpha: 0 }, 350);
  box.destroy({ children: true });
}

function flyChip(from, to, delay) {
  const s = new Sprite(TEX.chip_100);
  s.anchor.set(0.5);
  s.width = s.height = 34;
  s.position.set(from.x, from.y);
  fx.addChild(s);
  return motion.tween(s, { x: to.x, y: to.y }, 420, ease.outCubic, delay).then(() => s.destroy());
}

// ==================================================================
// VIDEO POKER — "Kush or Better" (Jacks or Better 9/6)
// ==================================================================
const PT = [[HAND_DE[9], 9], [HAND_DE[8], 8], [HAND_DE[7], 7], [HAND_DE[6], 6], [HAND_DE[5], 5], [HAND_DE[4], 4], [HAND_DE[3], 3], [HAND_DE[2], 2], [tr('Buben oder besser', 'Jacks or Better'), 1]];
const PAY = { 9: 250, 8: 50, 7: 25, 6: 9, 5: 6, 4: 4, 3: 3, 2: 2, 1: 1 };

function buildPaytable(hitCat = null) {
  const c = S.vp.coins;
  $('vp-paytable').innerHTML = `<h4>${tr('AUSZAHLUNG', 'PAYTABLE')} · ${c} ${c === 1 ? tr('MÜNZE', 'COIN') : tr('MÜNZEN', 'COINS')}</h4>` + PT.map(([n, cat]) =>
    `<div class="pt-line${cat === hitCat ? ' hit' : ''}"><span>${n}</span><b>${(cat === 9 && c === 5 ? 800 : PAY[cat]) * c}</b></div>`).join('');
}

async function vpDeal() {
  const vp = S.vp;
  if (vp.phase === 'busy') return;
  if (vp.phase === 'held') return vpDraw();
  if (!wallet.take(vp.coins)) { hint(tr('Nicht genug Guthaben.', 'Not enough balance.')); play('error'); return; }
  vp.phase = 'busy';
  vp.lastWin = 0;
  S.ledger.push({ type: 'vp', out: vp.coins, in: 0 });
  buildPaytable();
  refreshStats();
  vp.deck = shuffle(fullDeck());
  vp.hand = vp.deck.splice(0, 5);
  vp.holds = [0, 0, 0, 0, 0];
  for (const [i, cv] of vpCards.entries()) {
    cv.hold.visible = false;
    cv.sprite.tint = 0xffffff;
    if (cv.faceUp) { cv.setFaceUp(false); }
    cv.card = toKit(vp.hand[i]);
  }
  for (const cv of vpCards) { play('vpcard'); await cv.flip(motion, 200); }
  vp.phase = 'held';
  $('vp-deal').querySelector('span').textContent = tr('ZIEHEN', 'DRAW');
  hint(tr('Karten zum Halten antippen, dann „Ziehen“.', 'Tap the cards you want to hold, then Draw.'));
}

function toggleHold(i) {
  const vp = S.vp;
  if (vp.phase !== 'held') return;
  vp.holds[i] ^= 1;
  const cv = vpCards[i];
  cv.hold.visible = !!vp.holds[i];
  motion.tween(cv, { y: L.vp.cardsY - (vp.holds[i] ? 14 : 0) }, 160, ease.outBack);
  play('click');
}

async function vpDraw() {
  const vp = S.vp;
  vp.phase = 'busy';
  const redraw = [];
  for (let i = 0; i < 5; i++) if (!vp.holds[i]) { vp.hand[i] = vp.deck.shift(); redraw.push(i); }
  for (const i of redraw) { const cv = vpCards[i]; await cv.flip(motion, 150); cv.card = toKit(vp.hand[i]); play('vpcard'); await cv.flip(motion, 150); }
  const win = payoutFor(vp.hand, vp.coins);
  const cat = evaluate5(vp.hand).category;
  const paidCat = win > 0 ? (cat === 1 ? 1 : cat) : null;
  buildPaytable(paidCat);
  vpCards.forEach((cv) => { cv.hold.visible = false; motion.tween(cv, { y: L.vp.cardsY }, 150); });
  if (win > 0) {
    wallet.add(win);
    S.ledger[S.ledger.length - 1].in = win;
    vp.lastWin = win;
    play(cat >= 6 ? 'big' : 'win');
    if (cat === 9) royal();
    const title = new GoldText(900, 150, 76);
    title.text = `+${money(win)}`;
    const sub = new GoldText(800, 70, 32, { palette: 'white', glow: 'rgba(0,0,0,.7)', stroke: '#06101c' });
    sub.text = HAND_DE[cat].toUpperCase();
    sub.y = 60;
    const t = plaqueText(title, sub, 8);
    t.position.set(L.vp.cx, L.vp.cardsY);
    const k = Math.min(1, L.aw / 820, (app.screen.width * 0.9) / t.getLocalBounds().width);
    t.scale.set(0.3 * k);
    fx.addChild(t);
    motion.tween(t, { scale: k }, 420, ease.outBack).then(() => motion.wait(1300)).then(() => motion.tween(t, { alpha: 0 }, 400)).then(() => t.destroy({ children: true }));
    hint(`${HAND_DE[cat]}! +${money(win)}`);
  } else {
    play('lose');
    hint(tr('Leider nichts – nochmal geben?', 'No win this time – deal again?'));
  }
  refreshStats();
  vp.phase = 'idle';
  $('vp-deal').querySelector('span').textContent = tr('GEBEN', 'DEAL');
}

function royal() {
  const b = new Sprite(TEX.win_royal);
  b.anchor.set(0.5);
  b.position.set(L.vp.cx, L.top + L.ah * 0.4);
  const k = Math.min(L.aw * 0.8, 700) / b.texture.width;
  b.scale.set(k * 0.2);
  fx.addChild(b);
  motion.tween(b, { scale: k }, 700, ease.outElastic).then(() => motion.wait(2000)).then(() => motion.tween(b, { alpha: 0 }, 500)).then(() => b.destroy());
}

function vpHint() {
  const vp = S.vp;
  if (vp.phase !== 'held') { hint(tr('Den Tipp gibt es nach dem Geben.', 'Hints are available after the deal.')); return; }
  hint(tr('Berechne beste Entscheidung…', 'Calculating the best play…'));
  setTimeout(() => {
    const rest = fullDeck().filter((c) => !vp.hand.includes(c));
    const best = solveBestHold(vp.hand, rest, vp.coins); // exact EV over all draws
    for (let i = 0; i < 5; i++) {
      const want = (best.mask >> i) & 1;
      if (want !== vp.holds[i]) toggleHold(i);
    }
    hint(tr(`Tipp: ${best.mask ? 'markierte Karten halten' : 'alle Karten neu ziehen'} (Erwartung ${money(best.ev)} Münzen).`, `Hint: ${best.mask ? 'hold the marked cards' : 'draw five new cards'} (expected ${money(best.ev)} coins).`));
  }, 30);
}

// ---------------------------------------------------------------- UI
function buildUI() {
  wallet.on((b) => { $('balance').textContent = money(b); });
  $('tab-holdem').onclick = () => setMode('holdem');
  $('tab-vp').onclick = () => setMode('vp');
  $('hd-sit').onclick = () => sit();
  $('hd-leave').onclick = () => leave();
  const speedLbl = () => { $('hd-speed-lbl').textContent = `${tr('Tempo', 'Speed')}: ${SPEEDS[S.speed].label}`; };
  speedLbl();
  $('hd-speed').onclick = () => { S.speed = (S.speed + 1) % SPEEDS.length; localStorage.setItem('pk.speed', String(S.speed)); speedLbl(); play('click'); };
  $('hd-fold').onclick = () => humanAct('fold');
  $('hd-call').onclick = () => humanAct(pending && pending.state.toCall > 0 ? 'call' : 'check');
  $('hd-raise').onclick = () => humanAct('raise', Number($('rz-slider').value));
  $('rz-slider').oninput = updateRaiseLabel;
  const preset = (fn) => () => { if (!pending) return; const v = Math.max(pending.minTo, Math.min(pending.maxTo, Math.round(fn(pending.state) / BIG_BLIND) * BIG_BLIND)); $('rz-slider').value = String(v); updateRaiseLabel(); play('click'); };
  $('rz-min').onclick = preset(() => 0);
  $('rz-half').onclick = preset((s) => s.currentBet + (s.pot + s.toCall) / 2);
  $('rz-pot').onclick = preset((s) => s.currentBet + s.pot + s.toCall);
  $('rz-all').onclick = () => { if (!pending) return; $('rz-slider').value = String(pending.maxTo); updateRaiseLabel(); play('click'); };

  $('vp-minus').onclick = () => { if (S.vp.phase === 'idle') { S.vp.coins = Math.max(1, S.vp.coins - 1); $('vp-coins').textContent = S.vp.coins; buildPaytable(); refreshStats(); play('click'); } };
  $('vp-plus').onclick = () => { if (S.vp.phase === 'idle') { S.vp.coins = Math.min(5, S.vp.coins + 1); $('vp-coins').textContent = S.vp.coins; buildPaytable(); refreshStats(); play('click'); } };
  $('vp-deal').onclick = () => vpDeal();
  $('vp-hint').onclick = () => vpHint();

  $('btn-help').onclick = () => ($('help').hidden = false);
  $('help-close').onclick = () => ($('help').hidden = true);
  $('refill').onclick = () => { const before = wallet.balance; wallet.refill(); S.start += wallet.balance - before; play('click'); refreshStats(); };
  $('btn-sound').classList.toggle('off', sfx.muted);
  mountMusicControl($('btn-sound'), sfx, { music: false });

  // closing / reloading the page while seated: the table stack goes back to the wallet
  // (chips already in the current pot are forfeited, like walking away from a live hand)
  window.addEventListener('pagehide', () => {
    if (S.seated && human?.stack > 0) { wallet.add(human.stack); human.stack = 0; }
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (S.mode === 'vp') {
      if (k === ' ' || k === 'enter') { e.preventDefault(); vpDeal(); }
      if (['1', '2', '3', '4', '5'].includes(k)) toggleHold(Number(k) - 1);
    } else if (pending) {
      if (k === 'f') humanAct('fold');
      if (k === 'c' || k === ' ') { e.preventDefault(); $('hd-call').click(); }
      if (k === 'r' && !$('hd-raise').disabled) $('hd-raise').click();
    }
  });
}

// Real audit: baseline is the balance when the page opened (not derived from the ledger).
function audit() {
  const out = S.ledger.reduce((a, l) => a + l.out, 0);
  const inn = S.ledger.reduce((a, l) => a + l.in, 0);
  const atTable = S.seated ? 0 : 0; // buy-in is "out" until cash-out
  const expected = cents(S.start - out + inn + atTable);
  return { entries: S.ledger.length, out: cents(out), in: cents(inn), expected, balance: wallet.balance, ok: Math.abs(expected - wallet.balance) < 0.011 };
}
