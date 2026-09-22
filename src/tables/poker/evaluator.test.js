import assert from 'node:assert';
import {
  evaluate5, evaluateBest, makeCard, fullDeck, CATEGORY, CATEGORY_NAME,
} from './evaluator.js';

let pass = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  pass++;
  console.log('  ok - ' + msg);
}

console.log('== Wheel straight ==');
{
  const hand = [makeCard(14, 0), makeCard(2, 1), makeCard(3, 2), makeCard(4, 3), makeCard(5, 0)];
  const r = evaluate5(hand);
  ok(r.category === CATEGORY.STRAIGHT, 'wheel is a straight');
  // 5-high straight value should equal a hand with 6-5-4-3-2 straight's rank encoding at high=5
  const straightFive = evaluate5([makeCard(5, 0), makeCard(4, 1), makeCard(3, 2), makeCard(2, 3), makeCard(14, 1)]);
  ok(r.value === straightFive.value, 'wheel ranks as 5-high straight (value match)');
  // must be lower than 6-high straight
  const sixHigh = evaluate5([makeCard(6, 0), makeCard(5, 1), makeCard(4, 2), makeCard(3, 3), makeCard(2, 0)]);
  ok(sixHigh.value > r.value, 'wheel is lower than 6-high straight');
}

console.log('== Kicker comparisons ==');
{
  const kingsGoodKicker = evaluate5([makeCard(13, 0), makeCard(13, 1), makeCard(14, 2), makeCard(9, 3), makeCard(7, 0)]);
  const kingsBadKicker = evaluate5([makeCard(13, 2), makeCard(13, 3), makeCard(12, 0), makeCard(9, 1), makeCard(7, 2)]);
  ok(kingsGoodKicker.category === CATEGORY.ONE_PAIR && kingsBadKicker.category === CATEGORY.ONE_PAIR, 'both are pair of kings');
  ok(kingsGoodKicker.value > kingsBadKicker.value, 'ace kicker beats queen kicker for pair of kings');
}

console.log('== Split pot (different suits, equal value) ==');
{
  const a = evaluate5([makeCard(10, 0), makeCard(11, 0), makeCard(12, 0), makeCard(13, 0), makeCard(9, 0)]);
  const b = evaluate5([makeCard(10, 1), makeCard(11, 1), makeCard(12, 1), makeCard(13, 1), makeCard(9, 1)]);
  ok(a.value === b.value, 'identical straight flushes of different suit compare equal');
}

console.log('== 7-card best-of-7 ==');
{
  // Board makes a straight flush possible; hole cards are junk otherwise.
  const board = [makeCard(2, 0), makeCard(3, 0), makeCard(4, 0), makeCard(5, 0), makeCard(6, 0)];
  const hole = [makeCard(14, 3), makeCard(9, 2)];
  const best = evaluateBest([...board, ...hole]);
  ok(best.category === CATEGORY.STRAIGHT_FLUSH, 'best-of-7 finds the straight flush on the board');

  // Full house from combining pairs across 7 cards.
  const cards7 = [makeCard(5, 0), makeCard(5, 1), makeCard(5, 2), makeCard(9, 0), makeCard(9, 1), makeCard(2, 3), makeCard(4, 2)];
  const best2 = evaluateBest(cards7);
  ok(best2.category === CATEGORY.FULL_HOUSE, 'best-of-7 finds full house (555 99)');
}

console.log('== Full enumeration of all C(52,5) = 2,598,960 five-card hands ==');
{
  const deck = fullDeck();
  const n = deck.length;
  const counts = new Array(10).fill(0);
  let total = 0;
  const t0 = Date.now();

  const hand = new Array(5);
  // iterative 5-nested loop is fastest / lowest overhead
  for (let a = 0; a < n; a++) {
    hand[0] = deck[a];
    for (let b = a + 1; b < n; b++) {
      hand[1] = deck[b];
      for (let c = b + 1; c < n; c++) {
        hand[2] = deck[c];
        for (let d = c + 1; d < n; d++) {
          hand[3] = deck[d];
          for (let e = d + 1; e < n; e++) {
            hand[4] = deck[e];
            const res = evaluate5(hand);
            counts[res.category]++;
            total++;
          }
        }
      }
    }
  }
  const ms = Date.now() - t0;

  console.log(`  total hands enumerated: ${total} (expected 2598960) in ${ms}ms`);
  for (let cat = 9; cat >= 0; cat--) {
    console.log(`  ${CATEGORY_NAME[cat].padEnd(16)} : ${counts[cat]}`);
  }

  ok(total === 2598960, 'total combinations == C(52,5)');
  ok(counts[CATEGORY.ROYAL_FLUSH] === 4, 'royal flush count == 4');
  ok(counts[CATEGORY.STRAIGHT_FLUSH] === 36, 'straight flush count == 36 (excl. royal)');
  ok(counts[CATEGORY.QUADS] === 624, 'four of a kind count == 624');
  ok(counts[CATEGORY.FULL_HOUSE] === 3744, 'full house count == 3744');
  ok(counts[CATEGORY.FLUSH] === 5108, 'flush count == 5108');
  ok(counts[CATEGORY.STRAIGHT] === 10200, 'straight count == 10200 (excl. straight flushes)');
  ok(counts[CATEGORY.TRIPS] === 54912, 'three of a kind count == 54912');
  ok(counts[CATEGORY.TWO_PAIR] === 123552, 'two pair count == 123552');
  ok(counts[CATEGORY.ONE_PAIR] === 1098240, 'one pair count == 1098240');
  ok(counts[CATEGORY.HIGH_CARD] === 1302540, 'high card count == 1302540');
}

console.log(`\nALL PASS (${pass} assertions)`);
