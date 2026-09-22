// Measures the return of the "Lucky Lighter" bonus buy (one spin with doubled scatter weight,
// priced at 3x bet) including the free spins it triggers. Usage: node scripts/sim-haze-lighter.js [spins]
import { spin, SIZE } from '../src/games/haze-kings/math.js';

const N = Number(process.argv[2] || 300000);
const COST = Number(process.env.COST ?? 1.27); // keep in sync with LIGHTER_PRICE in main.js
let won = 0, triggers = 0;
for (let i = 0; i < N; i++) {
  const r = spin({ free: false, hotbox: new Array(SIZE * SIZE).fill(0), scatterBoost: 2 });
  let x = r.x;
  if (r.award) {
    triggers++;
    let left = r.award, hotbox = new Array(SIZE * SIZE).fill(0);
    while (left-- > 0) {
      const f = spin({ free: true, hotbox });
      hotbox = f.hotbox ?? hotbox;
      x += f.x;
      left += f.award ?? 0;
    }
  }
  won += x;
}
console.log(`spins ${N}  FS trigger 1 in ${(N / triggers).toFixed(0)}  avg return ${(won / N).toFixed(3)}x bet  cost ${COST}x  RTP ${((won / N / COST) * 100).toFixed(2)}%`);
