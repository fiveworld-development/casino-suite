// Kraken's Hoard 2.0 – game math (pure, no rendering).
// 6 reels, 4..8 rows, pay-anywhere-ways from reel 1, tumbles.
//
// Progression (persists between spins):
//   rows   – blasted planks STAY open. A spin without any win slams one plank shut again.
//   meter  – every blasted plank charges the Kraken meter; full meter = guaranteed Kraken strike.
// Kraken strike: a reel turns fully wild with a multiplier (x2–x10) that stays for all tumbles of
// the spin – and in free spins it stays sticky until the round ends.
// Planks hide loot: coins (instant win) or Kraken eyes (+2 meter).
//
// A spin is resolved completely up front into a list of steps the renderer plays back.

export const COLS = 6;
export const MIN_ROWS = 4;
export const MAX_ROWS = 8;
export const MAX_WIN_X = 10000;
export const METER_MAX = 30;
export const METER_MAX_FS = Number(globalThis.process?.env?.MFS ?? 10); // Kraken's Wrath needs a full meter – charges faster in the storm
export const MAX_TUMBLES = 25; // safety cap per spin

// Tuned with scripts/sim-krakens-hoard.js – see docs/01-krakens-hoard.md.
// fsScale: free spins keep planks AND sticky Kraken reels open, so their per-way pay is lower
// (real slots do this with separate free-spin reel sets).
export const TUNING = { payScale: 0.116, fsScale: 0.20, stack: 0.35, rowExp: 3 }; // re-tuned with scripts/sim-session.js: more base wins, smaller but far more frequent features

// pays for 3,4,5,6 reels, in multiples of total bet (before payScale), per way
export const SYMBOLS = {
  captain: { pays: [1.5, 3, 6, 15], weight: 4 },
  parrot:  { pays: [1, 2, 4, 8],    weight: 6 },
  chest:   { pays: [0.75, 1.5, 3, 6], weight: 7 },
  ship:    { pays: [0.5, 1, 2, 4],  weight: 9 },
  rum:     { pays: [0.4, 0.8, 1.5, 3], weight: 11 },
  pistol:  { pays: [0.3, 0.6, 1.2, 2.5], weight: 12 },
  A:       { pays: [0.2, 0.4, 0.75, 1.5], weight: 16 },
  K:       { pays: [0.15, 0.3, 0.5, 1], weight: 18 },
  Q:       { pays: [0.15, 0.3, 0.5, 1], weight: 20 },
  J:       { pays: [0.1, 0.2, 0.4, 0.8], weight: 21 },
  T:       { pays: [0.1, 0.2, 0.4, 0.8], weight: 22 },
  wild:    { pays: null, weight: 1.2 }, // reels 2-5 only
  scatter: { pays: null, weight: 3.2 }, // max 1 per reel
};
export const PAYING = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].pays);

export const FREE_SPINS_AWARD = { 3: 10, 4: 12, 5: 15, 6: 20 };
export const FREE_SPINS_RETRIGGER = 5;
export const KRAKEN_CHANCE = { base: 0.02, free: 0.03 }; // random strikes on top of the meter
export const MAX_KRAKEN_REELS = 2; // sticky Kraken reels at once (free spins)
export const KRAKEN_MULTS = {
  base: [[2, 65], [3, 27], [5, 8]],
  free: [[2, 55], [3, 30], [5, 12], [10, 3]],
  wrath: [[0, 100]], // Wrath reels are pure wilds (0 = no extra multiplier); sticky reel multipliers still apply
};

// Free-spin choice: same average value, different volatility (tuned with the simulator).
// spins = base + perScatter × (scatters − 3); start = sticky Kraken reels / full meter at start.
export const FS_OPTIONS = {
  storm: { name: 'Sturmflut', base: 10, perScatter: 3, sticky: 0, wrath: false },
  hunt: { name: 'Kraken-Jagd', base: 5, perScatter: 1, sticky: 1, wrath: false },
  fury: { name: 'Tiefsee-Wut', base: 6, perScatter: 1, sticky: 0, wrath: true },
};

/** Initial free-spin state for a chosen option. */
export function freeSpinSetup(key, scatters, rng = Math.random) {
  const o = FS_OPTIONS[key];
  const sticky = [];
  const reels = o.sticky === 2 ? (rng() < 0.5 ? [1, 3] : [2, 4]) : o.sticky === 1 ? [1 + Math.floor(rng() * 4)] : [];
  for (const reel of reels) sticky.push({ reel, mult: weighted(KRAKEN_MULTS.free, rng) }); // start reel: x2–x10
  return { spins: o.base + o.perScatter * (Math.min(scatters, 6) - 3), sticky, meter: o.wrath ? METER_MAX_FS : 0 };
}
// ---------------------------------------------------------------------------------------------
// THE VOYAGE – the story that runs through every session.
// Blasted planks, scatters and Kraken strikes earn nautical miles. Every island on the chart
// pays out an island bonus; after the last island (the Kraken's lair) a new voyage begins.
// Island bonuses are part of the RTP budget (scripts/sim-session.js) and are paid in multiples of
// the AVERAGE bet played on the way there, so switching bets right before an island gains nothing.
export const VOYAGE = { milesScale: 1 };
export const ISLANDS = [
  { key: 'treasure', miles: 121, reward: { type: 'pick', scale: 0.85 } },
  { key: 'smugglers', miles: 143, reward: { type: 'pick', scale: 1.15 } },
  { key: 'ghostship', miles: 165, reward: { type: 'fs', spins: 2, mults: [2] } },
  { key: 'sirens', miles: 187, reward: { type: 'pick', scale: 1.5 } },
  { key: 'lair', miles: 220, reward: { type: 'fs', spins: 3, mults: [3], wrath: true } },
];
export const CHEST_VALUES = [[1, 30], [2, 26], [3, 18], [5, 12], [8, 7], [12, 4], [20, 2], [50, 1]]; // x avg bet, before island scale
export const CHESTS = 9, CHEST_PICKS = 3;

export const initialVoyage = () => ({ island: 0, miles: 0, betSum: 0, spins: 0, voyage: 1 });
export const islandMiles = (island) => Math.round(ISLANDS[island].miles * VOYAGE.milesScale);

/** Miles a finished base-game spin earns: 1 per blasted plank, 2 per scatter, 3 per Kraken strike. */
export function milesFor(result) {
  let m = 0;
  for (const s of result.steps) {
    if (s.t === 'tumble' && s.grew) m += 1;
    if (s.t === 'kraken' || s.t === 'wrath') m += 3;
  }
  return m + 2 * Math.min(result.scatters ?? 0, 6);
}

/**
 * Advance the voyage after a paid base-game spin. Returns the new voyage state and, when an island
 * is reached, `arrived` = { island, avgBet } – the caller then plays the island bonus.
 */
export function advanceVoyage(v, result, bet) {
  const next = { ...v, miles: v.miles + milesFor(result), betSum: v.betSum + bet, spins: v.spins + 1 };
  if (next.miles < islandMiles(next.island)) return { voyage: next, arrived: null };
  const arrived = { island: next.island, avgBet: next.betSum / next.spins };
  const last = next.island === ISLANDS.length - 1;
  return { voyage: { island: last ? 0 : next.island + 1, miles: 0, betSum: 0, spins: 0, voyage: next.voyage + (last ? 1 : 0) }, arrived };
}

/** Treasure pick: CHESTS chests with independent values; the player opens CHEST_PICKS of them. */
export function chestBonus(scale, rng = Math.random) {
  const chests = Array.from({ length: CHESTS }, () => Math.round(weighted(CHEST_VALUES, rng) * scale * 100) / 100);
  return { chests, total: chests.slice(0, CHEST_PICKS).reduce((a, b) => a + b, 0) }; // values are iid, so "the first three" = any three
}

/** Free-spin island (ghost ship / lair): starts with sticky Kraken reels (and a full Wrath meter in the lair). */
export function islandFreeSpins(reward, rng = Math.random) {
  const reels = [1, 3, 4].sort(() => rng() - 0.5).slice(0, reward.mults.length);
  return { spins: reward.spins, sticky: reward.mults.map((mult, i) => ({ reel: reels[i], mult })), meter: reward.wrath ? METER_MAX_FS : 0 };
}

export const LOOT = [['coin', 0.24], ['eye', 0.24]]; // remaining chance: empty plank
export const COIN_VALUES = [[1, 46], [2, 28], [3, 14], [5, 8], [10, 3], [25, 1]]; // x bet – a plank coin is always worth at least the bet

const weighted = (table, rng) => {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[table.length - 1][0];
};

// Scatter chance per cell shrinks as the grid grows, so a bigger deck doesn't mean more bonuses.
function pick(col, rng, noScatter, rows = MIN_ROWS) {
  let total = 0;
  const table = [];
  for (const [s, d] of Object.entries(SYMBOLS)) {
    if (s === 'wild' && (col === 0 || col === COLS - 1)) continue;
    if (s === 'scatter' && noScatter) continue;
    total += s === 'scatter' ? d.weight * (MIN_ROWS / rows) : d.weight;
    table.push([s, total]);
  }
  const r = rng() * total;
  return table.find(([, w]) => r < w)[0];
}

const hasScatter = (column, rows) => column.slice(MAX_ROWS - rows).includes('scatter');

// grid[c][r]; r = 0 is the very top row, active rows are the bottom `rows` rows.
// Filled bottom-up; symbols stack onto the one below (like real reel strips).
function fillColumn(column, c, rows, rng) {
  for (let r = MAX_ROWS - 1; r >= MAX_ROWS - rows; r--) {
    if (column[r] != null) continue;
    const below = column[r + 1];
    column[r] = below && PAYING.includes(below) && rng() < TUNING.stack
      ? below
      : pick(c, rng, hasScatter(column, rows), rows);
  }
}

export function freshGrid(rows, rng) {
  const grid = [];
  for (let c = 0; c < COLS; c++) {
    const col = new Array(MAX_ROWS).fill(null);
    fillColumn(col, c, rows, rng);
    grid.push(col);
  }
  return grid;
}

const wildReel = (grid, c, rows) => {
  for (let r = MAX_ROWS - rows; r < MAX_ROWS; r++) grid[c][r] = 'wild';
};

// Pay per way shrinks with deck size: 8 rows has 64× the ways of 4 rows but should be worth
// only ~4× as much – building the deck pays off without breaking the bank (like Megaways titles).
export const rowFactor = (rows) => (MIN_ROWS / rows) ** TUNING.rowExp;

/** reelMult[c] = multiplier of a Kraken reel on reel c. */
export function evaluate(grid, rows, reelMult = [], free = false) {
  const scale = TUNING.payScale * (free ? TUNING.fsScale : 1);
  const top = MAX_ROWS - rows;
  const wins = [];
  const cells = new Set();
  for (const s of PAYING) {
    const counts = [];
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let r = top; r < MAX_ROWS; r++) if (grid[c][r] === s || grid[c][r] === 'wild') n++;
      if (!n) break;
      counts.push(n);
    }
    if (counts.length < 3) continue;
    const ways = counts.reduce((a, b) => a * b, 1);
    // Kraken reel multipliers in the win are ADDED (x5 + x10 = x15)
    let m = 0;
    for (let c = 0; c < counts.length; c++) m += reelMult[c] ?? 0;
    m = Math.max(m, 1);
    const x = SYMBOLS[s].pays[counts.length - 3] * ways * scale * rowFactor(rows) * m;
    wins.push({ sym: s, reels: counts.length, ways, mult: m, x });
    for (let c = 0; c < counts.length; c++)
      for (let r = top; r < MAX_ROWS; r++)
        if (grid[c][r] === s || grid[c][r] === 'wild') cells.add(`${c},${r}`);
  }
  return { wins, x: wins.reduce((a, w) => a + w.x, 0), cells: [...cells].map((k) => k.split(',').map(Number)) };
}

export const countScatters = (grid, rows) =>
  grid.reduce((n, col) => n + (hasScatter(col, rows) ? 1 : 0), 0);

const clone = (grid) => grid.map((c) => [...c]);

export const initialState = () => ({ rows: MIN_ROWS, meter: 0 });

/**
 * Resolve one spin.
 * state: { rows, meter, free, sticky } – sticky = [{ reel, mult }] Kraken reels (free spins only).
 * Returns { steps, x, rows, meter, sticky, scatters, award } – x is the total win in bet multiples
 * (tumbles + plank coins), rows/meter/sticky are the state for the next spin.
 */
export function spin(state, rng = Math.random) {
  const free = !!state.free;
  let rows = state.rows ?? MIN_ROWS;
  let meter = state.meter ?? 0;
  const sticky = free ? (state.sticky ?? []).map((k) => ({ ...k })) : [];
  const steps = [];

  const temp = []; // Kraken's Wrath reels: wild for this spin only
  const reelMult = () => {
    const m = [];
    for (const k of [...sticky, ...temp]) m[k.reel] = k.mult;
    return m;
  };

  let grid = freshGrid(rows, rng);
  for (const k of sticky) wildReel(grid, k.reel, rows);
  steps.push({ t: 'drop', grid: clone(grid), rows, sticky: sticky.map((k) => ({ ...k })) });

  const full = meter >= (free ? METER_MAX_FS : METER_MAX);
  if (free && full) {
    // KRAKEN'S WRATH (free spins, full meter): three reels go wild at once with multipliers.
    // Never reels 2+3 together (endless tumble) – so the set is {2,4,5} or {3,4,5} (1-based).
    const has = (c) => sticky.some((k) => k.reel === c);
    const set = has(1) ? [1, 3, 4] : has(2) ? [2, 3, 4] : [1, 3, 4];
    for (const reel of set) {
      if (has(reel)) continue;
      const mult = weighted(KRAKEN_MULTS.wrath, rng);
      temp.push({ reel, mult });
      wildReel(grid, reel, rows);
    }
    meter = 0;
    steps.push({ t: 'wrath', reels: temp.map((k) => ({ ...k })), meter, grid: clone(grid) });
  } else if (full || rng() < (free ? KRAKEN_CHANCE.free : KRAKEN_CHANCE.base)) {
    // Kraken strike: guaranteed when the meter is full, rare random otherwise
    // Wild reels 2+3 together would make every reel-1 symbol win forever (endless tumble) – never allow that pair.
    const has = (c) => sticky.some((k) => k.reel === c);
    const open = sticky.length >= MAX_KRAKEN_REELS ? []
      : [1, 2, 3, 4].filter((c) => !has(c) && !(c === 1 && has(2)) && !(c === 2 && has(1)));
    if (open.length) {
      const reel = open[Math.floor(rng() * open.length)];
      const mult = weighted(KRAKEN_MULTS[free ? 'free' : 'base'], rng);
      sticky.push({ reel, mult });
      wildReel(grid, reel, rows);
      if (full) meter = 0;
      steps.push({ t: 'kraken', reel, mult, fromMeter: full, meter, grid: clone(grid) });
    }
  }

  let total = 0;
  for (let chain = 0; chain < MAX_TUMBLES; chain++) {
    const ev = evaluate(grid, rows, reelMult(), free);
    if (!ev.wins.length) break;
    total += ev.x;
    steps.push({ t: 'win', wins: ev.wins, cells: ev.cells, x: ev.x, total });

    // Kraken reels are not blown away – they stay for every tumble of the spin.
    const isSticky = (c) => sticky.some((k) => k.reel === c) || temp.some((k) => k.reel === c);
    const removed = new Set(ev.cells.filter(([c]) => !isSticky(c)).map(([c, r]) => `${c},${r}`));
    const grow = rows < MAX_ROWS;
    const newRows = grow ? rows + 1 : rows;
    const moves = [];
    const fresh = [];
    const next = [];
    for (let c = 0; c < COLS; c++) {
      const survivors = [];
      for (let r = MAX_ROWS - 1; r >= MAX_ROWS - rows; r--)
        if (!removed.has(`${c},${r}`)) survivors.push({ from: r, sym: grid[c][r] });
      const col = new Array(MAX_ROWS).fill(null);
      survivors.forEach((s, i) => {
        const to = MAX_ROWS - 1 - i;
        col[to] = s.sym;
        if (to !== s.from) moves.push({ c, from: s.from, to });
      });
      fillColumn(col, c, newRows, rng);
      if (isSticky(c)) for (let r = MAX_ROWS - newRows; r < MAX_ROWS; r++) col[r] = 'wild';
      for (let r = MAX_ROWS - newRows; r < MAX_ROWS - survivors.length; r++) fresh.push({ c, r, sym: col[r] });
      next.push(col);
    }

    // a blasted plank charges the meter and may hide loot
    let loot = null;
    if (grow) {
      meter = Math.min(free ? METER_MAX_FS : METER_MAX, meter + 1);
      const roll = rng();
      if (roll < LOOT[0][1]) {
        loot = { type: 'coin', x: weighted(COIN_VALUES, rng) };
        total += loot.x;
      } else if (roll < LOOT[0][1] + LOOT[1][1]) {
        loot = { type: 'eye' };
        meter = Math.min(free ? METER_MAX_FS : METER_MAX, meter + 2);
      }
    }
    grid = next;
    steps.push({ t: 'tumble', removed: [...removed].map((k) => k.split(',').map(Number)), moves, fresh, grid: clone(grid), rows: newRows, grew: grow, loot, meter, total });
    rows = newRows;
    if (total >= MAX_WIN_X) break;
  }

  if (total > MAX_WIN_X) total = MAX_WIN_X;
  const scatters = countScatters(grid, rows);
  let award = 0;
  if (!free && scatters >= 3) award = FREE_SPINS_AWARD[Math.min(scatters, 6)];
  if (free && scatters >= 3) award = FREE_SPINS_RETRIGGER;
  if (award) steps.push({ t: 'scatter', count: scatters, award });

  // keep blasting or lose ground: a spin that breaks no plank lets one slam shut again
  const blasted = steps.some((s) => s.grew);
  const nextRows = !blasted && rows > MIN_ROWS ? rows - 1 : rows;

  return { steps, x: total, rows: nextRows, endRows: rows, meter, sticky: free ? sticky : [], scatters, award, capped: total >= MAX_WIN_X };
}
