// Simulates N hands of Blackjack through the real engine using basic strategy, to measure the
// house edge (expected ~0.4-0.6% for 6-deck S17, BJ 3:2, double any 2 incl. after split, split to 4
// hands, DAS, no surrender). Run: node scripts/sim-blackjack.js [hands]
import { Shoe } from '../src/tables/kit/deck.js';
import { handValue, dealerShouldHit, resolveHand, resolveInsurance, canSplit, canDouble, splitHand } from '../src/tables/blackjack/engine.js';

const HANDS = Number(process.argv[2]) || 1_000_000;
const BET = 10;

function rv(rank) { return rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank); }
function upcardVal(card) { return rv(card.rank) === 11 ? 11 : Math.min(rv(card.rank), 10); }

// Basic strategy decision for a player hand vs dealer upcard. Returns 'H'|'S'|'D'|'P'.
// Standard 6-deck S17 DAS basic strategy chart.
function basicStrategy(hand, dealerUp, canDoubleNow, canSplitNow) {
  const v = handValue(hand.cards);
  const up = upcardVal(dealerUp);
  const ranks = hand.cards.map((c) => c.rank);

  if (canSplitNow && ranks[0] === ranks[1]) {
    const pv = rv(ranks[0]);
    const pair = ranks[0] === 'A' ? 'A' : pv;
    const alwaysSplit = new Set(['A', 8]);
    if (alwaysSplit.has(pair)) return 'P';
    if (pair === 9) { if ([2, 3, 4, 5, 6, 8, 9].includes(up)) return 'P'; }
    else if (pair === 7) { if (up <= 7) return 'P'; }
    else if (pair === 6) { if (up <= 6) return 'P'; }
    else if (pair === 4) { if (up === 5 || up === 6) return 'P'; }
    else if (pair === 2 || pair === 3) { if (up <= 7) return 'P'; }
    // else fall through to hard/soft table (5s and 10s never split)
  }

  if (v.soft && v.total <= 21 && hand.cards.length === 2) {
    // soft totals (A+x)
    const other = v.total - 11;
    if (other >= 8) return 'S'; // soft 19-21 stand (A9/A10)
    if (other === 7) { // soft 18
      if (canDoubleNow && [3, 4, 5, 6].includes(up)) return 'D';
      if (up >= 9) return 'H';
      return 'S';
    }
    if (other >= 6) return canDoubleNow && [2, 3, 4, 5, 6].includes(up) ? 'D' : 'H'; // soft 17
    if (other >= 4) return canDoubleNow && [4, 5, 6].includes(up) ? 'D' : 'H'; // soft 15-16
    return canDoubleNow && [5, 6].includes(up) ? 'D' : 'H'; // soft 13-14
  }

  const t = v.total;
  if (t >= 17) return 'S';
  if (t >= 13) return up <= 6 ? 'S' : 'H';
  if (t === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (t === 11) return canDoubleNow ? 'D' : 'H';
  if (t === 10) return canDoubleNow && up <= 9 ? 'D' : 'H';
  if (t === 9) return canDoubleNow && up >= 3 && up <= 6 ? 'D' : 'H';
  return 'H';
}

function playHand(shoe, hand, dealerUp) {
  // returns array of finished hands (splits produce multiple)
  const stack = [hand];
  const finished = [];
  let handsCount = 1;
  while (stack.length) {
    const h = stack.pop();
    if (h.done) { finished.push(h); continue; }
    for (;;) {
      const canDbl = canDouble(h) && !h.doubled;
      const canSpl = canSplit(h, handsCount) && !h.doubled;
      const move = basicStrategy(h, dealerUp, canDbl, canSpl);
      if (move === 'P' && canSpl) {
        const [a, b] = splitHand(h, () => shoe.draw());
        handsCount++;
        stack.push(a, b);
        h.split = true;
        break;
      }
      if (move === 'D' && canDbl) {
        h.cards.push(shoe.draw());
        h.bet *= 2;
        h.doubled = true;
        h.done = true;
        break;
      }
      if (move === 'H') {
        h.cards.push(shoe.draw());
        if (handValue(h.cards).isBust) { h.done = true; break; }
        continue;
      }
      h.done = true; // stand
      break;
    }
    if (h.done && !h.split) finished.push(h);
  }
  return finished;
}

function simulate(hands) {
  const shoe = new Shoe(6, 0.75);
  let wagered = 0, returned = 0;
  for (let i = 0; i < hands; i++) {
    if (shoe.needsReshuffle()) shoe.reshuffle();
    const playerCards = [shoe.draw(), shoe.draw()];
    const dealerCards = [shoe.draw(), shoe.draw()]; // [0]=upcard, [1]=hole
    const dealerUp = dealerCards[0];
    let roundWagered = 0, roundReturned = 0;

    // insurance (basic strategy: never take insurance — it's -EV, so it never affects wagered/returned)
    const dealerHasBJ = handValue(dealerCards).isBlackjack;

    const pBJ = handValue(playerCards).isBlackjack;
    if (pBJ || dealerHasBJ) {
      roundWagered = BET;
      const r = resolveHand(playerCards, dealerCards, BET);
      roundReturned = r.payout;
    } else {
      const hand = { cards: playerCards, bet: BET, done: false, doubled: false };
      const finished = playHand(shoe, hand, dealerUp);
      // dealer plays once
      while (dealerShouldHit(dealerCards)) dealerCards.push(shoe.draw());
      for (const h of finished) {
        roundWagered += h.bet; // each finished hand's own stake (covers splits and doubles correctly)
        const r = resolveHand(h.cards, dealerCards, h.bet, { isSplit: !!h.isSplit });
        roundReturned += r.payout;
      }
    }
    wagered += roundWagered;
    returned += roundReturned;
  }
  return { wagered, returned };
}

const { wagered, returned } = simulate(HANDS);
const net = returned - wagered;
const houseEdge = -net / wagered;
console.log(`Hands: ${HANDS.toLocaleString()}`);
console.log(`Wagered: ${wagered.toFixed(2)}  Returned: ${returned.toFixed(2)}  Net (player): ${net.toFixed(2)}`);
console.log(`House edge: ${(houseEdge * 100).toFixed(3)}%`);
