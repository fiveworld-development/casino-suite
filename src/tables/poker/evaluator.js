// Standard 52-card poker hand evaluator.
// Card model: rank 2-14 (11=J,12=Q,13=K,14=A), suit 0-3.
// A card is encoded as an integer id 0-51: id = (rank-2)*4 + suit.

export const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function makeCard(rank, suit) { return (rank - 2) * 4 + suit; }
export function cardRank(id) { return Math.floor(id / 4) + 2; }
export function cardSuit(id) { return id % 4; }

export function fullDeck() {
  const d = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) d.push(makeCard(r, s));
  return d;
}

export const CATEGORY = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

export const CATEGORY_NAME = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];

// Encode a hand's comparable value as a single integer:
// (category << 20) | (r1<<16)|(r2<<12)|(r3<<8)|(r4<<4)|(r5)
// where r1..r5 are tie-break ranks in descending significance (0-14 fits in 4 bits... but 14 needs 4 bits = ok, 15 max)
function packValue(category, ranksDesc) {
  let v = category;
  for (let i = 0; i < 5; i++) {
    v = v * 15 + (ranksDesc[i] || 0);
  }
  return v;
}

// Straight detection over a set of distinct ranks (as a bitmask over ranks 2..14).
// Returns high card of best straight, or 0 if none. Handles wheel (A-2-3-4-5 => high=5).
function straightHighFromMask(rankMask) {
  // rankMask bit (r-2) set for present rank, r in 2..14
  const wheelMask = (1 << (14 - 2)) | (1 << (2 - 2)) | (1 << (3 - 2)) | (1 << (4 - 2)) | (1 << (5 - 2));
  let best = 0;
  for (let hi = 14; hi >= 6; hi--) {
    let need = 0;
    for (let k = 0; k < 5; k++) need |= 1 << (hi - k - 2);
    if ((rankMask & need) === need) { best = hi; break; }
  }
  if (best === 0 && (rankMask & wheelMask) === wheelMask) best = 5;
  return best;
}

// Fast, allocation-light counting used by evaluate5's hot path (no Map): a
// fixed-size array indexed by rank (2..14) holding per-rank counts.
const RANK_COUNT_BUF = new Int8Array(15);

// Evaluate exactly 5 cards (array of card ids). Returns { value, category, categoryName }.
export function evaluate5(cards) {
  if (cards.length !== 5) throw new Error('evaluate5 requires exactly 5 cards');
  const ranks = new Array(5);
  RANK_COUNT_BUF.fill(0);
  let rankMask = 0;
  let isFlush = true;
  const suit0 = cardSuit(cards[0]);
  let distinctCount = 0;
  for (let i = 0; i < 5; i++) {
    const c = cards[i];
    const r = cardRank(c);
    ranks[i] = r;
    if (RANK_COUNT_BUF[r] === 0) distinctCount++;
    RANK_COUNT_BUF[r]++;
    rankMask |= 1 << (r - 2);
    if (cardSuit(c) !== suit0) isFlush = false;
  }
  const straightHigh = distinctCount === 5 ? straightHighFromMask(rankMask) : 0;

  if (isFlush && straightHigh) {
    const cat = straightHigh === 14 ? CATEGORY.ROYAL_FLUSH : CATEGORY.STRAIGHT_FLUSH;
    return { value: packValue(cat, [straightHigh]), category: cat, categoryName: CATEGORY_NAME[cat] };
  }

  // groups sorted by (count desc, rank desc), built from the fixed-size buffer
  const groups = [];
  for (let r = 14; r >= 2; r--) if (RANK_COUNT_BUF[r] > 0) groups.push([r, RANK_COUNT_BUF[r]]);
  groups.sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const counts = groups.map((g) => g[1]);

  if (counts[0] === 4) {
    const kicker = groups.find((g) => g[1] === 1)[0];
    return finish(CATEGORY.QUADS, [groups[0][0], kicker]);
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return finish(CATEGORY.FULL_HOUSE, [groups[0][0], groups[1][0]]);
  }
  if (isFlush) {
    const desc = [...ranks].sort((a, b) => b - a);
    return finish(CATEGORY.FLUSH, desc);
  }
  if (straightHigh) {
    return finish(CATEGORY.STRAIGHT, [straightHigh]);
  }
  if (counts[0] === 3) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return finish(CATEGORY.TRIPS, [groups[0][0], ...kickers]);
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const pairRanks = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups.find((g) => g[1] === 1)[0];
    return finish(CATEGORY.TWO_PAIR, [...pairRanks, kicker]);
  }
  if (counts[0] === 2) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return finish(CATEGORY.ONE_PAIR, [groups[0][0], ...kickers]);
  }
  const desc = [...ranks].sort((a, b) => b - a);
  return finish(CATEGORY.HIGH_CARD, desc);

  function finish(cat, ranksDesc) {
    return { value: packValue(cat, ranksDesc), category: cat, categoryName: CATEGORY_NAME[cat] };
  }
}

const COMBO5_CACHE = new Map();
function combinations(arr, k) {
  const key = k;
  const out = [];
  const n = arr.length;
  const idx = [];
  for (let i = 0; i < k; i++) idx.push(i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// Evaluate the best 5-card hand out of 6 or 7 cards.
export function evaluateBest(cards) {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  if (cards.length === 5) return evaluate5(cards);
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const res = evaluate5(combo);
    if (!best || res.value > best.value) best = res;
  }
  return best;
}

export function compareHands(a, b) { return a.value - b.value; }
