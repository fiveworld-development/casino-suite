// Plain node test (no deps). Run: node src/tables/kit/deck.test.js
import { makeDeck, shuffle, randomInt, Shoe } from './deck.js';

let failed = 0;
let passed = 0;
function assert(cond, msg) { if (!cond) { failed++; console.error('FAIL:', msg); } else { passed++; } }

// makeDeck: 52 unique cards
{
  const d = makeDeck();
  assert(d.length === 52, 'makeDeck returns 52 cards');
  const keys = new Set(d.map((c) => c.rank + c.suit));
  assert(keys.size === 52, 'all 52 cards unique');
}

// randomInt: range + rough uniformity sanity check
{
  const n = 7, trials = 200000;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < trials; i++) {
    const x = randomInt(n);
    assert(x >= 0 && x < n, 'randomInt in range');
    counts[x]++;
  }
  const expected = trials / n;
  const maxDev = Math.max(...counts.map((c) => Math.abs(c - expected) / expected));
  assert(maxDev < 0.05, `randomInt roughly uniform (maxDev=${(maxDev * 100).toFixed(2)}%)`);
}

// shuffle: uniformity sanity check — track position of a fixed card across many shuffles
{
  const trials = 50000;
  const posCounts = new Array(52).fill(0);
  for (let i = 0; i < trials; i++) {
    const d = makeDeck();
    shuffle(d);
    const idx = d.findIndex((c) => c.rank === 'A' && c.suit === 'S');
    posCounts[idx]++;
  }
  const expected = trials / 52;
  const maxDev = Math.max(...posCounts.map((c) => Math.abs(c - expected) / expected));
  assert(maxDev < 0.25, `shuffle position distribution roughly uniform for AS (maxDev=${(maxDev * 100).toFixed(2)}%)`);
}

// Shoe: draw/reshuffle/penetration
{
  const shoe = new Shoe(6, 0.75);
  assert(shoe.totalCards === 312, 'shoe has 6*52 cards');
  assert(shoe.remaining === 312, 'shoe starts full');
  for (let i = 0; i < 100; i++) shoe.draw();
  assert(shoe.remaining === 212, 'shoe draw decrements remaining');
  assert(!shoe.needsReshuffle(), 'not yet at penetration after 100 draws');
  for (let i = 0; i < 135; i++) shoe.draw(); // 235 dealt of 312 = 75.3%
  assert(shoe.needsReshuffle(), 'needs reshuffle past 75% penetration');
  const before = shoe.remaining;
  shoe.reshuffle();
  assert(shoe.remaining === 312 && shoe.remaining !== before, 'reshuffle restores full shoe');
}

console.log(failed ? `\n${failed} FAILURES (${passed} passed)` : `\nAll ${passed} deck.js assertions passed.`);
process.exitCode = failed ? 1 : 0;
