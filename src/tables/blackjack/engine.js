// Pure Blackjack rules engine (no Pixi/DOM deps) — testable in plain node.
// Rules: 6 decks, dealer stands on soft 17, blackjack pays 3:2, double any two cards incl.
// after split, split up to 3 hands (4 total), split aces once with one card each,
// insurance 2:1 on dealer ace, dealer peeks for blackjack. Honest: no cheating/deck stacking.
import { Shoe } from '../kit/deck.js';

export const cents = (v) => Math.round(v * 100) / 100;

function rankValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return Number(rank);
}

/** Best total + softness for a hand of cards. Returns { total, soft, isBust, isBlackjack }. */
export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += rankValue(c.rank); if (c.rank === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; } // demote an ace from 11 to 1
  const soft = aces > 0 && total <= 21; // at least one ace still counted as 11
  return {
    total,
    soft,
    isBust: total > 21,
    isBlackjack: cards.length === 2 && total === 21,
  };
}

/** Human label like "17" or "7/17" for a soft hand. */
export function valueLabel(cards) {
  const v = handValue(cards);
  if (!v.soft) return String(v.total);
  return `${v.total - 10}/${v.total}`;
}

/** Dealer draw logic: hits until 17+, stands on soft 17 (S17). Mutates and returns the hand array. */
export function dealerShouldHit(cards) {
  const v = handValue(cards);
  if (v.total < 17) return true;
  if (v.total === 17 && v.soft) return false; // stand on soft 17
  return false;
}

/**
 * Resolves payout for one finished player hand against the dealer's finished hand.
 * @returns { outcome: 'blackjack'|'win'|'push'|'lose'|'bust', payout: number (total returned incl. stake, 0 if lose) }
 */
export function resolveHand(playerCards, dealerCards, bet, { isSplit = false } = {}) {
  const p = handValue(playerCards);
  const d = handValue(dealerCards);
  if (p.isBust) return { outcome: 'bust', payout: 0 };
  // A blackjack made via split (e.g. split aces + ten) pays even money, not 3:2, by standard rules.
  if (p.isBlackjack && !isSplit) {
    if (d.isBlackjack) return { outcome: 'push', payout: cents(bet) };
    return { outcome: 'blackjack', payout: cents(bet + bet * 1.5) };
  }
  if (d.isBust) return { outcome: 'win', payout: cents(bet * 2) };
  if (d.isBlackjack && !p.isBlackjack) return { outcome: 'lose', payout: 0 };
  if (p.total > d.total) return { outcome: 'win', payout: cents(bet * 2) };
  if (p.total < d.total) return { outcome: 'lose', payout: 0 };
  return { outcome: 'push', payout: cents(bet) };
}

/** Insurance side bet payout: 2:1 if dealer has blackjack, else lost. */
export function resolveInsurance(dealerCards, insuranceBet) {
  const d = handValue(dealerCards);
  return d.isBlackjack ? cents(insuranceBet * 3) : 0; // stake + 2:1 win = 3x
}

// ---------------------------------------------------------------- game orchestration

export class BlackjackGame {
  constructor({ decks = 6, penetration = 0.75 } = {}) {
    this.shoe = new Shoe(decks, penetration);
  }

  maybeReshuffle() {
    if (this.shoe.needsReshuffle()) this.shoe.reshuffle();
  }

  draw() { return this.shoe.draw(); }
}

/** Splits a hand into two, each getting one new card (2 cards total), unless splitting aces
 *  which per rules get exactly one card each and cannot be re-split or hit further. */
export function splitHand(hand, drawFn) {
  const isAceSplit = hand.cards[0].rank === 'A';
  const a = { cards: [hand.cards[0], drawFn()], bet: hand.bet, done: isAceSplit, isSplit: true, isAceSplit, doubled: false };
  const b = { cards: [hand.cards[1], drawFn()], bet: hand.bet, done: isAceSplit, isSplit: true, isAceSplit, doubled: false };
  return [a, b];
}

export function canSplit(hand, handsCount) {
  return hand.cards.length === 2 && rankValue(hand.cards[0].rank) === rankValue(hand.cards[1].rank)
    && handsCount < 4 && !(hand.isAceSplit); // split aces only once
}

export function canDouble(hand) {
  return hand.cards.length === 2 && !hand.isAceSplit;
}
