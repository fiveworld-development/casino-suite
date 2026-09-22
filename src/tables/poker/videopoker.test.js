import assert from 'node:assert';
import {
  payoutFor, exactEV, solveBestHold, simulateRTP, REFERENCE_RTP_9_6_JOB,
} from './videopoker.js';
import { makeCard, fullDeck } from './evaluator.js';

let pass = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  pass++;
  console.log('  ok - ' + msg);
}

console.log('== Paytable payouts at various coin counts ==');
{
  const royal = [makeCard(10, 0), makeCard(11, 0), makeCard(12, 0), makeCard(13, 0), makeCard(14, 0)];
  ok(payoutFor(royal, 1) === 250, 'royal flush @1 coin = 250');
  ok(payoutFor(royal, 4) === 1000, 'royal flush @4 coins = 1000 (250x4)');
  ok(payoutFor(royal, 5) === 4000, 'royal flush @5 coins = 4000 (800x5, the 5-coin bonus)');

  const straightFlush = [makeCard(5, 1), makeCard(6, 1), makeCard(7, 1), makeCard(8, 1), makeCard(9, 1)];
  ok(payoutFor(straightFlush, 5) === 250, 'straight flush @5 coins = 250 (50x5)');

  const quads = [makeCard(7, 0), makeCard(7, 1), makeCard(7, 2), makeCard(7, 3), makeCard(2, 0)];
  ok(payoutFor(quads, 5) === 125, 'four of a kind @5 coins = 125 (25x5)');

  const fullHouse = [makeCard(4, 0), makeCard(4, 1), makeCard(4, 2), makeCard(9, 0), makeCard(9, 1)];
  ok(payoutFor(fullHouse, 3) === 27, 'full house @3 coins = 27 (9x3)');

  const flush = [makeCard(2, 2), makeCard(5, 2), makeCard(8, 2), makeCard(10, 2), makeCard(13, 2)];
  ok(payoutFor(flush, 5) === 30, 'flush @5 coins = 30 (6x5)');

  const straight = [makeCard(3, 0), makeCard(4, 1), makeCard(5, 2), makeCard(6, 3), makeCard(7, 0)];
  ok(payoutFor(straight, 5) === 20, 'straight @5 coins = 20 (4x5)');

  const trips = [makeCard(9, 0), makeCard(9, 1), makeCard(9, 2), makeCard(3, 0), makeCard(6, 1)];
  ok(payoutFor(trips, 5) === 15, 'three of a kind @5 coins = 15 (3x5)');

  const twoPair = [makeCard(8, 0), makeCard(8, 1), makeCard(4, 2), makeCard(4, 3), makeCard(11, 0)];
  ok(payoutFor(twoPair, 5) === 10, 'two pair @5 coins = 10 (2x5)');

  const jacksPair = [makeCard(11, 0), makeCard(11, 1), makeCard(2, 2), makeCard(5, 3), makeCard(9, 0)];
  ok(payoutFor(jacksPair, 5) === 5, 'jacks-or-better pair @5 coins = 5 (1x5)');

  const lowPair = [makeCard(9, 0), makeCard(9, 1), makeCard(2, 2), makeCard(5, 3), makeCard(7, 0)];
  ok(payoutFor(lowPair, 5) === 0, 'pair below jacks pays 0');

  const nothing = [makeCard(2, 0), makeCard(5, 1), makeCard(8, 2), makeCard(11, 3), makeCard(13, 0)];
  ok(payoutFor(nothing, 5) === 0, 'no made hand pays 0');
}

console.log('== EV evaluator: made flush, hold all 5 -> EV exactly equals payout (no draw) ==');
{
  const flushHand = [makeCard(2, 3), makeCard(6, 3), makeCard(9, 3), makeCard(12, 3), makeCard(14, 3)];
  const used = new Set(flushHand);
  const remainingDeck = fullDeck().filter((c) => !used.has(c));
  const coins = 5;
  const ev = exactEV(flushHand, 0b11111, remainingDeck, coins);
  const expected = payoutFor(flushHand, coins);
  ok(ev === expected, `hold-all-5 flush EV (${ev}) === payout (${expected}), no draw performed`);

  const best = solveBestHold(flushHand, remainingDeck, coins);
  ok(best.mask === 0b11111, 'solver picks hold-all-5 as optimal for a made flush');
  ok(best.ev === expected, 'solver EV for the made flush equals its payout');
}

console.log('== EV evaluator sanity: a 4-card royal draw has positive EV above zero-hold ==');
{
  // 4 to the royal (T J Q K same suit) + one offsuit low card
  const hand = [makeCard(10, 0), makeCard(11, 0), makeCard(12, 0), makeCard(13, 0), makeCard(2, 1)];
  const used = new Set(hand);
  const remainingDeck = fullDeck().filter((c) => !used.has(c));
  const holdRoyalDraw = exactEV(hand, 0b01111, remainingDeck, 5); // hold the 4 suited high cards
  const holdNothing = exactEV(hand, 0b00000, remainingDeck, 5);
  ok(holdRoyalDraw > holdNothing, `4-card royal draw EV (${holdRoyalDraw.toFixed(3)}) beats discarding everything (${holdNothing.toFixed(3)})`);
}

console.log('== Known optimal-strategy decisions (exact solver) ==');
{
  // 4 to a royal beats a pat flush (9/6): T/J/Q/K of spades + a low spade
  // (already a made flush) - the royal draw's huge jackpot outweighs the
  // guaranteed flush payout under 9/6 rules.
  const royalDraw = [makeCard(10, 0), makeCard(11, 0), makeCard(12, 0), makeCard(13, 0), makeCard(4, 0)];
  const rem1 = fullDeck().filter((c) => !new Set(royalDraw).has(c));
  const best1 = solveBestHold(royalDraw, rem1, 5);
  ok(best1.mask === 0b01111, `4-card royal draw is held over a pat flush (mask=${best1.mask.toString(2)})`);

  // KQJ suited beats KQ offsuit as a 3-card royal draw structural check:
  // holding all 3 suited high cards should be picked over holding just the
  // 2 offsuit high cards when a 3-card royal is available.
  const kqjSuited = [makeCard(13, 1), makeCard(12, 1), makeCard(11, 1), makeCard(9, 2), makeCard(3, 3)];
  const rem2 = fullDeck().filter((c) => !new Set(kqjSuited).has(c));
  const best2 = solveBestHold(kqjSuited, rem2, 5);
  ok(best2.mask === 0b00111, `KQJ suited (3-card royal) held together over any offsuit-only subset (mask=${best2.mask.toString(2)})`);

  // Low pair beats a 4-card outside straight draw (well-established 9/6 JoB
  // strategy: a made low pair's guaranteed shot at trips/quads/full-house
  // plus draw-to-two-pair beats a 4-outs-times-2 open straight draw with no
  // pair backup).
  const lowPairVsStraight = [makeCard(6, 0), makeCard(6, 1), makeCard(7, 2), makeCard(8, 3), makeCard(9, 0)];
  const rem3 = fullDeck().filter((c) => !new Set(lowPairVsStraight).has(c));
  const best3 = solveBestHold(lowPairVsStraight, rem3, 5);
  ok(best3.mask === 0b00011, `low pair (66) held over the 4-card outside straight draw (mask=${best3.mask.toString(2)})`);
}

console.log('== RTP simulation: exact-solver optimal hold, as many hands as time allows ==');
{
  // A full C(47,k) exact enumeration across all 32 masks for 200,000 hands
  // is not feasible in this environment even after the dominance-pruning
  // and canonical-hand cache implemented in videopoker.js (~0.1-0.8s/hand
  // measured locally). Per explicit direction, this measures a smaller,
  // honestly-reported sample and states its 95% confidence interval rather
  // than silently reverting to an approximate/sampled solver.
  const HANDS = 600;
  const t0 = Date.now();
  const {
    handsPlayed, coinsBet, coinsWon, rtp, stdError, ci95, cacheSize,
  } = simulateRTP(HANDS, 5, Math.random);
  const ms = Date.now() - t0;
  console.log(`  hands played: ${handsPlayed}  (exact optimal-hold solver on every hand)`);
  console.log(`  coins bet:    ${coinsBet}`);
  console.log(`  coins won:    ${coinsWon}`);
  console.log(`  measured RTP: ${(rtp * 100).toFixed(3)}%   (elapsed ${ms}ms, ${(ms / handsPlayed).toFixed(1)}ms/hand, canonical-hand cache size ${cacheSize})`);
  console.log(`  95% CI:       [${(ci95[0] * 100).toFixed(2)}%, ${(ci95[1] * 100).toFixed(2)}%]  (stdError=${(stdError * 100).toFixed(3)}pp)`);
  console.log(`  reference 9/6 JoB optimal-play RTP: ${(REFERENCE_RTP_9_6_JOB * 100).toFixed(2)}%  <- reference, not measured`);
  console.log(`  delta (measured - reference): ${((rtp - REFERENCE_RTP_9_6_JOB) * 100).toFixed(3)} pp`);
  console.log(`  reference within CI: ${REFERENCE_RTP_9_6_JOB >= ci95[0] && REFERENCE_RTP_9_6_JOB <= ci95[1]}`);

  ok(handsPlayed === HANDS, 'simulated the requested number of hands');
  ok(coinsBet === HANDS * 5, 'coins bet == hands * 5');
  // With a genuinely exact optimal-hold solver the measured RTP should be in
  // the right ballpark for 9/6 JoB even over a modest sample (payouts are
  // heavy-tailed - a single royal flush swings a 600-hand sample a lot -
  // hence the wide CI reported above rather than a tight pass/fail band).
  ok(rtp > 0.5 && rtp < 3.0, `measured RTP ${(rtp * 100).toFixed(2)}% is within a sane plausibility band for a small sample`);
}

console.log(`\nALL PASS (${pass} assertions)`);
