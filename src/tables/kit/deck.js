// Shared deck/shoe logic for table games. No external deps.
// A "card" is a plain object { rank, suit } — rank is 'A','2'..'10','J','Q','K'; suit is 'S','H','D','C'.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

// Unbiased random index in [0, n) using crypto.getRandomValues with rejection sampling
// (avoids modulo bias that a plain `% n` would introduce).
export function randomInt(n) {
  if (n <= 0) throw new Error('n must be > 0');
  const maxUint32 = 0xffffffff;
  const limit = Math.floor((maxUint32 + 1) / n) * n; // largest multiple of n that fits in uint32 range
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

// Fisher-Yates shuffle, in place, using the unbiased randomInt above.
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A multi-deck shoe with penetration-based reshuffle. */
export class Shoe {
  /**
   * @param {number} decks number of 52-card decks
   * @param {number} penetration fraction (0-1) of the shoe dealt before a reshuffle is due
   */
  constructor(decks = 6, penetration = 0.75) {
    this.decks = decks;
    this.penetration = penetration;
    this.cards = [];
    this.discard = [];
    this.reshuffle();
  }

  get totalCards() { return this.decks * 52; }
  get remaining() { return this.cards.length; }

  reshuffle() {
    const all = [];
    for (let i = 0; i < this.decks; i++) all.push(...makeDeck());
    shuffle(all);
    this.cards = all;
    this.discard = [];
  }

  /** True once penetration threshold is reached (checked between rounds, never mid-hand). */
  needsReshuffle() {
    const dealt = this.totalCards - this.cards.length;
    return dealt / this.totalCards >= this.penetration;
  }

  draw() {
    if (this.cards.length === 0) this.reshuffle();
    return this.cards.pop();
  }

  discardCards(cards) {
    this.discard.push(...cards);
  }
}
