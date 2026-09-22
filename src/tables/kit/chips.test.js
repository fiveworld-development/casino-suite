// Plain node test (no deps). Run: node src/tables/kit/chips.test.js
import { chipBreakdown, DENOMINATIONS } from './chips.js';

let failed = 0, passed = 0;
function assert(cond, msg) { if (!cond) { failed++; console.error('FAIL:', msg); } else { passed++; } }

function total(breakdown) {
  let t = 0;
  for (const [d, c] of breakdown) t += d * c;
  return t;
}

for (const amount of [1, 5, 26, 100, 420, 421, 1546, 12345, 0, 1000]) {
  const { breakdown, remainder } = chipBreakdown(amount, DENOMINATIONS);
  assert(total(breakdown) + remainder === amount, `breakdown sums to amount (${amount})`);
  assert(remainder === 0, `no remainder for whole-unit amount (${amount})`);
}

// greedy correctness spot-check: 1546 -> 1000 + 420 + 100 + 25 + 1
{
  const { breakdown } = chipBreakdown(1546);
  assert(breakdown.get(1000) === 1, '1546 uses one 1000 chip');
  assert(breakdown.get(420) === 1, '1546 uses one 420 chip');
  assert(breakdown.get(100) === 1, '1546 uses one 100 chip');
  assert(breakdown.get(25) === 1, '1546 uses one 25 chip');
  assert(breakdown.get(1) === 1, '1546 uses one 1 chip');
}

console.log(failed ? `\n${failed} FAILURES (${passed} passed)` : `\nAll ${passed} chips.js assertions passed.`);
process.exitCode = failed ? 1 : 0;
