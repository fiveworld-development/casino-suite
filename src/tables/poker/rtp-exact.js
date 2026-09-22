// Variance-reduced RTP measurement for "Kush or Better" (9/6 Jacks or Better).
//
// simulateRTP() in videopoker.js plays out one random draw per hand, so its
// per-hand outcome variance is dominated by rare jackpots (royal flush pays
// 800x) - a few hundred/thousand hands give an almost useless confidence
// interval (see videopoker.test.js's 600-hand run: CI [79.6%, 119.7%]).
//
// This script instead uses the EXACT EV of the best hold (solveBestHold's
// `.ev`, itself a full C(47,k) enumeration - not a random outcome) as the
// per-hand sample. Averaging exact EVs over many independently DEALT hands
// still converges to the true long-run RTP (by linearity of expectation:
// E[actual payout | hand] = EV of the optimal hold for that hand, so
// averaging EVs over random hands has the same expectation as averaging
// actual outcomes, but with dramatically lower variance since it removes
// the draw-to-draw randomness entirely, leaving only hand-to-hand
// variance). This is the standard variance-reduction technique for
// measuring video poker RTP and needs far fewer hands for a tight CI.
//
// Usage: node src/tables/poker/rtp-exact.js [minutes] [coins]

import { fullDeck } from './evaluator.js';
import { solveBestHold, REFERENCE_RTP_9_6_JOB } from './videopoker.js';

function shuffled(rng) {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function canonicalKey(hand) {
  const withSuit = hand.map((c) => [Math.floor(c / 4) + 2, c % 4]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const suitGroup = new Map();
  let next = 0;
  return withSuit.map(([r, s]) => {
    if (!suitGroup.has(s)) suitGroup.set(s, next++);
    return `${r}.${suitGroup.get(s)}`;
  }).join(',');
}

const minutes = Number(process.argv[2] || 25);
const coins = Number(process.argv[3] || 5);
const deadline = Date.now() + minutes * 60 * 1000;

const evCache = new Map();
let hands = 0;
let sumEv = 0;
let sumEvSq = 0;
const rng = Math.random;

console.log(`Exact-EV variance-reduced RTP measurement: up to ${minutes} min, ${coins} coins/hand.`);
const t0 = Date.now();
let lastReport = t0;

while (Date.now() < deadline) {
  const deck = shuffled(rng);
  const hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  const remainingDeck = deck;

  const key = canonicalKey(hand);
  let ev = evCache.get(key);
  if (ev === undefined) {
    ev = solveBestHold(hand, remainingDeck, coins).ev;
    evCache.set(key, ev);
  }

  hands++;
  sumEv += ev;
  sumEvSq += ev * ev;

  if (Date.now() - lastReport > 15000) {
    const meanPayout = sumEv / hands;
    const rtpSoFar = meanPayout / coins;
    console.log(`  ...${hands} hands, cache=${evCache.size}, RTP so far ${(rtpSoFar * 100).toFixed(4)}% (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
    lastReport = Date.now();
  }
}

const meanPayout = sumEv / hands;
const variance = Math.max(0, sumEvSq / hands - meanPayout * meanPayout);
const stdError = Math.sqrt(variance / hands) / coins;
const rtp = meanPayout / coins;
const ci95 = [rtp - 1.96 * stdError, rtp + 1.96 * stdError];

console.log('\n=== RESULT ===');
console.log(`hands (dealt, EV-averaged):     ${hands}`);
console.log(`distinct canonical hand shapes: ${evCache.size}`);
console.log(`elapsed:                        ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`measured RTP (exact-EV mean):   ${(rtp * 100).toFixed(4)}%`);
console.log(`stdError:                       ${(stdError * 100).toFixed(4)}pp`);
console.log(`95% CI:                         [${(ci95[0] * 100).toFixed(4)}%, ${(ci95[1] * 100).toFixed(4)}%]`);
console.log(`reference (9/6 JoB, published): ${(REFERENCE_RTP_9_6_JOB * 100).toFixed(2)}%  <- reference, not measured`);
console.log(`delta (measured - reference):   ${((rtp - REFERENCE_RTP_9_6_JOB) * 100).toFixed(4)}pp`);
console.log(`reference within CI:            ${REFERENCE_RTP_9_6_JOB >= ci95[0] && REFERENCE_RTP_9_6_JOB <= ci95[1]}`);
