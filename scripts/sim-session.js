// "How does it feel?" – simulates real player sessions instead of just the long-run RTP.
// Each session starts with 100 bets and plays up to 300 spins at a fixed bet (1).
// Progress features (Kraken voyage / Haze grow) carry over between sessions, like in the game.
// Usage: node scripts/sim-session.js [sessions] [kraken|haze]
//   Kraken env: SCALE FSSCALE SCATTER MILES CHEST     Haze env: see tuning block below
import * as KH from '../src/games/krakens-hoard/math.js';
import * as HK from '../src/games/haze-kings/math.js';

const SESSIONS = Number(process.argv[2] || 20000);
const ONLY = process.argv[3];
const BANK = 100, MAX_SPINS = 300;
const env = (k) => (process.env[k] != null ? Number(process.env[k]) : null);

if (env('SCALE') != null) KH.TUNING.payScale = env('SCALE');
if (env('FSSCALE') != null) KH.TUNING.fsScale = env('FSSCALE');
if (env('SCATTER') != null) KH.SYMBOLS.scatter.weight = env('SCATTER');
if (env('MILES') != null) KH.VOYAGE.milesScale = env('MILES');
if (env('CHEST') != null) KH.ISLANDS.forEach((i) => { if (i.reward.type === 'pick') i.reward.scale *= env('CHEST'); });

function playKrakenFS(setup, fsState = {}) {
  let fs = { free: true, rows: 4, meter: setup.meter ?? 0, sticky: setup.sticky ?? [], ...fsState };
  let left = setup.spins, tot = 0;
  while (left-- > 0) {
    const f = KH.spin(fs);
    fs = { free: true, rows: f.rows, meter: f.meter, sticky: f.sticky };
    tot += f.x; left += f.award;
    if (tot >= KH.MAX_WIN_X) break;
  }
  return Math.min(tot, KH.MAX_WIN_X);
}

const kStats = { base: 0, fs: 0, island: 0, islands: 0, fsCount: 0 };
function krakenSpin(st) {
  const r = KH.spin({ ...st.base, free: false });
  st.base = { rows: r.rows, meter: r.meter };
  let x = r.x, feature = false;
  kStats.base += r.x;
  if (r.award) {
    feature = true; kStats.fsCount++;
    const keys = Object.keys(KH.FS_OPTIONS);
    const fsx = playKrakenFS(KH.freeSpinSetup(keys[Math.floor(Math.random() * keys.length)], r.scatters));
    x += fsx; kStats.fs += fsx;
  }
  const { voyage, arrived } = KH.advanceVoyage(st.voyage, r, 1);
  st.voyage = voyage;
  if (arrived) {
    feature = true; kStats.islands++;
    const rw = KH.ISLANDS[arrived.island].reward;
    const ix = rw.type === 'pick' ? KH.chestBonus(rw.scale).total : playKrakenFS(KH.islandFreeSpins(rw));
    x += ix * arrived.avgBet; kStats.island += ix;
  }
  return { x: Math.min(x, KH.MAX_WIN_X), feature };
}

if (env('HSCALE') != null) HK.TUNING.payScale = env('HSCALE');
if (env('HFS') != null) HK.TUNING.fsScale = env('HFS');
if (env('LEAVES') != null) HK.GROW.leavesScale = env('LEAVES');
if (env('JAR') != null) HK.STAGES.forEach((s) => { if (s.reward.type === 'pick') s.reward.scale *= env('JAR'); });

function playHazeFS(spins, hotbox) {
  let hot = hotbox, left = spins, tot = 0;
  while (left-- > 0) {
    const f = HK.spin({ free: true, hotbox: hot });
    hot = f.hotbox; tot += f.x; left += f.award;
    if (tot >= HK.MAX_WIN_X) break;
  }
  return Math.min(tot, HK.MAX_WIN_X);
}

const hStats = { base: 0, fs: 0, stage: 0, stages: 0, fsCount: 0 };
function hazeSpin(st) {
  const r = HK.spin({ free: false, hotbox: st.hot });
  st.hot = r.hotbox;
  let x = r.x, feature = false;
  hStats.base += r.x;
  if (r.award) {
    feature = true; hStats.fsCount++;
    const fsx = playHazeFS(r.award, r.cloud9 ? HK.makeCloud9Hotbox(Math.random) : new Array(HK.SIZE * HK.SIZE).fill(0));
    x += fsx; hStats.fs += fsx;
  }
  const { grow, grown } = HK.advanceGrow(st.grow, r, 1);
  st.grow = grow;
  if (grown) {
    feature = true; hStats.stages++;
    const rw = HK.STAGES[grown.stage].reward;
    let gx = 0;
    if (rw.type === 'pick') gx = HK.jarBonus(rw.scale).total;
    else if (rw.type === 'seed') st.hot = HK.seedHotbox(rw.cells, Math.random, st.hot ?? undefined); // value lands on the next spins
    else { const setup = HK.growFreeSpins(rw); gx = playHazeFS(setup.spins, setup.hotbox); }
    x += gx * grown.avgBet; hStats.stage += gx;
  }
  return { x: Math.min(x, HK.MAX_WIN_X), feature };
}

function measure(name, spinFn, persistent, perSession) {
  let spinsTotal = 0, hits = 0, realWins = 0, features = 0, busted = 0, ahead100 = 0, peakAbove = 0, won = 0, dryMax = 0;
  const bustSpins = [];
  let gapSum = 0, gaps = 0;
  for (let s = 0; s < SESSIONS; s++) {
    const st = { ...persistent, ...perSession() };
    let bank = BANK, peak = BANK, streak = 0, sinceFeature = 0;
    for (let i = 1; i <= MAX_SPINS; i++) {
      if (bank < 1) { busted++; bustSpins.push(i - 1); break; }
      bank -= 1;
      const { x, feature } = spinFn(st);
      bank += x; won += x; spinsTotal++;
      if (x > 0) hits++;
      if (x >= 1) { realWins++; if (streak) { gapSum += streak; gaps++; } streak = 0; } else streak++;
      if (feature) { features++; dryMax = Math.max(dryMax, sinceFeature); sinceFeature = 0; } else sinceFeature++;
      peak = Math.max(peak, bank);
      if (i === 100 && bank > BANK) ahead100++;
    }
    if (peak > BANK * 1.2) peakAbove++;
    if (st.voyage) persistent.voyage = st.voyage;
    if (st.grow) persistent.grow = st.grow;
    if (st.base) persistent.base = st.base;
  }
  bustSpins.sort((a, b) => a - b);
  const pct = (v, n) => `${((v / n) * 100).toFixed(1)} %`;
  console.log(`\n${name}  (${SESSIONS} sessions, 100 bets, max ${MAX_SPINS} spins)`);
  console.log(`  RTP                           ${pct(won, spinsTotal)}`);
  console.log(`  any win (> 0)                 ${pct(hits, spinsTotal)}`);
  console.log(`  win >= bet                    ${pct(realWins, spinsTotal)}  – avg ${(gapSum / gaps).toFixed(1)} spins between`);
  console.log(`  feature (bonus or island)     1 in ${Math.round(spinsTotal / features)} spins`);
  console.log(`  busted before ${MAX_SPINS}             ${pct(busted, SESSIONS)}  – median after ${bustSpins[bustSpins.length >> 1] ?? '-'} spins`);
  console.log(`  ahead after 100 spins         ${pct(ahead100, SESSIONS)}`);
  console.log(`  ever +20 % above start        ${pct(peakAbove, SESSIONS)}`);
  return spinsTotal;
}

if (!ONLY || ONLY === 'kraken') {
  // the deck (open planks) and the meter persist between sessions in the real game (localStorage) – so they do here
  const n = measure("Kraken's Hoard", krakenSpin, { voyage: KH.initialVoyage(), base: KH.initialState() }, () => ({}));
  const p = (v) => `${((v / n) * 100).toFixed(1)} %`;
  console.log(`  RTP split: base ${p(kStats.base)} · free spins ${p(kStats.fs)} (1 in ${Math.round(n / kStats.fsCount)}) · islands ${p(kStats.island)} (1 in ${Math.round(n / kStats.islands)}, avg ${(kStats.island / kStats.islands).toFixed(1)}x)`);
}
if (!ONLY || ONLY === 'haze') {
  const n = measure('Haze Kings 420', hazeSpin, { grow: HK.initialGrow() }, () => ({ hot: null }));
  const p = (v) => `${((v / n) * 100).toFixed(1)} %`;
  console.log(`  RTP split: base ${p(hStats.base)} · free spins ${p(hStats.fs)} (1 in ${Math.round(n / hStats.fsCount)}) · grow ${p(hStats.stage)} (1 in ${Math.round(n / hStats.stages)}, avg ${(hStats.stage / hStats.stages).toFixed(1)}x)`);
}
