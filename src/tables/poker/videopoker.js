// "Kush or Better" - Jacks or Better 9/6 video poker, 5 coins max.
import { fullDeck, evaluate5, cardRank, CATEGORY } from './evaluator.js';

// Per-coin payout multiplier table for 1-4 coins bet, indexed by category.
// Royal flush pays the same 250x per-coin multiplier for 1-4 coins, then
// jumps to a bonus 800x-per-coin ONLY at the full 5-coin bet.
const PAYTABLE = {
  [CATEGORY.ROYAL_FLUSH]: 250,
  [CATEGORY.STRAIGHT_FLUSH]: 50,
  [CATEGORY.QUADS]: 25,
  [CATEGORY.FULL_HOUSE]: 9,
  [CATEGORY.FLUSH]: 6,
  [CATEGORY.STRAIGHT]: 4,
  [CATEGORY.TRIPS]: 3,
  [CATEGORY.TWO_PAIR]: 2,
  // ONE_PAIR only pays for jacks-or-better; handled specially below.
};

const ROYAL_5COIN_BONUS = 800;

// Allocation-free rank-count scratch buffer, sized for ranks 2-14 (index by rank).
const JOB_COUNT_BUF = new Int8Array(15);
function isJacksOrBetterPair(cards5) {
  JOB_COUNT_BUF.fill(0);
  for (let i = 0; i < 5; i++) JOB_COUNT_BUF[cardRank(cards5[i])]++;
  for (let r = 11; r <= 14; r++) if (JOB_COUNT_BUF[r] === 2) return true;
  return false;
}

// Payout in coins for a made 5-card hand at a given coin bet (1-5).
export function payoutFor(cards5, coins) {
  if (coins < 1 || coins > 5) throw new Error('coins must be 1-5');
  const res = evaluate5(cards5);
  if (res.category === CATEGORY.ROYAL_FLUSH) {
    return coins === 5 ? ROYAL_5COIN_BONUS * coins : PAYTABLE[CATEGORY.ROYAL_FLUSH] * coins;
  }
  if (res.category === CATEGORY.ONE_PAIR) {
    return isJacksOrBetterPair(cards5) ? 1 * coins : 0;
  }
  const mult = PAYTABLE[res.category];
  return mult ? mult * coins : 0;
}

export function categoryOf(cards5) { return evaluate5(cards5).category; }

// Exact EV for holding a subset of `hand` (5 cards) described by `holdMask`
// (bit i = keep hand[i]), drawing the rest from `remainingDeck` (47 cards),
// at the given coin bet. Enumerates ALL C(47,k) actual draws.
//
// This walks combinations in-place (a single reused index array + a single
// reused 5-card scratch hand) instead of materializing the full list of
// draws up front. For k=5 that list would be 1,533,939 five-element arrays
// (~100MB+ of garbage) - building it was the dominant cost, not the hand
// evaluations themselves; avoiding the allocation is what makes exact
// enumeration usable for the RTP measurement below.
export function exactEV(hand, holdMask, remainingDeck, coins) {
  const heldIdx = [];
  const drawIdx = [];
  for (let i = 0; i < 5; i++) (((holdMask >> i) & 1) ? heldIdx : drawIdx).push(i);
  const k = drawIdx.length;

  const finalHand = new Array(5);
  for (let i = 0; i < heldIdx.length; i++) finalHand[heldIdx[i]] = hand[heldIdx[i]];

  if (k === 0) {
    // all 5 held: no draw happens, EV is exactly this hand's payout.
    return payoutFor(hand, coins);
  }

  const n = remainingDeck.length;
  const idx = new Array(k);
  for (let i = 0; i < k; i++) idx[i] = i;
  let total = 0;
  let count = 0;
  while (true) {
    for (let i = 0; i < k; i++) finalHand[drawIdx[i]] = remainingDeck[idx[i]];
    total += payoutFor(finalHand, coins);
    count++;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return total / count;
}

// Try all 32 hold masks for `hand` given `remainingDeck` (cards not in hand),
// return the best (highest EV) mask along with its EV. Used as the in-game
// "hint" feature and as the ground truth the tests below verify against.
//
// This still computes a fully exact EV (exactEV, full C(47,k) enumeration)
// for every mask it scores - it is NOT a sampled/approximate solver. The
// only shortcut is skipping two mask *tiers* that are always dominated
// (provably never optimal) under standard 9/6 Jacks-or-Better theory, so
// pruning them cannot change which mask wins:
//   - holding 0 cards (draw all 5) is always dominated by holding any single
//     J/Q/K/A that's present, because that card can only ever help (it can
//     complete a pair/straight/flush/royal) and can never hurt (a single
//     card is never part of a *worse* line than nothing) - so mask=0 is
//     skipped whenever the hand has a card ranked J or higher.
//   - holding exactly one card is only ever optimal when that card is
//     J/Q/K/A (a lone 2-10 is always at least matched by discarding it) -
//     so of the 5 "hold exactly 1" masks, only ones on J+ cards are scored.
// These are the same two costliest mask tiers (hold-0 is C(47,5)=1,533,939
// draws; each hold-1 mask is C(47,4)=178,365 draws), so pruning them is what
// makes exact enumeration usable at all instead of taking minutes per hand.
function prunedExactMasks(hand) {
  const ranks = hand.map(cardRank);
  const hasHighCard = ranks.some((r) => r >= 11);
  const masks = [];
  for (let mask = 0; mask < 32; mask++) {
    const holdCount = ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1) + ((mask >> 4) & 1));
    if (holdCount === 0 && hasHighCard) continue; // dominated by holding a J+
    if (holdCount === 1) {
      const heldIdx = [0, 1, 2, 3, 4].find((i) => (mask >> i) & 1);
      if (ranks[heldIdx] < 11) continue; // lone 2-10 is dominated by discarding it
    }
    masks.push(mask);
  }
  return masks;
}

export function solveBestHold(hand, remainingDeck, coins) {
  let best = { mask: 0b00000, ev: -Infinity };
  for (const mask of prunedExactMasks(hand)) {
    const ev = exactEV(hand, mask, remainingDeck, coins);
    if (ev > best.ev) best = { mask, ev };
  }
  return best;
}

// Canonicalize a hand to (sorted ranks, suit-partition pattern): exactEV is
// invariant under any consistent relabeling of the 4 suits (the removed
// cards' ranks and *which cards share a suit* are all that affect the
// remaining deck's category odds - which physical suit they happen to be
// doesn't matter). Caching solveBestHold by this canonical key lets repeated
// shapes across a large RTP run reuse a previous exact solve.
// Returns the canonical key AND the card order it was built from. The hold mask is position-based,
// so a cached mask must be stored in canonical order and translated back to the actual hand –
// otherwise a hit for the same shape in a different card order would hold the wrong cards
// (bug in the first version, which made the measured RTP meaningless).
function canonicalize(hand) {
  const order = hand.map((c, i) => i).sort((a, b) => cardRank(hand[b]) - cardRank(hand[a]) || (hand[a] % 4) - (hand[b] % 4));
  const suitGroup = new Map();
  let next = 0;
  const key = order.map((i) => {
    const s = hand[i] % 4;
    if (!suitGroup.has(s)) suitGroup.set(s, next++);
    return `${cardRank(hand[i])}.${suitGroup.get(s)}`;
  }).join(',');
  return { key, order };
}

const solveCache = new Map();
const SOLVE_CACHE_MAX = 200000; // bound memory on very long runs
function cachedSolveBestHold(hand, remainingDeck, coins) {
  const { key, order } = canonicalize(hand);
  const hit = solveCache.get(`${coins}|${key}`);
  if (hit) {
    let mask = 0;
    order.forEach((orig, k) => { if ((hit.canonMask >> k) & 1) mask |= 1 << orig; });
    return { mask, ev: hit.ev };
  }
  const result = solveBestHold(hand, remainingDeck, coins);
  let canonMask = 0;
  order.forEach((orig, k) => { if ((result.mask >> orig) & 1) canonMask |= 1 << k; });
  if (solveCache.size < SOLVE_CACHE_MAX) solveCache.set(`${coins}|${key}`, { canonMask, ev: result.ev });
  return result;
}

function shuffled(rng) {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Reference figure only (industry-published optimal-play RTP for 9/6 Jacks or
// Better), NOT the value measured by this simulator.
export const REFERENCE_RTP_9_6_JOB = 0.9954; // reference, not measured

// Simulate `handCount` hands of video poker using the fully exact solver
// (solveBestHold, via a canonical-hand cache - see cachedSolveBestHold) to
// pick the hold on every hand, then ONE real random draw per hand (not
// sampling) to realize the actual outcome. Returns { handsPlayed, coinsBet,
// coinsWon, rtp, stdError, ci95 } where stdError/ci95 describe the sampling
// uncertainty of the measured RTP over this many hands (payouts are heavy-
// tailed - dominated by rare jackpots - so this is a real, wide interval,
// not a rounding footnote).
export function simulateRTP(handCount, coins = 5, rng = Math.random) {
  let coinsBet = 0;
  let coinsWon = 0;
  let sumSq = 0; // sum of squared per-hand payouts, for variance/CI
  for (let h = 0; h < handCount; h++) {
    const deck = shuffled(rng);
    const hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    const remainingDeck = deck; // 47 cards left, matches "true remaining deck"

    const { mask } = cachedSolveBestHold(hand, remainingDeck, coins);

    // Perform ONE actual random draw consistent with the chosen hold.
    const finalHand = hand.slice();
    const pool = remainingDeck.slice();
    for (let i = 0; i < 5; i++) {
      if (((mask >> i) & 1) === 0) {
        const j = Math.floor(rng() * pool.length);
        finalHand[i] = pool[j];
        pool.splice(j, 1);
      }
    }

    const payout = payoutFor(finalHand, coins);
    coinsBet += coins;
    coinsWon += payout;
    sumSq += payout * payout;
  }
  const rtp = coinsWon / coinsBet;
  // Per-hand payout variance -> standard error of the mean payout -> CI for RTP.
  const meanPayout = coinsWon / handCount;
  const variance = Math.max(0, sumSq / handCount - meanPayout * meanPayout);
  const stdErrorPayout = Math.sqrt(variance / handCount);
  const stdError = stdErrorPayout / coins; // convert payout SE to RTP-fraction SE
  const ci95 = [rtp - 1.96 * stdError, rtp + 1.96 * stdError];
  return {
    handsPlayed: handCount, coinsBet, coinsWon, rtp, stdError, ci95, cacheSize: solveCache.size,
  };
}
