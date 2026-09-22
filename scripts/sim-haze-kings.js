// Monte-Carlo RTP check for Haze Kings 420.
// Usage:
//   node scripts/sim-haze-kings.js [spinsPerRun] [runs]     env: SCALE, BLAZE, SMOKE, MULTCAP
// Runs the base+free-spin simulation `runs` times (default 5) of `spinsPerRun` spins each
// (default 3,000,000), each run using a fresh slice of Math.random() (independent samples –
// there is no fixed seed, so repeat runs are genuinely independent draws). Prints every run,
// then the mean and a 95% confidence interval across runs. Also measures Munchies Mode and
// Cloud 9 average values directly (forced rounds, >=20,000 each) with their own 95% CI, and
// derives both bonus-buy prices from the measured means (price = avg / 0.96).
import { spin, TUNING, SYMBOLS, MAX_WIN_X, SIZE, makeCloud9Hotbox } from '../src/games/haze-kings/math.js';

if (process.env.SCALE) TUNING.payScale = Number(process.env.SCALE);
if (process.env.BLAZE) TUNING.blazeChance = Number(process.env.BLAZE);
if (process.env.SMOKE) TUNING.smokeChance = Number(process.env.SMOKE);
if (process.env.MULTCAP) TUNING.multCap = Number(process.env.MULTCAP);
if (process.env.SCATTER) SYMBOLS.scatter.weight = Number(process.env.SCATTER);
if (process.env.WILD) SYMBOLS.wild.weight = Number(process.env.WILD);
console.log('tuning', TUNING, 'scatter', SYMBOLS.scatter.weight, 'wild', SYMBOLS.wild.weight);

const N = Number(process.argv[2] || 3_000_000);
const RUNS = Number(process.argv[3] || 5);
const rng = Math.random;

function playFreeSpins(award, cloud9, rng) {
  let left = award;
  let hotbox = cloud9 ? makeCloud9Hotbox(rng) : new Array(SIZE * SIZE).fill(0);
  let total = 0, played = 0;
  while (left-- > 0) {
    played++;
    const f = spin({ free: true, hotbox }, rng);
    hotbox = f.hotbox;
    total += f.x;
    left += f.award;
    if (total >= MAX_WIN_X) break;
  }
  return { total: Math.min(total, MAX_WIN_X), played };
}

function runSim(n) {
  let won = 0, baseWon = 0, fsWon = 0, hits = 0, triggers = 0, cloud9Triggers = 0, maxX = 0;
  let blazeCount = 0, smokeCount = 0, grinderProcs = 0;
  const buckets = { '15x+': 0, '30x+': 0, '50x+': 0, '200x+': 0, '1000x+': 0 };
  let dry = 0, maxDry = 0;

  let baseHot = null; // base-game hotbox carries over between winning spins
  for (let i = 0; i < n; i++) {
    const r = spin({ free: false, hotbox: baseHot }, rng);
    baseHot = r.hotbox;
    for (const s of r.steps) {
      if (s.t === 'blaze') blazeCount++;
      if (s.t === 'bigsmoke') smokeCount++;
      if (s.t === 'win' && s.ground?.length) grinderProcs++;
    }
    let x = r.x;
    baseWon += r.x;
    if (r.award) {
      triggers++;
      if (r.cloud9) cloud9Triggers++;
      const fs = playFreeSpins(r.award, r.cloud9, rng);
      x += fs.total;
      fsWon += fs.total;
    }
    x = Math.min(x, MAX_WIN_X);
    if (x > 0) { hits++; dry = 0; } else { dry++; maxDry = Math.max(maxDry, dry); }
    if (x >= 15) buckets['15x+']++;
    if (x >= 30) buckets['30x+']++;
    if (x >= 50) buckets['50x+']++;
    if (x >= 200) buckets['200x+']++;
    if (x >= 1000) buckets['1000x+']++;
    maxX = Math.max(maxX, x);
    won += x;
  }
  return { n, rtp: (won / n) * 100, baseRtp: (baseWon / n) * 100, fsRtp: (fsWon / n) * 100,
    hitRate: (hits / n) * 100, maxDry, triggers, cloud9Triggers, blazeCount, smokeCount, grinderProcs, maxX, buckets };
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr, m) { return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1)); }
function ci95(arr) {
  const m = mean(arr);
  if (arr.length < 2) return { mean: m, half: NaN };
  const sd = stddev(arr, m);
  return { mean: m, sd, half: 1.96 * (sd / Math.sqrt(arr.length)) };
}

// ---------------------------------------------------------------- RTP: independent runs
console.log(`\n=== RTP: ${RUNS} independent runs x ${N.toLocaleString()} spins ===`);
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const r = runSim(N);
  runs.push(r);
  console.log(`run ${i + 1}  RTP ${r.rtp.toFixed(3)}%  (base ${r.baseRtp.toFixed(3)}%, FS ${r.fsRtp.toFixed(3)}%)  base-share ${((r.baseRtp / r.rtp) * 100).toFixed(1)}%  hit ${r.hitRate.toFixed(2)}%  maxWin ${r.maxX.toFixed(0)}x  FS-trigger 1/${(r.n / r.triggers).toFixed(0)}`);
}
const rtps = runs.map((r) => r.rtp);
const rtpCi = ci95(rtps);
const baseShares = runs.map((r) => (r.baseRtp / r.rtp) * 100);
console.log(`\nRTP mean       ${rtpCi.mean.toFixed(3)}%  ± ${rtpCi.half.toFixed(3)} (95% CI, n=${RUNS})  sd=${rtpCi.sd.toFixed(3)}`);
console.log(`base share mean ${mean(baseShares).toFixed(1)}%`);
console.log(`hit rate mean   ${mean(runs.map((r) => r.hitRate)).toFixed(2)}%`);
console.log(`FS trigger mean 1 in ${mean(runs.map((r) => r.n / r.triggers)).toFixed(0)}`);
console.log(`blaze 1 in ${mean(runs.map((r) => r.n / Math.max(r.blazeCount, 1))).toFixed(0)}   bigsmoke 1 in ${mean(runs.map((r) => r.n / Math.max(r.smokeCount, 1))).toFixed(0)}   grinder-procs 1 in ${mean(runs.map((r) => r.n / Math.max(r.grinderProcs, 1))).toFixed(0)}`);
for (const k of Object.keys(runs[0].buckets)) console.log(`${k.padEnd(12)} mean 1 in ${mean(runs.map((r) => r.n / Math.max(r.buckets[k], 1))).toFixed(0)}`);

// ---------------------------------------------------------------- forced feature values (>=20,000 rounds each)
const FEATURE_N = 20000;
console.log(`\n=== Munchies Mode value: forced n=${FEATURE_N} (award drawn like a real 3-6 scatter trigger, 10-20 spins) ===`);
const munchies = [];
for (let i = 0; i < FEATURE_N; i++) {
  const award = [10, 12, 15, 20][Math.floor(rng() * 4)];
  munchies.push(playFreeSpins(award, false, rng).total);
}
const mCi = ci95(munchies);
console.log(`avg Munchies value   ${mCi.mean.toFixed(2)}x  ± ${mCi.half.toFixed(2)} (95% CI)  ->  bonus buy price ${(mCi.mean / 0.96).toFixed(1)}x`);

console.log(`\n=== Cloud 9 value: forced n=${FEATURE_N} (30 spins, ${SIZE * SIZE} cells) ===`);
const cloud9 = [];
for (let i = 0; i < FEATURE_N; i++) cloud9.push(playFreeSpins(30, true, rng).total);
const cCi = ci95(cloud9);
console.log(`avg Cloud9 value     ${cCi.mean.toFixed(2)}x  ± ${cCi.half.toFixed(2)} (95% CI)  ->  super buy price ${(cCi.mean / 0.96).toFixed(1)}x`);
console.log(`\nlucky lighter (2x scatter chance, 3x cost) – informational only, priced at 3x bet per spin as specified`);
