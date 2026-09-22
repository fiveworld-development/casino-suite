// Blackjack — Haze Kings Lounge. One seat, up to 4 hands via splits.
// Rules (engine.js): 6-deck shoe, S17, BJ 3:2, double any 2 incl. after split, split aces once
// (one card each), insurance 2:1, dealer peeks. Honest engine — see ../kit and ./engine.js.
import { Application, Assets, Container, Sprite, Graphics, Text, Texture } from 'pixi.js';
import { guardRenderGroups } from '../../shared/pixi-guard.js';
import { Motion, ease } from '../../shared/motion.js';
import { tr } from '../../shared/i18n.js';
import '../i18n.js';
import { wallet, money } from '../../shared/wallet.js';
import { GoldText, plaqueText } from '../../games/krakens-hoard/textures.js';
import { setupEmbedViewport, requestFullscreenIfStandalone, blurredTexture } from '../kit/embed.js';
import { buildCardTextures, CardView } from '../kit/cards.js';
import { chipBreakdown } from '../kit/chips.js';
import { BlackjackGame, handValue, dealerShouldHit, resolveHand, resolveInsurance, canSplit, canDouble, splitHand, cents } from './engine.js';
import { sfx, play, loop } from './sfx.js';

const TBASE = '/assets/tables/';
const BBASE = '/assets/blackjack/';
const CHIPS = [1, 5, 25, 100, 420, 1000];
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

const S = {
  bet: 0,
  lastBet: Number(localStorage.getItem('bj.lastBet')) || 0,
  phase: 'idle', // idle | betting | dealing | insurance | playing | dealer | settle
  hands: [], // { cards, bet, done, doubled, isSplit, isAceSplit, view: CardView[], badge, result }
  active: 0,
  dealer: { cards: [], view: [] },
  insurance: 0,
  start: 0, // balance when the table was opened (audit baseline)
  ledger: [], // { staked, returned } per round
};

let app, motion, atlas, TEX, game;
let world, tableSprite, dealerMedal, shoeSprite, feltText, betStack, betLabel, dealerBadge, fx;
const L = {}; // current layout metrics

boot();

async function boot() {
  const bar = $('load-bar');
  await Promise.all(['900 40px Montserrat', '800 20px Montserrat', '800 40px Cinzel'].map((f) => document.fonts.load(f).catch(() => {})));
  const IMAGES = {
    table_blackjack: `${BBASE}table_blackjack.webp`, bg_room: `${TBASE}bg_room.webp`, shoe: `${BBASE}shoe.webp`,
    discard_tray: `${BBASE}discard_tray.webp`, dealer: `${BBASE}dealer.webp`, win_blackjack: '/assets/poker/win_blackjack.webp',
    card_back: `${TBASE}card_back.webp`, court_J: `${TBASE}court_J.webp`, court_Q: `${TBASE}court_Q.webp`, court_K: `${TBASE}court_K.webp`,
    ...Object.fromEntries(CHIPS.map((c) => [`chip_${c}`, `${TBASE}chip_${c}.webp`])),
  };
  for (const [alias, src] of Object.entries(IMAGES)) Assets.add({ alias, src });
  TEX = await Assets.load(Object.keys(IMAGES), (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  $('load-text').textContent = tr('Der Dealer wartet', 'The dealer is waiting');
  $('load-start').hidden = false;
  $('load-start').onclick = async () => {
    requestFullscreenIfStandalone();
    await sfx.unlock();
    play('click');
    $('loader').classList.add('gone');
    setTimeout(() => $('loader').remove(), 900);
    await start();
  };
}

async function start() {
  setupEmbedViewport();
  app = new Application();
  await app.init({ resizeTo: $('stage'), antialias: true, backgroundColor: 0x03100a, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  guardRenderGroups(app);
  $('stage').appendChild(app.canvas);
  motion = new Motion(app.ticker);
  atlas = buildCardTextures({ court_J: TEX.court_J.source.resource, court_Q: TEX.court_Q.source.resource, court_K: TEX.court_K.source.resource, card_back: TEX.card_back.source.resource });
  game = new BlackjackGame({ decks: 6, penetration: 0.75 });
  S.start = wallet.balance;

  buildScene();
  buildUI();
  $('topbar').hidden = false;
  $('dock').hidden = false;
  app.renderer.on('resize', layout);
  new ResizeObserver(layout).observe($('dock'));
  layout();
  setPhase('betting');
  loop('music');

  if (DEBUG) {
    window.BJ = {
      S, game, motion, audit,
      // background tabs throttle rAF — drive frames manually in tests
      async run(ms, step = 16) { let t = performance.now(); for (let i = 0; i < ms / step; i++) { t += step; app.ticker.update(t); for (let k = 0; k < 4; k++) await Promise.resolve(); } },
    };
  }
}

// ---------------------------------------------------------------- scene
function buildScene() {
  // the room is only atmosphere: heavily blurred and darkened so the table is the single focus
  const bg = new Sprite(blurredTexture(TEX.bg_room.source.resource, Texture));
  bg.anchor.set(0.5);
  const dim = new Sprite(Texture.WHITE);
  dim.tint = 0x020805;
  dim.alpha = 0.62;
  app.stage.addChild(bg, dim);
  Object.assign(L, { bg, dim });

  world = new Container();
  app.stage.addChild(world);

  // table blends into the room through a soft elliptical mask (no hard rectangle)
  tableSprite = new Sprite(TEX.table_blackjack);
  tableSprite.anchor.set(0.5);
  const mask = new Sprite(featherTexture());
  mask.anchor.set(0.5);
  tableSprite.addChild(mask);
  tableSprite.mask = mask;
  mask.width = tableSprite.texture.width;
  mask.height = tableSprite.texture.height;
  world.addChild(tableSprite);

  feltText = new Container();
  const t1 = new Text({ text: 'BLACKJACK PAYS 3 TO 2', style: { fontFamily: 'Montserrat', fontWeight: '900', fontSize: 32, fill: 0xf2c350, letterSpacing: 4 } });
  const t2 = new Text({ text: 'DEALER STANDS ON ALL 17  ·  INSURANCE PAYS 2 TO 1', style: { fontFamily: 'Montserrat', fontWeight: '700', fontSize: 17, fill: 0xe8f3ea, letterSpacing: 3 } });
  t1.anchor.set(0.5); t2.anchor.set(0.5); t2.y = 34;
  t1.alpha = 0.75; t2.alpha = 0.55;
  feltText.addChild(t1, t2);
  world.addChild(feltText);

  // dealer in a gold medallion
  dealerMedal = new Container();
  const ring = new Graphics().circle(0, 0, 100).fill({ color: 0x0b2a1c }).stroke({ width: 8, color: 0xd9b45c });
  const photo = new Sprite(TEX.dealer);
  photo.anchor.set(0.5, 0.42);
  photo.scale.set(200 / photo.texture.width * 1.15);
  const pmask = new Graphics().circle(0, 0, 96).fill(0xffffff);
  photo.mask = pmask;
  const glow = new Graphics().circle(0, 0, 112).stroke({ width: 3, color: 0x4dff9a, alpha: 0.6 });
  dealerMedal.addChild(glow, ring, photo, pmask);
  world.addChild(dealerMedal);

  shoeSprite = new Sprite(TEX.shoe);
  shoeSprite.anchor.set(0.5);
  world.addChild(shoeSprite);

  dealerBadge = makeBadge();
  world.addChild(dealerBadge);

  betStack = new Container();
  betLabel = makeBadge(true);
  world.addChild(betStack, betLabel);

  fx = new Container();
  app.stage.addChild(fx);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  // only a tap on the betting spot itself adds the selected chip – taps elsewhere do nothing
  app.stage.on('pointertap', (e) => {
    if (S.phase !== 'betting' || !L.betXY) return;
    const r = Math.max(60, Math.min(L.cw * 0.9, 110));
    if (Math.hypot(e.global.x - L.betXY.x, e.global.y - L.betXY.y) <= r) addChip(S.selected ?? 25);
  });
}

function featherTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 342;
  const g = c.getContext('2d');
  // wide, soft falloff so the table melts into the dark room instead of showing an edge
  const r = g.createRadialGradient(256, 150, 60, 256, 171, 280);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.62, 'rgba(255,255,255,1)');
  r.addColorStop(0.9, 'rgba(255,255,255,.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 342);
  return Texture.from(c);
}

// pill badge showing a hand total / bet amount
function makeBadge(small = false) {
  const b = new Container();
  b.bg = new Graphics();
  b.txt = new Text({ text: '', style: { fontFamily: 'Montserrat', fontWeight: '900', fontSize: small ? 24 : 34, fill: 0xffffff } });
  b.txt.anchor.set(0.5);
  b.addChild(b.bg, b.txt);
  b.visible = false;
  b.set = (text, kind = 'normal') => {
    b.txt.text = text;
    const colors = { normal: [0x06140e, 0xd9b45c, 0xffffff], bust: [0x3a0808, 0xff5a5a, 0xffd0d0], bj: [0x3a2a02, 0xffd966, 0xfff2c0], win: [0x06301a, 0x4dff9a, 0xd8ffe8], push: [0x1b2230, 0x9fb8ff, 0xe0e8ff] }[kind];
    const w = Math.max(b.txt.width + 34, small ? 70 : 86), h = small ? 40 : 54;
    b.bg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: colors[0], alpha: 0.92 }).stroke({ width: 3, color: colors[1] });
    b.txt.style.fill = colors[2];
    b.visible = true;
  };
  return b;
}

// ---------------------------------------------------------------- layout
function layout() {
  if (!app) return;
  const sw = app.screen.width, sh = app.screen.height;
  const top = $('topbar').offsetHeight || 70;
  const bottom = $('dock').offsetHeight || 150;
  const aw = sw, ah = Math.max(200, sh - top - bottom);
  const portrait = aw / ah < 1;
  Object.assign(L, { sw, sh, top, ah, aw, portrait, cx: sw / 2 });

  L.bg.scale.set(Math.max(sw / L.bg.texture.width, sh / L.bg.texture.height));
  L.bg.position.set(sw / 2, sh / 2);
  L.dim.width = sw; L.dim.height = sh;

  // card size: as big as the space allows (≈ ¼ of the play height), never wider than ~1/5 of the screen
  const low = !portrait && ah < 420; // phones held sideways: very little height, use it all for cards
  const cardH = portrait ? Math.min(ah * 0.19, aw * 0.36) : low ? ah * 0.3 : Math.min(ah * 0.25, aw * 0.12);
  L.cs = cardH / atlas.height;
  L.cw = atlas.width * L.cs;
  L.ch = cardH;

  // table fills the play area and bleeds under the bars
  const tt = tableSprite.texture;
  const tScale = portrait ? Math.max(aw * 1.9 / tt.width, (ah + 120) / tt.height) : Math.max(aw * 1.08 / tt.width, (ah + 160) / tt.height);
  tableSprite.scale.set(tScale);
  tableSprite.position.set(sw / 2, top + ah * 0.5);

  const medR = Math.min(cardH * 0.42, portrait ? aw * 0.13 : 90);
  dealerMedal.scale.set(medR / 100);
  L.dealerY = top + ah * (portrait ? 0.28 : low ? 0.3 : 0.27);
  L.playerY = top + ah * (portrait ? 0.68 : low ? 0.74 : 0.69);
  dealerMedal.position.set(sw / 2 - (portrait ? aw * 0.36 : Math.min(aw * 0.3, 420)), top + medR + 12);
  if (portrait) dealerMedal.position.set(sw / 2 - aw * 0.34, top + medR + 10);

  shoeSprite.scale.set((cardH * 0.95) / shoeSprite.texture.height);
  shoeSprite.position.set(sw / 2 + (portrait ? aw * 0.36 : Math.min(aw * 0.32, 440)), top + cardH * 0.55);
  L.shoeXY = { x: shoeSprite.x - shoeSprite.width * 0.2, y: shoeSprite.y + shoeSprite.height * 0.2 };

  // rules printed on the felt, in the free band between dealer cards and the player's total badge
  const band0 = L.dealerY + cardH / 2, band1 = L.playerY - cardH / 2 - 60 * Math.min(1, L.cs * 3);
  feltText.visible = band1 - band0 > 46;
  feltText.scale.set(Math.min(1, aw / 900, Math.max(0.4, (band1 - band0) / 80)) * (portrait ? 0.8 : 1));
  feltText.position.set(sw / 2, (band0 + band1) / 2 - 10 * feltText.scale.y);

  L.betXY = { x: sw / 2, y: Math.min(L.playerY + cardH * 0.75, top + ah - 26) };
  drawBetStack();
  placeCards(false);
}

function handX(i, n) {
  const gap = Math.min(L.aw / Math.max(n, 1), L.cw * 2.6);
  return L.cx + (i - (n - 1) / 2) * gap;
}

// split hands shrink until every hand fits its slot (up to 4 hands on a portrait phone)
function handScale() {
  const n = S.hands.length;
  if (n < 2) return 1;
  const most = Math.max(...S.hands.map((h) => h.cards.length));
  const slot = Math.min(L.aw / n, L.cw * 2.6) * 0.94;
  return Math.min(1, slot / (L.cw * (1 + 0.42 * (most - 1))));
}

function cardTarget(hand, i, hi, n) {
  const fan = L.cw * 0.42 * handScale();
  const x = handX(hi, n) - ((hand.cards.length - 1) * fan) / 2 + i * fan;
  return { x, y: L.playerY + i * -4 };
}

function dealerTarget(i) {
  const n = S.dealer.cards.length;
  const fan = Math.min(L.cw * 0.62, n > 1 ? (L.aw - 24 - L.cw) / (n - 1) : 0);
  return { x: L.cx - ((n - 1) * fan) / 2 + i * fan, y: L.dealerY };
}

function placeCards(animate = true) {
  const move = (cv, p, k = 1) => {
    cv.scale.set(L.cs * k);
    if (animate) motion.tween(cv, { x: p.x, y: p.y }, 260, ease.outCubic);
    else cv.position.set(p.x, p.y);
  };
  S.dealer.view.forEach((cv, i) => move(cv, dealerTarget(i)));
  const k = handScale();
  S.hands.forEach((h, hi) => h.view.forEach((cv, i) => move(cv, cardTarget(h, i, hi, S.hands.length), k)));
  updateBadges();
}

function updateBadges() {
  if (!L.cs) return;
  // dealer
  if (S.dealer.cards.length) {
    const visible = S.dealer.view.filter((v) => v.faceUp).map((v) => v.card);
    const v = handValue(visible);
    dealerBadge.set(visible.length ? (v.isBust ? `BUST ${v.total}` : v.isBlackjack && visible.length === 2 ? 'BLACKJACK' : String(v.total)) : '?', v.isBust ? 'bust' : v.isBlackjack && visible.length === 2 ? 'bj' : 'normal');
    dealerBadge.scale.set(Math.min(L.portrait ? 0.74 : 1, L.cs * 3));
    dealerBadge.position.set(L.cx, L.dealerY - L.ch / 2 - 30 * dealerBadge.scale.y);
  } else dealerBadge.visible = false;
  // player hands
  S.hands.forEach((h, hi) => {
    if (!h.badge) { h.badge = makeBadge(); world.addChild(h.badge); }
    const v = handValue(h.cards);
    // only the best total – "7/17"-style soft notation confuses players
    let text = v.isBust ? `BUST ${v.total}` : v.isBlackjack && !h.isSplit ? 'BLACKJACK' : String(v.total);
    let kind = v.isBust ? 'bust' : v.isBlackjack && !h.isSplit ? 'bj' : 'normal';
    if (h.result) { text = h.result.text; kind = h.result.kind; }
    h.badge.set(text, kind);
    let s = Math.min(L.portrait ? 0.74 : 1, L.cs * 3);
    // split hands sit side by side: a badge may never be wider than its hand slot or leave the screen
    const n = S.hands.length;
    const slot = n > 1 ? (handX(1, n) - handX(0, n)) * 0.94 : L.aw - 16;
    const w0 = h.badge.width / (h.badge.scale.x || 1);
    s = Math.min(s, slot / w0);
    h.badge.scale.set(s);
    const last = cardTarget(h, h.cards.length - 1, hi, n);
    const first = cardTarget(h, 0, hi, n);
    const half = (w0 * s) / 2;
    const bx = Math.max(8 + half, Math.min(L.sw - 8 - half, (first.x + last.x) / 2));
    h.badge.position.set(bx, L.playerY - (L.ch * handScale()) / 2 - 30 * s);
    h.badge.alpha = S.phase === 'playing' && S.hands.length > 1 && hi !== S.active ? 0.55 : 1;
  });
}

// ---------------------------------------------------------------- betting chips on the felt
function drawBetStack() {
  betStack.removeChildren().forEach((c) => c.destroy());
  const amount = S.phase === 'betting' ? S.bet : S.hands.reduce((a, h) => a + h.bet, 0);
  if (!L.cw) return;
  const size = Math.min(L.cw * 0.62, 78);
  betStack.position.set(L.betXY.x, L.betXY.y);
  if (amount <= 0) {
    betLabel.visible = S.phase === 'betting';
    betLabel.set(tr('EINSATZ PLATZIEREN', 'PLACE YOUR BET'));
    betLabel.scale.set(Math.min(0.8, L.cs * 2.4));
    betLabel.position.set(L.betXY.x, L.betXY.y);
    return;
  }
  const { breakdown } = chipBreakdown(amount);
  let i = 0;
  for (const [d, n] of [...breakdown].reverse()) {
    for (let k = 0; k < Math.min(n, 6); k++, i++) {
      const s = new Sprite(TEX[`chip_${d}`]);
      s.anchor.set(0.5);
      s.width = s.height = size;
      s.y = -i * size * 0.09;
      betStack.addChild(s);
    }
  }
  betLabel.set(money(amount), 'normal');
  betLabel.scale.set(Math.min(0.75, L.cs * 2.2));
  betLabel.position.set(L.betXY.x + size * 0.95, L.betXY.y - size * 0.1);
}

function addChip(d) {
  if (S.phase !== 'betting') return;
  if (cents(S.bet + d) > wallet.balance) { nudge(tr('Nicht genug Guthaben', 'Not enough balance')); play('error'); return; }
  S.bet = cents(S.bet + d);
  play('chip');
  flyChipTo(d, rackXY(d), L.betXY).then(drawBetStack);
  refreshUI();
}

function rackXY(d) {
  const el = document.querySelector(`.chip[data-d="${d}"]`);
  const r = el?.getBoundingClientRect();
  const c = app.canvas.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top } : { x: L.cx, y: L.sh };
}

function flyChipTo(d, from, to, delay = 0) {
  const s = new Sprite(TEX[`chip_${d}`]);
  s.anchor.set(0.5);
  const size = Math.min(L.cw * 0.62, 78);
  s.width = s.height = size;
  s.position.set(from.x, from.y);
  fx.addChild(s);
  return motion.tween(s, { x: to.x, y: to.y }, 380, ease.outCubic, delay).then(() => s.destroy());
}

// ---------------------------------------------------------------- DOM UI
function buildUI() {
  const rack = $('chip-rack');
  S.selected = 25;
  for (const d of CHIPS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.d = d;
    b.innerHTML = `<img src="${TBASE}chip_${d}.webp" alt=""><span class="val">${d === 1000 ? '1K' : d}</span>`;
    b.title = tr(`${d} setzen`, `Bet ${d}`);
    b.onclick = () => { S.selected = d; rack.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c === b)); addChip(d); };
    rack.appendChild(b);
  }
  rack.querySelector('[data-d="25"]').classList.add('sel');

  $('btn-clear').onclick = () => { S.bet = 0; play('click'); drawBetStack(); refreshUI(); };
  $('btn-rebet').onclick = () => { if (S.lastBet <= wallet.balance) { S.bet = S.lastBet; play('chip'); drawBetStack(); refreshUI(); } };
  $('btn-x2').onclick = () => { if (S.bet * 2 <= wallet.balance) { S.bet = cents(S.bet * 2); play('chip'); drawBetStack(); refreshUI(); } };
  $('btn-deal').onclick = () => deal();
  $('btn-hit').onclick = () => act(hit);
  $('btn-stand').onclick = () => act(stand);
  $('btn-double').onclick = () => act(doubleDown);
  $('btn-split').onclick = () => act(split);
  $('btn-ins-yes').onclick = () => insuranceDecision(true);
  $('btn-ins-no').onclick = () => insuranceDecision(false);
  $('btn-even-money').onclick = () => takeEvenMoney();
  $('btn-help').onclick = () => ($('help').hidden = false);
  $('help-close').onclick = () => ($('help').hidden = true);
  $('refill').onclick = () => { const before = wallet.balance; wallet.refill(); S.start += wallet.balance - before; play('click'); refreshUI(); };
  $('btn-sound').classList.toggle('off', sfx.muted);
  $('btn-sound').onclick = () => { sfx.setMuted(!sfx.muted); $('btn-sound').classList.toggle('off', sfx.muted); };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (S.phase === 'betting' && (k === ' ' || k === 'enter')) { e.preventDefault(); deal(); }
    if (S.phase === 'playing') {
      if (k === 'h') act(hit);
      if (k === 's') act(stand);
      if (k === 'd') act(doubleDown);
      if (k === 'p') act(split);
    }
  });

  let shown = wallet.balance;
  wallet.on((b) => { shown = b; $('balance').textContent = money(b); });
  void shown;
}

let busy = false;
async function act(fn) {
  if (busy || S.phase !== 'playing') return;
  busy = true;
  refreshUI();
  try { await fn(); } finally { busy = false; refreshUI(); }
}

function setPhase(p) {
  S.phase = p;
  refreshUI();
}

function refreshUI() {
  const p = S.phase;
  const betting = p === 'betting';
  $('bet-row').hidden = !betting;
  $('play-row').hidden = betting;
  $('bet-total').textContent = money(betting ? S.bet : S.hands.reduce((a, h) => a + h.bet, 0) + S.insurance);
  $('btn-deal').disabled = !betting || S.bet <= 0;
  $('btn-clear').disabled = !betting || S.bet <= 0;
  $('btn-rebet').disabled = !betting || S.lastBet <= 0 || S.lastBet > wallet.balance || S.bet === S.lastBet;
  $('btn-x2').disabled = !betting || S.bet <= 0 || S.bet * 2 > wallet.balance;
  document.querySelectorAll('.chip').forEach((c) => (c.disabled = !betting || cents(S.bet + Number(c.dataset.d)) > wallet.balance));
  const h = S.hands[S.active];
  const canAct = p === 'playing' && !busy && h && !h.done;
  $('btn-hit').disabled = !canAct;
  $('btn-stand').disabled = !canAct;
  $('btn-double').disabled = !(canAct && canDouble(h) && wallet.balance >= h.bet);
  $('btn-split').disabled = !(canAct && canSplit(h, S.hands.length) && wallet.balance >= h.bet);
  $('insurance').hidden = p !== 'insurance';
  const keys = matchMedia('(pointer: fine)').matches; // keyboard hints only where a keyboard is likely
  const hints = {
    betting: S.bet > 0 ? tr(`Weitere Chips antippen oder „Austeilen“${keys ? ' (Leertaste)' : ''}.`, `Add more chips or tap Deal${keys ? ' (Space)' : ''}.`) : tr('Chip antippen, um zu setzen.', 'Tap a chip to place your bet.'),
    playing: (S.hands.length > 1 ? tr(`Hand ${S.active + 1} von ${S.hands.length}`, `Hand ${S.active + 1} of ${S.hands.length}`) : tr('Deine Entscheidung', 'Your move')) + (keys ? tr(' · H Karte · S Stehen · D Verdoppeln · P Teilen', ' · H Hit · S Stand · D Double · P Split') : ''),
    dealer: tr('Der Dealer spielt…', 'Dealer plays…'), dealing: tr('Karten werden ausgeteilt…', 'Dealing…'), insurance: '', settle: '',
  };
  $('dock-hint').textContent = hints[p] ?? '';
  updateBadges();
}

function nudge(text) {
  $('dock-hint').textContent = text;
}

// ---------------------------------------------------------------- round flow
async function deal() {
  if (S.phase !== 'betting' || S.bet <= 0 || S.bet > wallet.balance) return;
  if (!wallet.take(S.bet)) return;
  S.lastBet = S.bet;
  localStorage.setItem('bj.lastBet', String(S.lastBet));
  setPhase('dealing');
  clearTable();
  await maybeShuffle();

  const hand = newHand([], S.bet);
  S.hands = [hand];
  S.active = 0;
  S.insurance = 0;
  S.bet = 0;
  drawBetStack();
  refreshUI();

  await dealTo(hand, true);
  await dealDealer(true);
  await dealTo(hand, true);
  await dealDealer(false);

  const up = S.dealer.cards[0];
  const pBJ = handValue(hand.cards).isBlackjack;
  if (up.rank === 'A') {
    $('btn-even-money').hidden = !pBJ;
    $('btn-ins-yes').hidden = pBJ || wallet.balance < cents(hand.bet / 2);
    $('ins-text').textContent = pBJ
      ? tr('Du hast Blackjack! Even Money zahlt sofort 1:1 – oder riskiere 3:2 gegen einen möglichen Dealer-Blackjack.', 'You have Blackjack! Even money pays 1:1 right now – or play on for 3:2 and risk a dealer Blackjack.')
      : tr(`Versicherung kostet ${money(cents(hand.bet / 2))} und zahlt 2:1, wenn der Dealer Blackjack hat.`, `Insurance costs ${money(cents(hand.bet / 2))} and pays 2:1 if the dealer has Blackjack.`);
    setPhase('insurance');
    return;
  }
  await peekAndContinue();
}

function newHand(cards, bet, extra = {}) {
  return { cards, bet, done: false, doubled: false, isSplit: false, isAceSplit: false, view: [], badge: null, result: null, ...extra };
}

function clearTable() {
  for (const cv of [...S.dealer.view, ...S.hands.flatMap((h) => h.view)]) motion.tween(cv, { alpha: 0, y: cv.y - 40 }, 250).then(() => cv.destroy());
  S.hands.forEach((h) => h.badge?.destroy());
  S.dealer = { cards: [], view: [] };
  S.hands = [];
  dealerBadge.visible = false;
}

async function maybeShuffle() {
  if (!game.shoe.needsReshuffle()) return;
  nudge(tr('Neuer Schuh – es wird gemischt…', 'New shoe – shuffling…'));
  play('shuffle');
  const fan = [];
  for (let i = 0; i < 14; i++) {
    const cv = new CardView({ rank: 'A', suit: 'S' }, atlas);
    cv.scale.set(L.cs * 0.8);
    cv.position.set(L.cx, L.top + L.ah * 0.45);
    fx.addChild(cv);
    fan.push(cv);
    const a = (i - 6.5) * 0.12;
    motion.tween(cv, { x: L.cx + Math.sin(a) * L.cw * 2.2, rotation: a }, 320, ease.outCubic, i * 25);
  }
  await motion.wait(700);
  await Promise.all(fan.map((cv, i) => motion.tween(cv, { x: L.cx, rotation: 0 }, 260, ease.inOutCubic, i * 15)));
  await Promise.all(fan.map((cv) => motion.tween(cv, { x: L.shoeXY.x, y: L.shoeXY.y, alpha: 0 }, 300, ease.inQuad)));
  fan.forEach((cv) => cv.destroy());
  game.shoe.reshuffle(); // the real shuffle happens in the honest engine
}

// a card slides out of the shoe, lands on the target and flips
async function flyCard(card, target, faceUp, delay = 0) {
  const cv = new CardView(card, atlas);
  cv.scale.set(L.cs * 0.8);
  cv.position.set(L.shoeXY.x, L.shoeXY.y);
  cv.rotation = -0.35;
  world.addChild(cv);
  play('card');
  await motion.tween(cv, { x: target.x, y: target.y, rotation: 0 }, 330, ease.outCubic, delay);
  cv.scale.set(L.cs);
  if (faceUp) await cv.flip(motion, 220);
  return cv;
}

async function dealTo(hand, faceUp = true) {
  const card = game.draw();
  hand.cards.push(card);
  const hi = S.hands.indexOf(hand);
  const target = cardTarget(hand, hand.cards.length - 1, hi, S.hands.length);
  placeCards();
  const cv = await flyCard(card, target, faceUp);
  hand.view.push(cv);
  placeCards();
  return card;
}

async function dealDealer(faceUp) {
  const card = game.draw();
  S.dealer.cards.push(card);
  const target = dealerTarget(S.dealer.cards.length - 1);
  placeCards();
  const cv = await flyCard(card, target, faceUp);
  S.dealer.view.push(cv);
  placeCards();
}

async function insuranceDecision(take) {
  if (S.phase !== 'insurance') return;
  const hand = S.hands[0];
  S.insurance = take ? cents(hand.bet / 2) : 0;
  if (S.insurance && !wallet.take(S.insurance)) S.insurance = 0;
  setPhase('dealing');
  await peekAndContinue();
}

async function takeEvenMoney() {
  if (S.phase !== 'insurance') return;
  const hand = S.hands[0];
  const returned = cents(hand.bet * 2);
  hand.result = { text: `EVEN MONEY +${money(hand.bet)}`, kind: 'win' };
  setPhase('settle');
  await revealDealer();
  wallet.add(returned);
  S.ledger.push({ staked: hand.bet, returned });
  showRoundResult(returned - hand.bet, 'EVEN MONEY');
  endRound();
}

// dealer peeks under a ten or ace for blackjack
async function peekAndContinue() {
  const dealerBJ = handValue(S.dealer.cards).isBlackjack;
  const pBJ = handValue(S.hands[0].cards).isBlackjack;
  if (['A', '10', 'J', 'Q', 'K'].includes(S.dealer.cards[0].rank)) {
    nudge(tr('Dealer prüft auf Blackjack…', 'Dealer checks for Blackjack…'));
    await motion.wait(500);
  }
  if (dealerBJ || pBJ) {
    await revealDealer();
    return settle();
  }
  if (S.insurance) nudge(tr('Kein Dealer-Blackjack – Versicherung verloren.', 'No dealer Blackjack – insurance lost.'));
  setPhase('playing');
}

async function hit() {
  const hand = S.hands[S.active];
  await dealTo(hand);
  const v = handValue(hand.cards);
  if (v.isBust) play('bust');
  if (v.isBust || v.total === 21) { hand.done = true; await nextHand(); }
}

async function stand() {
  S.hands[S.active].done = true;
  await nextHand();
}

async function doubleDown() {
  const hand = S.hands[S.active];
  if (!canDouble(hand) || !wallet.take(hand.bet)) return;
  flyChipTo(chipFor(hand.bet), rackXY(chipFor(hand.bet)), L.betXY);
  hand.bet = cents(hand.bet * 2);
  hand.doubled = true;
  drawBetStack();
  await dealTo(hand);
  hand.done = true;
  await nextHand();
}

function chipFor(amount) {
  return [...CHIPS].reverse().find((c) => c <= amount) ?? 1;
}

async function split() {
  const hand = S.hands[S.active];
  if (!canSplit(hand, S.hands.length) || !wallet.take(hand.bet)) return;
  // move the two cards apart, then deal one new card to each (engine rules)
  const [c0, c1] = hand.cards;
  const [v0, v1] = hand.view;
  hand.badge?.destroy();
  const a = newHand([c0], hand.bet, { isSplit: true, isAceSplit: c0.rank === 'A' });
  const b = newHand([c1], hand.bet, { isSplit: true, isAceSplit: c1.rank === 'A' });
  a.view = [v0];
  b.view = [v1];
  S.hands.splice(S.active, 1, a, b);
  play('chip');
  drawBetStack();
  placeCards();
  await motion.wait(280);
  await dealTo(a);
  await dealTo(b);
  if (a.isAceSplit) { a.done = true; b.done = true; } // split aces: one card each, no further action
  for (const h of [a, b]) if (handValue(h.cards).total === 21) h.done = true;
  if (S.hands[S.active].done) await nextHand();
}

async function nextHand() {
  while (S.active < S.hands.length && S.hands[S.active].done) S.active++;
  if (S.active < S.hands.length) {
    placeCards();
    refreshUI();
    return;
  }
  S.active = S.hands.length - 1;
  setPhase('dealer');
  await dealerTurn();
}

async function revealDealer() {
  const hole = S.dealer.view[1];
  if (hole && !hole.faceUp) {
    play('card');
    await hole.flip(motion, 300);
    updateBadges();
  }
}

async function dealerTurn() {
  await revealDealer();
  const anyAlive = S.hands.some((h) => !handValue(h.cards).isBust);
  while (anyAlive && dealerShouldHit(S.dealer.cards)) {
    await motion.wait(350);
    await dealDealer(true);
  }
  await motion.wait(300);
  await settle();
}

async function settle() {
  setPhase('settle');
  let returned = 0, staked = 0, bj = false;
  const dealerXY = { x: L.cx, y: L.dealerY };
  const flights = [];
  for (const [hi, hand] of S.hands.entries()) {
    const r = resolveHand(hand.cards, S.dealer.cards, hand.bet, { isSplit: hand.isSplit });
    staked += hand.bet;
    returned += r.payout;
    const net = cents(r.payout - hand.bet);
    const at = { x: handX(hi, S.hands.length), y: L.betXY.y };
    if (r.outcome === 'blackjack') { bj = true; hand.result = { text: `BLACKJACK +${money(net)}`, kind: 'bj' }; }
    else if (r.outcome === 'win') hand.result = { text: S.hands.length > 1 ? `+${money(net)}` : `${tr('GEWONNEN', 'WIN')} +${money(net)}`, kind: 'win' };
    else if (r.outcome === 'push') hand.result = { text: 'PUSH', kind: 'push' };
    else hand.result = { text: r.outcome === 'bust' ? 'BUST' : tr('VERLOREN', 'LOSE'), kind: 'bust' };
    if (net > 0) for (let k = 0; k < 4; k++) flights.push(flyChipTo(chipFor(net), dealerXY, at, k * 70));
    if (r.outcome === 'lose' || r.outcome === 'bust') for (let k = 0; k < 3; k++) flights.push(flyChipTo(chipFor(hand.bet), at, dealerXY, k * 70));
  }
  // insurance side bet (dealer blackjack pays 2:1)
  let label = null;
  if (S.insurance) {
    staked += S.insurance;
    const ins = resolveInsurance(S.dealer.cards, S.insurance);
    returned += ins;
    if (ins > 0) label = tr('VERSICHERUNG ZAHLT', 'INSURANCE PAYS');
  }
  returned = cents(returned);
  staked = cents(staked);
  updateBadges();
  if (flights.length) play('chip');
  await Promise.race([Promise.all(flights), motion.wait(900)]);
  betStack.removeChildren().forEach((c) => c.destroy());
  if (returned > 0) wallet.add(returned);
  S.ledger.push({ staked, returned });
  showRoundResult(returned - staked, label, bj);
  endRound();
}

function endRound() {
  S.hands.forEach((h) => (h.bet = 0));
  S.bet = 0;
  S.insurance = 0;
  setPhase('betting');
  drawBetStack();
}

// big, friendly round summary: net result + last-win stat
function showRoundResult(net, label = null, bj = false) {
  net = cents(net);
  const el = $('last-win');
  el.textContent = net > 0 ? `+${money(net)}` : net === 0 ? money(0) : `−${money(-net)}`;
  el.parentElement.classList.remove('flash');
  void el.offsetWidth;
  el.parentElement.classList.add('flash');

  if (bj) {
    play('blackjack');
    const b = new Sprite(TEX.win_blackjack);
    b.anchor.set(0.5);
    b.position.set(L.cx, L.top + L.ah * 0.48);
    const k = Math.min(L.aw * 0.7, 640) / b.texture.width;
    b.scale.set(k * 0.3);
    fx.addChild(b);
    motion.tween(b, { scale: k }, 600, ease.outElastic)
      .then(() => motion.wait(1100))
      .then(() => motion.tween(b, { alpha: 0 }, 400))
      .then(() => b.destroy());
  } else if (net > 0) play('win');
  else if (net < 0) play('bust');
  else play('push');

  // amount on top, plain-language result below, on a dark glass plaque – readable on any table state
  const title = new GoldText(900, 150, 80, net >= 0 ? {} : { palette: 'white', glow: 'rgba(255,80,80,.7)', stroke: '#2a0606' });
  title.text = label ?? (net > 0 ? `+${money(net)}` : net === 0 ? 'PUSH' : `−${money(-net)}`);
  const sub = new GoldText(700, 70, 30, { palette: 'white', glow: 'rgba(0,0,0,.6)', stroke: '#06101c' });
  sub.text = net > 0 ? tr('GEWONNEN', 'YOU WIN') : net < 0 ? tr('VERLOREN', 'YOU LOSE') : tr('UNENTSCHIEDEN – EINSATZ ZURÜCK', 'TIE – BET RETURNED');
  sub.y = 62;
  const t = plaqueText(title, sub, 10);
  t.position.set(L.cx, L.top + L.ah * (bj ? 0.72 : 0.5));
  const tb = t.getLocalBounds();
  const k = Math.min(1, L.aw / 760, (app.screen.width * 0.9) / tb.width, (L.ah * 0.32) / tb.height);
  t.scale.set(0.3 * k);
  fx.addChild(t);
  motion.tween(t, { scale: k }, 420, ease.outBack)
    .then(() => motion.wait(1100))
    .then(() => motion.tween(t, { alpha: 0, y: t.y - 40 }, 450))
    .then(() => t.destroy({ children: true }));
}

// Real audit: baseline is the balance when the table opened, not derived from the ledger itself.
function audit() {
  const staked = S.ledger.reduce((a, r) => a + r.staked, 0);
  const returned = S.ledger.reduce((a, r) => a + r.returned, 0);
  const inPlay = S.phase === 'betting' ? 0 : S.hands.reduce((a, h) => a + h.bet, 0) + S.insurance;
  const expected = cents(S.start - staked + returned - inPlay);
  return { rounds: S.ledger.length, staked: cents(staked), returned: cents(returned), expected, balance: wallet.balance, ok: Math.abs(expected - wallet.balance) < 0.011 };
}
