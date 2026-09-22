// Plain node test (no deps). Run: node src/tables/blackjack/engine.test.js
import { handValue, valueLabel, dealerShouldHit, resolveHand, resolveInsurance, canSplit, canDouble, splitHand } from './engine.js';

let failed = 0, passed = 0;
function assert(cond, msg) { if (!cond) { failed++; console.error('FAIL:', msg); } else { passed++; } }
const c = (rank, suit = 'S') => ({ rank, suit });

// --- hand valuation, incl. soft hands ---
assert(handValue([c('K'), c('7')]).total === 17, 'K+7 = 17');
assert(handValue([c('A'), c('7')]).total === 18 && handValue([c('A'), c('7')]).soft, 'A+7 = soft 18');
assert(handValue([c('A'), c('7'), c('5')]).total === 13 && !handValue([c('A'), c('7'), c('5')]).soft, 'A+7+5 = hard 13 (ace demoted)');
assert(handValue([c('A'), c('A')]).total === 12 && handValue([c('A'), c('A')]).soft, 'A+A = soft 12');
assert(handValue([c('A'), c('A'), c('9')]).total === 21 && handValue([c('A'), c('A'), c('9')]).soft, 'A+A+9 = soft 21');
assert(handValue([c('10'), c('9'), c('5')]).isBust, '10+9+5 busts');
assert(handValue([c('A'), c('K')]).isBlackjack, 'A+K is blackjack');
assert(!handValue([c('7'), c('7'), c('7')]).isBlackjack, '7+7+7 (21, 3 cards) is not blackjack');
assert(valueLabel([c('A'), c('6')]) === '7/17', 'label for soft 17 is 7/17');
assert(valueLabel([c('10'), c('9')]) === '19', 'label for hard 19 is 19');

// --- dealer S17 logic ---
assert(dealerShouldHit([c('10'), c('6')]) === true, 'dealer hits hard 16');
assert(dealerShouldHit([c('10'), c('7')]) === false, 'dealer stands hard 17');
assert(dealerShouldHit([c('A'), c('6')]) === false, 'dealer STANDS on soft 17 (S17 rule)');
assert(dealerShouldHit([c('A'), c('7')]) === false, 'dealer stands soft 18');
assert(dealerShouldHit([c('9'), c('9')]) === false, 'dealer stands 18');

// --- payout table ---
{
  const r = resolveHand([c('A'), c('K')], [c('10'), c('9')], 10);
  assert(r.outcome === 'blackjack' && r.payout === 25, 'natural blackjack pays 3:2 (10 -> 25 total incl. stake)');
}
{
  const r = resolveHand([c('A'), c('K')], [c('A'), c('K')], 10);
  assert(r.outcome === 'push' && r.payout === 10, 'blackjack vs blackjack pushes, stake returned');
}
{
  const r = resolveHand([c('10'), c('9')], [c('10'), c('8')], 10);
  assert(r.outcome === 'win' && r.payout === 20, 'plain win pays 1:1 (10 -> 20 total)');
}
{
  const r = resolveHand([c('10'), c('9')], [c('10'), c('9')], 10);
  assert(r.outcome === 'push' && r.payout === 10, 'tie is a push, stake returned');
}
{
  const r = resolveHand([c('10'), c('9')], [c('10'), c('K')], 10);
  assert(r.outcome === 'lose' && r.payout === 0, 'lower total loses, no payout');
}
{
  const r = resolveHand([c('10'), c('9'), c('5')], [c('10'), c('7')], 10);
  assert(r.outcome === 'bust' && r.payout === 0, 'player bust loses regardless of dealer hand');
}
{
  const r = resolveHand([c('10'), c('9')], [c('10'), c('9'), c('5')], 10);
  assert(r.outcome === 'win' && r.payout === 20, 'dealer bust pays player 1:1');
}
{
  const r = resolveHand([c('9'), c('9')], [c('A'), c('K')], 10);
  assert(r.outcome === 'lose' && r.payout === 0, 'dealer blackjack beats non-blackjack 20 or less');
}
// split blackjack pays even money, not 3:2
{
  const r = resolveHand([c('A'), c('K')], [c('10'), c('9')], 10, { isSplit: true });
  assert(r.outcome === 'win' && r.payout === 20, 'post-split 21 (A+K) pays even money, not 3:2');
}
// double: payout math is bet-size agnostic, doubled bet just resolves as a normal hand at 2x stake
{
  const r = resolveHand([c('K'), c('9')], [c('10'), c('6')], 20); // doubled bet of 10 -> 20, player 19 beats dealer 16
  assert(r.outcome === 'win' && r.payout === 40, 'double win pays 1:1 on the doubled stake');
}
// insurance
assert(resolveInsurance([c('A'), c('K')], 5) === 15, 'insurance pays 2:1 (5 -> 15 total) on dealer blackjack');
assert(resolveInsurance([c('A'), c('9')], 5) === 0, 'insurance loses when dealer has no blackjack');

// --- split / double eligibility ---
assert(canSplit({ cards: [c('8'), c('8')] }, 1) === true, 'can split 8+8');
assert(canSplit({ cards: [c('K'), c('Q')] }, 1) === true, 'can split K+Q (both value 10)');
assert(canSplit({ cards: [c('8'), c('7')] }, 1) === false, 'cannot split 8+7');
assert(canSplit({ cards: [c('8'), c('8')] }, 4) === false, 'cannot split at 4 hands already');
assert(canDouble({ cards: [c('5'), c('6')] }) === true, 'can double any first two cards');
assert(canDouble({ cards: [c('5'), c('6'), c('2')] }) === false, 'cannot double after hitting');

// split aces: one card each, cannot hit/re-split further
{
  let deckCards = [c('9'), c('2')];
  let i = 0;
  const draw = () => deckCards[i++];
  const hand = { cards: [c('A'), c('A')], bet: 10 };
  const [a, b] = splitHand(hand, draw);
  assert(a.cards.length === 2 && b.cards.length === 2, 'split aces each get exactly one extra card');
  assert(a.done === true && b.done === true, 'split-ace hands are marked done (no further hits)');
  assert(canSplit(a, 2) === false, 'split-ace hand cannot be re-split');
}

console.log(failed ? `\n${failed} FAILURES (${passed} passed)` : `\nAll ${passed} engine.js assertions passed.`);
process.exitCode = failed ? 1 : 0;
