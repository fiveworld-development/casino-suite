// Haze Kings 420 – game math (pure, no rendering).
// 7x7 grid, cluster pays (min 5 connected, 4-directional), tumbles.
//
// Hotbox: every cell where a winner explodes gets a smoke marker. Explode again on that same
// cell (within the spin, or the whole free-spin round) and it becomes a x2 multiplier field that
// doubles on every further hit, up to HOTBOX_MAX. All hotbox multipliers under a winning cluster
// are ADDED, then the SUM is capped at TUNING.multCap before it's applied to that cluster's win –
// without this cap a long free-spin round (many cells stacking multipliers) or Cloud 9 (grid
// pre-seeded with multipliers) compounds without bound and blows both variance and RTP up wildly.
//
// Grinder-Wild: when a wild is part of a winning cluster, its 8 neighbours are ground into wilds
// in place (no removal) right before the cascade falls, so they can join the very next evaluation.
//
// Blaze: a rare event turns one whole row or column into a single premium symbol before the first
// evaluation of a base-game spin – a guaranteed cluster.
// Big Smoke: a rare event seeds 3-6 cells with a starting hotbox multiplier (x2/x4/x8).
//
// A spin is resolved completely up front into a list of steps the renderer plays back.

export const SIZE = 7;
export const MIN_CLUSTER = 5;
export const MAX_WIN_X = 5000; // honest cap: millions of simulated spins peak around ~2,000x
export const MAX_TUMBLES = 40; // hard safety cap per spin – cascades can never run forever
export const HOTBOX_MAX = 64; // per-cell ceiling (lowered from the design doc's x1024 – see docs/07-haze-kings.md)

// Tuned with scripts/sim-haze-kings.js – see docs/07-haze-kings.md.
// multCap: hard ceiling on the SUMMED hotbox multiplier applied to one cluster's win – the real
// lever that keeps RTP variance and Cloud 9's payout in a sane band (see doc for the rebalance).
// fsScale: free-spin/Cloud 9 wins get their own flat multiplier on top of payScale, so the
// free-spin and base-game economics can be tuned independently (like Kraken's Hoard's fsScale).
export const TUNING = { payScale: 0.040, blazeChance: 0.02, smokeChance: 0.018, multCap: 16, fsScale: 2.2 }; // re-tuned with scripts/sim-session.js: more base-game wins, smaller but far more frequent features

// pays per tier at cluster sizes [5,8,11,15,20+], in multiples of total bet (before payScale)
// Flatter than a classic paytable on purpose: a small cluster – by far the most common win – has
// to be worth something, the huge clusters stay exciting without eating the whole budget.
export const SYMBOLS = {
  king:       { pays: [3.5, 7, 18, 45, 120], weight: 2 },
  bong:       { pays: [2.8, 5.5, 13, 30, 80], weight: 4 },
  joint:      { pays: [2.2, 4.2, 9.5, 22, 55], weight: 6 },
  grinder:    { pays: [1.8, 3.4, 7, 16, 40], weight: 8 },
  lighter:    { pays: [1.5, 2.8, 5.5, 13, 30], weight: 10 },
  bud_green:  { pays: [1.1, 2.1, 4, 9, 20], weight: 13 },
  bud_purple: { pays: [1.1, 2.1, 4, 9, 20], weight: 13 },
  bud_orange: { pays: [1, 1.9, 3.6, 8, 18], weight: 14 },
  bud_blue:   { pays: [1, 1.9, 3.6, 8, 18], weight: 14 },
  wild:       { pays: null, weight: 1.4 },
  scatter:    { pays: null, weight: 0.55 },
};
export const PAYING = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].pays);
export const PREMIUM = ['king', 'bong', 'joint']; // Blaze picks from these
const BREAKS = [5, 8, 11, 15, 20];

export const FREE_SPINS_AWARD = { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 };
export const FREE_SPINS_RETRIGGER = 5;
export const CLOUD9_SCATTERS = 7;
// Cloud 9 used to pre-seed EVERY cell with x2 – combined with the additive cluster sum that made
// almost every win hit the (then unbounded) multiplier ceiling on spin 1 of a 30-spin round, for
// an absurd ~6,000x average. Real "super mode" features are a strong step up from the base bonus,
// not a 75x one. Only a handful of random cells start charged now, and multCap (above) bounds the
// rest – see docs/07-haze-kings.md for the measured before/after.
export const CLOUD9_SEED_CELLS = 10;

export function makeCloud9Hotbox(rng) {
  const hb = new Array(SIZE * SIZE).fill(0);
  const used = new Set();
  while (used.size < CLOUD9_SEED_CELLS) {
    const p = Math.floor(rng() * SIZE * SIZE);
    if (used.has(p)) continue;
    used.add(p);
    hb[p] = 2;
  }
  return hb;
}

// ---------------------------------------------------------------------------------------------
// THE GROW – the progression that runs through every session.
// Every winning cluster and every scatter feeds the plant. Each stage pays out its own bonus;
// after the harvest a new plant starts. Bonuses are part of the RTP budget (scripts/sim-session.js)
// and pay in multiples of the AVERAGE bet of that stage, so raising the bet late gains nothing.
export const GROW = { leavesScale: 1 };
export const STAGES = [
  { key: 'seedling', leaves: 165, reward: { type: 'pick', scale: 1.19 } },
  { key: 'sprout', leaves: 210, reward: { type: 'seed', cells: 10 } },
  { key: 'veg', leaves: 255, reward: { type: 'pick', scale: 1.82 } },
  { key: 'flower', leaves: 300, reward: { type: 'fs', spins: 5, seed: 12 } },
  { key: 'harvest', leaves: 360, reward: { type: 'fs', spins: 8, cloud9: true } },
];
export const JAR_VALUES = [[1, 30], [2, 26], [3, 18], [5, 12], [8, 7], [12, 4], [20, 2], [50, 1]]; // x avg bet, before stage scale
export const JARS = 9, JAR_PICKS = 3;

export const initialGrow = () => ({ stage: 0, leaves: 0, betSum: 0, spins: 0, plant: 1 });
export const stageLeaves = (stage) => Math.round(STAGES[stage].leaves * GROW.leavesScale);

/** Leaves a finished base-game spin feeds the plant: 1 per winning cluster, 2 per scatter. */
export function leavesFor(result) {
  let n = 0;
  for (const s of result.steps) if (s.t === 'win') n += s.wins.length;
  return n + 2 * Math.min(result.scatters ?? 0, 7);
}

/** Advance the grow after a paid base spin; `grown` = { stage, avgBet } when a stage is completed. */
export function advanceGrow(g, result, bet) {
  const next = { ...g, leaves: g.leaves + leavesFor(result), betSum: g.betSum + bet, spins: g.spins + 1 };
  if (next.leaves < stageLeaves(next.stage)) return { grow: next, grown: null };
  const grown = { stage: next.stage, avgBet: next.betSum / next.spins };
  const last = next.stage === STAGES.length - 1;
  return { grow: { stage: last ? 0 : next.stage + 1, leaves: 0, betSum: 0, spins: 0, plant: next.plant + (last ? 1 : 0) }, grown };
}

/** Jar pick: JARS jars with independent values, the player opens JAR_PICKS. */
export function jarBonus(scale, rng = Math.random) {
  const jars = Array.from({ length: JARS }, () => Math.round(weighted(JAR_VALUES, rng) * scale * 100) / 100);
  return { jars, total: jars.slice(0, JAR_PICKS).reduce((a, b) => a + b, 0) }; // values are iid, so "the first three" = any three
}

/** Seed `n` random cells of a hotbox with x2 – used by the sprout reward and the flower free spins. */
export function seedHotbox(n, rng = Math.random, hotbox = new Array(SIZE * SIZE).fill(0)) {
  const hb = [...hotbox];
  const used = new Set();
  while (used.size < Math.min(n, SIZE * SIZE)) {
    const p = Math.floor(rng() * SIZE * SIZE);
    if (used.has(p)) continue;
    used.add(p);
    hb[p] = Math.max(hb[p], 2);
  }
  return hb;
}

/** Free-spin stage (flower / harvest): starts on a pre-lit Hotbox. */
export function growFreeSpins(reward, rng = Math.random) {
  return { spins: reward.spins, hotbox: reward.cloud9 ? makeCloud9Hotbox(rng) : seedHotbox(reward.seed ?? 0, rng) };
}

const weighted = (table, rng) => {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[table.length - 1][0];
};

function pick(rng, noScatter, scatterBoost = 1) {
  let total = 0;
  const table = [];
  for (const [s, d] of Object.entries(SYMBOLS)) {
    if (s === 'scatter' && noScatter) continue;
    total += s === 'scatter' ? d.weight * scatterBoost : d.weight;
    table.push([s, total]);
  }
  const r = rng() * total;
  return table.find(([, w]) => r < w)[0];
}

const idx = (r, c) => r * SIZE + c;
const countScatters = (grid) => grid.filter((s) => s === 'scatter').length;

export function freshGrid(rng, scatterBoost = 1) {
  const grid = new Array(SIZE * SIZE);
  // fill top-down, first pass ignoring the max-1-scatter-per-column soft rule is fine for a 7x7
  let scatters = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const s = pick(rng, scatters >= 7, scatterBoost);
    if (s === 'scatter') scatters++;
    grid[i] = s;
  }
  return grid;
}

// 4-directional flood fill clusters of size >= MIN_CLUSTER. Wild joins any symbol's cluster.
// An all-wild cluster pays as the top symbol (king).
export function findClusters(grid) {
  const seen = new Array(SIZE * SIZE).fill(false);
  const clusters = [];
  for (const sym of PAYING) {
    for (let start = 0; start < SIZE * SIZE; start++) {
      if (seen[start]) continue;
      const g0 = grid[start];
      if (g0 !== sym && g0 !== 'wild') continue;
      // BFS this connected group of {sym, wild}
      const stack = [start];
      const cells = [];
      const localSeen = new Set([start]);
      while (stack.length) {
        const p = stack.pop();
        cells.push(p);
        const r = Math.floor(p / SIZE), c = p % SIZE;
        const nbrs = [];
        if (r > 0) nbrs.push(idx(r - 1, c));
        if (r < SIZE - 1) nbrs.push(idx(r + 1, c));
        if (c > 0) nbrs.push(idx(r, c - 1));
        if (c < SIZE - 1) nbrs.push(idx(r, c + 1));
        for (const n of nbrs) {
          if (localSeen.has(n)) continue;
          const gv = grid[n];
          if (gv === sym || gv === 'wild') { localSeen.add(n); stack.push(n); }
        }
      }
      // only the purely-wild sub-groups get marked seen once per real symbol pass; to avoid
      // double counting an all-wild patch under every symbol, require at least one non-wild cell
      // UNLESS this is the highest-ranked symbol pass (king) – then let a pure-wild group pay too.
      const hasReal = cells.some((p) => grid[p] === sym);
      if (!hasReal && sym !== PREMIUM[0]) continue;
      for (const p of cells) seen[p] = true;
      if (cells.length >= MIN_CLUSTER) clusters.push({ sym, cells });
    }
  }
  return clusters;
}

function payFor(sym, count) {
  let tier = 0;
  for (let i = 0; i < BREAKS.length; i++) if (count >= BREAKS[i]) tier = i;
  return SYMBOLS[sym].pays[tier];
}

// hotbox[i] = 0 none, -1 smoked (no mult yet), or 2..HOTBOX_MAX (active multiplier)
export function evaluate(grid, hotbox, free = false) {
  const clusters = findClusters(grid);
  if (!clusters.length) return { wins: [], x: 0, cells: [] };
  const scale = TUNING.payScale * (free ? TUNING.fsScale : 1);
  const wins = [];
  const allCells = new Set();
  for (const cl of clusters) {
    let mult = 0;
    for (const p of cl.cells) if (hotbox[p] > 0) mult += hotbox[p];
    mult = Math.max(1, Math.min(TUNING.multCap, mult));
    const base = payFor(cl.sym, cl.cells.length) * scale;
    const x = base * mult;
    wins.push({ sym: cl.sym, count: cl.cells.length, mult, x, cells: cl.cells });
    for (const p of cl.cells) allCells.add(p);
  }
  return { wins, x: wins.reduce((a, w) => a + w.x, 0), cells: [...allCells] };
}

function bumpHotbox(hotbox, cells) {
  for (const p of cells) {
    if (hotbox[p] === 0) hotbox[p] = -1;
    else if (hotbox[p] === -1) hotbox[p] = 2;
    else hotbox[p] = Math.min(HOTBOX_MAX, hotbox[p] * 2);
  }
}

// Grinder-Wild: neighbours of an exploding wild are ground into wilds in place.
function grindNeighbours(grid, wildCells, removed) {
  const forced = new Set();
  for (const p of wildCells) {
    const r = Math.floor(p / SIZE), c = p % SIZE;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
        const p2 = idx(rr, cc);
        if (!removed.has(p2)) forced.add(p2);
      }
  }
  for (const p of forced) grid[p] = 'wild';
  return forced;
}

function cascade(grid, removedSet, rng, scatterBoost) {
  // drop survivors down within each column, fill from top
  const moves = [], fresh = [];
  for (let c = 0; c < SIZE; c++) {
    const col = [];
    for (let r = 0; r < SIZE; r++) { const p = idx(r, c); if (!removedSet.has(p)) col.push({ from: r, sym: grid[p] }); }
    const newCol = new Array(SIZE).fill(null);
    for (let i = 0; i < col.length; i++) {
      const to = SIZE - col.length + i;
      newCol[to] = col[i].sym;
      if (to !== col[i].from) moves.push({ c, from: col[i].from, to });
    }
    for (let r = 0; r < SIZE - col.length; r++) {
      const s = pick(rng, countScatters(newCol.filter(Boolean)) >= 3, scatterBoost);
      newCol[r] = s;
      fresh.push({ c, r, sym: s });
    }
    for (let r = 0; r < SIZE; r++) grid[idx(r, c)] = newCol[r];
  }
  return { moves, fresh };
}

export const initialState = () => ({});

/**
 * Resolve one spin.
 * state: { free, hotbox, scatterBoost } – hotbox persists across the whole free-spin round.
 * Returns { steps, x, hotbox, scatters, award, capped }.
 */
export function spin(state = {}, rng = Math.random) {
  const free = !!state.free;
  const scatterBoost = state.scatterBoost ?? 1;
  // Hotbox persists: in free spins for the whole round; in the base game from spin to spin as long
  // as every spin wins – a spin without any win clears it (see end of spin).
  const hotbox = [...(state.hotbox ?? new Array(SIZE * SIZE).fill(0))];
  const steps = [];

  let grid = freshGrid(rng, scatterBoost);
  let grindBudget = 2; // the grind can only fire a couple of times per spin – it must not chain-explode

  // Big Smoke: rare, seeds a few hotbox cells with a starting multiplier
  if (rng() < TUNING.smokeChance) {
    const n = 3 + Math.floor(rng() * 4); // 3..6
    const cells = [];
    const used = new Set();
    while (cells.length < n) {
      const p = Math.floor(rng() * SIZE * SIZE);
      if (used.has(p)) continue;
      used.add(p);
      cells.push(p);
      const start = [2, 4, 8][Math.floor(rng() * 3)];
      if (hotbox[p] < start) hotbox[p] = start;
    }
    steps.push({ t: 'bigsmoke', cells });
  }

  // Blaze: rare, turns one row/column into one premium symbol – guarantees a cluster
  if (rng() < TUNING.blazeChance) {
    const sym = PREMIUM[Math.floor(rng() * PREMIUM.length)];
    const isRow = rng() < 0.5;
    const n = Math.floor(rng() * SIZE);
    const cells = [];
    for (let k = 0; k < SIZE; k++) { const p = isRow ? idx(n, k) : idx(k, n); grid[p] = sym; cells.push(p); }
    steps.push({ t: 'blaze', sym, isRow, n, cells });
  }

  steps.push({ t: 'drop', grid: [...grid], hotbox: [...hotbox] });

  let total = 0;
  for (let chain = 0; chain < MAX_TUMBLES; chain++) {
    const ev = evaluate(grid, hotbox, free);
    if (!ev.wins.length) break;
    total += ev.x;

    // Grinder-Wild: wild cells inside any winning cluster grind their 8 neighbours into wilds
    const removed = new Set(ev.cells);
    const wildCells = grindBudget > 0 ? ev.cells.filter((p) => grid[p] === 'wild') : [];
    const ground = wildCells.length ? grindNeighbours(grid, wildCells, removed) : new Set();
    if (ground.size) grindBudget--;

    bumpHotbox(hotbox, ev.cells);
    steps.push({ t: 'win', wins: ev.wins, cells: ev.cells, ground: [...ground], x: ev.x, total, hotbox: [...hotbox] });

    const { moves, fresh } = cascade(grid, removed, rng, scatterBoost);
    steps.push({ t: 'tumble', removed: [...removed], moves, fresh, grid: [...grid], total });
    if (total >= MAX_WIN_X) break;
  }

  total = Math.min(total, MAX_WIN_X);
  const scatters = countScatters(grid);
  let award = 0, cloud9 = false;
  if (!free && scatters >= 3) { award = FREE_SPINS_AWARD[Math.min(scatters, 7)]; cloud9 = scatters >= CLOUD9_SCATTERS; }
  if (free && scatters >= 3) award = FREE_SPINS_RETRIGGER;
  if (award) steps.push({ t: 'scatter', count: scatters, award, cloud9 });

  // base game: a dead spin extinguishes the hotbox; any win keeps it glowing for the next spin
  const cleared = !free && total === 0 && hotbox.some((v) => v !== 0);
  if (!free && total === 0) hotbox.fill(0);
  if (cleared) steps.push({ t: 'hotboxClear' });

  return { steps, x: total, hotbox, scatters, award, cloud9, capped: total >= MAX_WIN_X };
}
