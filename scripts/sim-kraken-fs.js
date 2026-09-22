// Kraken's Hoard: measures each free-spin option (same trigger distribution), total RTP per
// option and the bonus-buy price. Usage: node scripts/sim-kraken-fs.js [baseSpins] [roundsPerOption]
import { spin, initialState, freeSpinSetup, FS_OPTIONS, MAX_WIN_X } from '../src/games/krakens-hoard/math.js';

const N = Number(process.argv[2] || 600000);
const ROUNDS = Number(process.argv[3] || 20000);

// 1) base game: return without free spins + how many scatters triggered the bonus
let st = initialState(), base = 0;
const scat = [];
for (let i = 0; i < N; i++) {
  const r = spin({ ...st, free: false });
  st = { rows: r.rows, meter: r.meter };
  base += r.x;
  if (r.award) scat.push(r.scatters);
}
const trigger = scat.length / N;
console.log(`base game RTP ${((base / N) * 100).toFixed(2)}%   FS trigger 1 in ${(1 / trigger).toFixed(0)}   scatters ${[3, 4, 5, 6].map((k) => `${k}:${scat.filter((s) => Math.min(s, 6) === k).length}`).join(' ')}`);

// 2) each option, forced rounds with the real scatter distribution
function round(key, scatters) {
  const setup = freeSpinSetup(key, scatters);
  let left = setup.spins, fs = { free: true, rows: 4, meter: setup.meter, sticky: setup.sticky }, total = 0, wraths = 0;
  while (left-- > 0) {
    const f = spin(fs);
    if (f.steps.some((s) => s.t === 'wrath')) wraths++;
    fs = { free: true, rows: f.rows, meter: f.meter, sticky: f.sticky };
    total += f.x;
    left += f.award;
    if (total >= MAX_WIN_X) { total = MAX_WIN_X; break; }
  }
  return { total, wraths };
}
const results = {};
for (const key of Object.keys(FS_OPTIONS)) {
  let sum = 0, sq = 0, max = 0, wr = 0, zero = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const { total, wraths } = round(key, scat[Math.floor(Math.random() * scat.length)]);
    sum += total; sq += total * total; max = Math.max(max, total); wr += wraths; if (total < 10) zero++;
  }
  const mean = sum / ROUNDS, sd = Math.sqrt(sq / ROUNDS - mean * mean), ci = (1.96 * sd) / Math.sqrt(ROUNDS);
  results[key] = mean;
  console.log(`${FS_OPTIONS[key].name.padEnd(12)} avg ${mean.toFixed(1)}x ± ${ci.toFixed(1)}  sd ${sd.toFixed(0)}  max ${max.toFixed(0)}x  <10x in ${((zero / ROUNDS) * 100).toFixed(0)}%  wraths/round ${(wr / ROUNDS).toFixed(2)}  -> total RTP ${(((base / N) + trigger * mean) * 100).toFixed(2)}%`);
}
const avg = Object.values(results).reduce((a, b) => a + b, 0) / 3;
console.log(`bonus buy price (avg of options / 0.96): ${(avg / 0.96).toFixed(1)}x`);
