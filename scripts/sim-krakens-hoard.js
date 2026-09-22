// Monte-Carlo RTP check with persistent state (rows + meter carry over between spins).
// Usage: node scripts/sim-krakens-hoard.js [baseSpins]   env: SCALE, STACK, SCATTER
import { spin, initialState, TUNING, SYMBOLS, KRAKEN_CHANCE, MAX_WIN_X } from '../src/games/krakens-hoard/math.js';

if (process.env.SCALE) TUNING.payScale = Number(process.env.SCALE);
if (process.env.STACK) TUNING.stack = Number(process.env.STACK);
if (process.env.SCATTER) SYMBOLS.scatter.weight = Number(process.env.SCATTER);
if (process.env.FSSCALE) TUNING.fsScale = Number(process.env.FSSCALE);
if (process.env.KBASE) KRAKEN_CHANCE.base = Number(process.env.KBASE);
console.log('tuning', TUNING, 'scatter', SYMBOLS.scatter.weight, 'kraken', KRAKEN_CHANCE);

const N = Number(process.argv[2] || 1_000_000);
let won = 0, baseWon = 0, fsWon = 0, coinWon = 0, hits = 0, triggers = 0, maxX = 0, strikes = 0, meterStrikes = 0;
let rowsSum = 0;
const buckets = { '15x+': 0, '50x+': 0, '1000x+': 0 };
let st = initialState();
let dry = 0, maxDry = 0;

const coins = (r) => r.steps.reduce((a, s) => a + (s.loot?.type === 'coin' ? s.loot.x : 0), 0);
const krak = (r) => r.steps.filter((s) => s.t === 'kraken');

for (let i = 0; i < N; i++) {
  rowsSum += st.rows;
  const r = spin({ ...st, free: false });
  st = { rows: r.rows, meter: r.meter };
  let x = r.x;
  baseWon += r.x;
  coinWon += coins(r);
  for (const k of krak(r)) { strikes++; if (k.fromMeter) meterStrikes++; }
  if (r.award) {
    triggers++;
    // free spins always start on a fresh 4-row deck (the base deck is restored afterwards)
    let left = r.award, fs = { rows: 4, meter: st.meter, free: true, sticky: [] };
    let fsTotal = 0;
    while (left-- > 0) {
      const f = spin(fs);
      fs = { free: true, rows: f.rows, meter: f.meter, sticky: f.sticky };
      fsTotal += f.x;
      left += f.award;
      if (fsTotal >= MAX_WIN_X) break;
    }
    st = { rows: st.rows, meter: fs.meter };
    fsTotal = Math.min(fsTotal, MAX_WIN_X);
    x += fsTotal;
    fsWon += fsTotal;
  }
  x = Math.min(x, MAX_WIN_X);
  if (x > 0) { hits++; dry = 0; } else { dry++; maxDry = Math.max(maxDry, dry); }
  if (x >= 15) buckets['15x+']++;
  if (x >= 50) buckets['50x+']++;
  if (x >= 1000) buckets['1000x+']++;
  maxX = Math.max(maxX, x);
  won += x;
}

const pct = (v) => `${((v / N) * 100).toFixed(2)}%`;
console.log(`spins        ${N.toLocaleString()}`);
console.log(`RTP          ${pct(won)}  (base ${pct(baseWon)} incl. coins ${pct(coinWon)}, free spins ${pct(fsWon)})`);
console.log(`hit rate     ${pct(hits)}   longest dry streak ${maxDry}`);
console.log(`avg rows     ${(rowsSum / N).toFixed(2)}`);
console.log(`kraken       1 in ${(N / strikes).toFixed(0)} base spins (${((meterStrikes / strikes) * 100).toFixed(0)}% from meter)`);
console.log(`FS trigger   1 in ${(N / triggers).toFixed(0)}   avg FS win ${(fsWon / triggers).toFixed(1)}x`);
console.log(`max win      ${maxX.toFixed(1)}x`);
for (const [k, v] of Object.entries(buckets)) console.log(`${k.padEnd(12)} 1 in ${(N / Math.max(v, 1)).toFixed(0)}`);
