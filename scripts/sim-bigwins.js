// How often do big wins happen? Counts single spins (incl. the features they trigger) by size,
// with the voyage / grow progression running like in the game.
// Usage: node scripts/sim-bigwins.js [spins]
import * as KH from '../src/games/krakens-hoard/math.js';
import * as HK from '../src/games/haze-kings/math.js';

const N = Number(process.argv[2] || 1_000_000);
if (process.env.SCALE) KH.TUNING.payScale = Number(process.env.SCALE);
if (process.env.FSSCALE) KH.TUNING.fsScale = Number(process.env.FSSCALE);
if (process.env.HSCALE) HK.TUNING.payScale = Number(process.env.HSCALE);
if (process.env.HFS) HK.TUNING.fsScale = Number(process.env.HFS);
const LEVELS = [5, 10, 20, 50, 100, 150];

function krakenFS(setup) {
  let fs = { free: true, rows: 4, meter: setup.meter ?? 0, sticky: setup.sticky ?? [] }, left = setup.spins, tot = 0;
  while (left-- > 0) { const f = KH.spin(fs); fs = { free: true, rows: f.rows, meter: f.meter, sticky: f.sticky }; tot += f.x; left += f.award; if (tot >= KH.MAX_WIN_X) break; }
  return Math.min(tot, KH.MAX_WIN_X);
}
function hazeFS(spins, hotbox) {
  let hot = hotbox, left = spins, tot = 0;
  while (left-- > 0) { const f = HK.spin({ free: true, hotbox: hot }); hot = f.hotbox; tot += f.x; left += f.award; if (tot >= HK.MAX_WIN_X) break; }
  return Math.min(tot, HK.MAX_WIN_X);
}

function run(name, spinOnce) {
  const hits = LEVELS.map(() => 0);
  let max = 0, won = 0;
  const src = { base: 0, fs: 0, bonus: 0 }; // where the >= 200x wins come from
  for (let i = 0; i < N; i++) {
    const { x, from } = spinOnce();
    won += x;
    max = Math.max(max, x);
    LEVELS.forEach((l, k) => { if (x >= l) hits[k]++; });
    if (x >= 150) src[from]++;
  }
  console.log(`\n${name}  (${N.toLocaleString('en')} spins, RTP ${((won / N) * 100).toFixed(1)} %, biggest ${Math.round(max)}x)`);
  LEVELS.forEach((l, k) => console.log(`  win >= ${String(l).padStart(4)}x   1 in ${hits[k] ? Math.round(N / hits[k]).toLocaleString('en').padStart(9) : '     never'} spins`));
  const tot = src.base + src.fs + src.bonus || 1;
  console.log(`  wins >= 150x come from: base game ${Math.round((src.base / tot) * 100)} % · free spins ${Math.round((src.fs / tot) * 100)} % · voyage/grow bonus ${Math.round((src.bonus / tot) * 100)} %`);
}

let kst = KH.initialState(), voy = KH.initialVoyage();
run("Kraken's Hoard", () => {
  const r = KH.spin({ ...kst, free: false });
  kst = { rows: r.rows, meter: r.meter };
  let x = r.x, fs = 0, bonus = 0;
  if (r.award) { const keys = Object.keys(KH.FS_OPTIONS); fs = krakenFS(KH.freeSpinSetup(keys[Math.floor(Math.random() * 3)], r.scatters)); }
  const { voyage, arrived } = KH.advanceVoyage(voy, r, 1);
  voy = voyage;
  if (arrived) { const rw = KH.ISLANDS[arrived.island].reward; bonus = rw.type === 'pick' ? KH.chestBonus(rw.scale).total : krakenFS(KH.islandFreeSpins(rw)); }
  const tot = Math.min(x + fs + bonus, KH.MAX_WIN_X);
  const from = bonus >= fs && bonus >= x ? 'bonus' : fs >= x ? 'fs' : 'base';
  return { x: tot, from };
});

let hot = null, grow = HK.initialGrow();
run('Haze Kings 420', () => {
  const r = HK.spin({ free: false, hotbox: hot });
  hot = r.hotbox;
  let x = r.x, fs = 0, bonus = 0;
  if (r.award) fs = hazeFS(r.award, r.cloud9 ? HK.makeCloud9Hotbox(Math.random) : new Array(HK.SIZE * HK.SIZE).fill(0));
  const g = HK.advanceGrow(grow, r, 1);
  grow = g.grow;
  if (g.grown) {
    const rw = HK.STAGES[g.grown.stage].reward;
    if (rw.type === 'pick') bonus = HK.jarBonus(rw.scale).total;
    else if (rw.type === 'seed') hot = HK.seedHotbox(rw.cells, Math.random, hot ?? undefined);
    else { const s = HK.growFreeSpins(rw); bonus = hazeFS(s.spins, s.hotbox); }
  }
  const tot = Math.min(x + fs + bonus, HK.MAX_WIN_X);
  const from = bonus >= fs && bonus >= x ? 'bonus' : fs >= x ? 'fs' : 'base';
  return { x: tot, from };
});
