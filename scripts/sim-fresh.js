// "I just walked in" – fresh player (new voyage, fresh deck), 1,000 bets bankroll, fixed bet.
// KMAX=100 simulates the $100 bet (10,000 cap = 100x). Usage: node scripts/sim-fresh.js [sessions] [spins]
import * as KH from '../src/games/krakens-hoard/math.js';

const SESSIONS = Number(process.argv[2] || 20000), SPINS = Number(process.argv[3] || 200);
if (process.env.SCALE) KH.TUNING.payScale = Number(process.env.SCALE);
if (process.env.FSSCALE) KH.TUNING.fsScale = Number(process.env.FSSCALE);

function fsRound(setup) {
  let fs = { free: true, rows: 4, meter: setup.meter ?? 0, sticky: setup.sticky ?? [] }, left = setup.spins, tot = 0;
  while (left-- > 0) { const f = KH.spin(fs); fs = { free: true, rows: f.rows, meter: f.meter, sticky: f.sticky }; tot += f.x; left += f.award; if (tot >= KH.MAX_WIN_X) break; }
  return tot;
}
function spin(st) {
  const r = KH.spin({ ...st.base, free: false });
  st.base = { rows: r.rows, meter: r.meter };
  let x = r.x;
  if (r.award) { const k = Object.keys(KH.FS_OPTIONS); x += fsRound(KH.freeSpinSetup(k[Math.floor(Math.random() * k.length)], r.scatters)); }
  const { voyage, arrived } = KH.advanceVoyage(st.voyage, r, 1);
  st.voyage = voyage;
  if (arrived) { const rw = KH.ISLANDS[arrived.island].reward; x += (rw.type === 'pick' ? KH.chestBonus(rw.scale).total : fsRound(KH.islandFreeSpins(rw))) * arrived.avgBet; }
  return Math.min(x, KH.MAX_WIN_X);
}

const marks = [50, 100, 200].filter((m) => m <= SPINS);
const at = Object.fromEntries(marks.map((m) => [m, []]));
let tot = 0, n5 = 0, n10 = 0;
let big50 = 0, big20 = 0, peak5 = 0, peak10 = 0, neverUp = 0, lost60 = 0;
for (let s = 0; s < SESSIONS; s++) {
  const st = { base: { rows: 4, meter: 0 }, voyage: KH.initialVoyage() };
  let bal = 0, peak = 0, b20 = false, b50 = false, dip60 = false;
  for (let i = 1; i <= SPINS; i++) {
    const x = spin(st);
    tot += x; n5 += x >= 5; n10 += x >= 10;
    bal += x - 1; peak = Math.max(peak, bal);
    if (i <= 100 && x >= 20) b20 = true;
    if (i <= 100 && x >= 50) b50 = true;
    if (bal <= -60) dip60 = true;
    if (at[i]) at[i].push(bal);
  }
  big20 += b20; big50 += b50; peak5 += peak >= 5; peak10 += peak >= 10; neverUp += peak <= 0; lost60 += dip60;
}
const pct = (n) => `${(100 * n / SESSIONS).toFixed(1)} %`;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))].toFixed(0); };
console.log(`Kraken fresh player, cap ${KH.MAX_WIN_X}x, ${SESSIONS} sessions x ${SPINS} spins (numbers in bets)`);
console.log(`win >= 20x within first 100 spins: ${pct(big20)}   >= 50x: ${pct(big50)}`);
console.log(`ever +5 bets ahead: ${pct(peak5)}   ever +10 ahead: ${pct(peak10)}   never ahead: ${pct(neverUp)}   down 60+ at some point: ${pct(lost60)}`);
for (const m of marks) console.log(`after ${m} spins: ahead ${pct(at[m].filter((b) => b > 0).length)}  median ${q(at[m], 0.5)}  10% ${q(at[m], 0.1)}  90% ${q(at[m], 0.9)}`);
