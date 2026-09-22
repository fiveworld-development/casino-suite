// Measures exactly what the Haze Kings bonus buys deliver in the game:
// Munchies Mode = 10 free spins (fresh hotbox), Cloud 9 = 30 free spins (seeded hotbox).
// Usage: node scripts/sim-haze-buy.js [rounds]
import { spin, SIZE, makeCloud9Hotbox, FREE_SPINS_AWARD, MAX_WIN_X } from '../src/games/haze-kings/math.js';

const N = Number(process.argv[2] || 20000);
function round(spins, cloud9) {
  let left = spins, hotbox = cloud9 ? makeCloud9Hotbox(Math.random) : new Array(SIZE * SIZE).fill(0), total = 0;
  while (left-- > 0) {
    const f = spin({ free: true, hotbox });
    hotbox = f.hotbox;
    total += f.x;
    left += f.award;
    if (total >= MAX_WIN_X) return MAX_WIN_X;
  }
  return total;
}
for (const [name, spins, c9] of [['Munchies (gekauft)', FREE_SPINS_AWARD[3], false], ['Cloud 9 (gekauft)', FREE_SPINS_AWARD[7], true]]) {
  let s = 0, q = 0;
  for (let i = 0; i < N; i++) { const x = round(spins, c9); s += x; q += x * x; }
  const m = s / N, ci = 1.96 * Math.sqrt(q / N - m * m) / Math.sqrt(N);
  console.log(`${name.padEnd(20)} ${spins} spins  avg ${m.toFixed(1)}x ± ${ci.toFixed(1)}  -> price ${(m / 0.98).toFixed(1)}x`);
}
