// AI personalities for Haze Kings Lounge hold'em: The Kingpin, Lucky Mary,
// Blaze, Dr. Kush, Couch Rookie.
//
// Each decision function receives ONLY:
//   holeCards: [id, id]              - this AI's own two hole cards
//   publicState: {
//     board, pot, toCall, currentBet, minRaise, stack, playersLeft,
//     street, history,
//   }
//   params: personality knobs
// It must NEVER read other players' hole cards or the undealt deck; those are
// simply not passed in, and it reconstructs its own "unseen" remainder deck
// from fullDeck() minus (holeCards + board) for Monte-Carlo sampling.

import { fullDeck, evaluateBest } from './evaluator.js';

function remainderDeck(holeCards, board) {
  const seen = new Set([...holeCards, ...board]);
  return fullDeck().filter((c) => !seen.has(c));
}

function shuffleSample(deck, count, rng) {
  // partial Fisher-Yates: only shuffle the first `count` slots we need.
  const d = deck.slice();
  const n = d.length;
  const take = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [d[i], d[j]] = [d[j], d[i]];
    take.push(d[i]);
  }
  return take;
}

// Monte-Carlo equity: estimate P(win or tie-share) for holeCards given board,
// against `opponents` random hands, running out any missing board cards.
export function estimateEquity(holeCards, board, opponents, samples = 500, rng = Math.random) {
  const deck = remainderDeck(holeCards, board);
  const missingBoard = 5 - board.length;
  const needed = opponents * 2 + missingBoard;
  if (deck.length < needed || opponents < 1) return 0.5;

  let winShare = 0;
  for (let s = 0; s < samples; s++) {
    const drawn = shuffleSample(deck, needed, rng);
    const oppHands = [];
    let p = 0;
    for (let o = 0; o < opponents; o++) { oppHands.push([drawn[p], drawn[p + 1]]); p += 2; }
    const fullBoard = [...board, ...drawn.slice(p)];

    const myVal = evaluateBest([...holeCards, ...fullBoard]).value;
    let bestOpp = -1;
    let tieCount = 0;
    for (const oh of oppHands) {
      const v = evaluateBest([...oh, ...fullBoard]).value;
      if (v > bestOpp) { bestOpp = v; }
    }
    if (myVal > bestOpp) winShare += 1;
    else if (myVal === bestOpp) {
      // count how many (including possibly self) tie at the top
      let tiers = 1;
      for (const oh of oppHands) {
        const v = evaluateBest([...oh, ...fullBoard]).value;
        if (v === myVal) tiers++;
      }
      winShare += 1 / tiers;
    }
  }
  return winShare / samples;
}

// Returns a legal raise-to amount, or null if the player does not have
// enough chips beyond the call to make a real raise (should call all-in instead).
function clampRaise(amount, state) {
  const maxLegal = (state.currentBet - state.toCall) + state.stack; // cannot exceed stack
  if (maxLegal <= state.currentBet) return null; // no surplus chips to raise with
  const minLegal = state.currentBet + state.minRaise;
  const amt = Math.min(Math.max(amount, minLegal), maxLegal);
  return Math.round(amt);
}

function raiseOrCall(amount, state) {
  const amt = clampRaise(amount, state);
  if (amt === null) return { action: 'call' };
  return { action: 'raise', amount: amt };
}

function baseDecision(personality, holeCards, state, rng) {
  const {
    vpip = 0.5, aggression = 0.5, bluffFreq = 0.05, opponents = 2, samples = 400,
  } = personality;

  const equity = estimateEquity(holeCards, state.board, Math.max(1, opponents), samples, rng);
  const potOdds = state.toCall > 0 ? state.toCall / (state.pot + state.toCall) : 0;

  const bluff = rng() < bluffFreq;
  const wantsIn = bluff || equity >= potOdds * (1 - aggression * 0.3) || equity > 0.5;

  if (state.toCall === 0) {
    // can check for free
    const raiseThreshold = 0.55 - aggression * 0.15;
    if ((equity > raiseThreshold || bluff) && rng() < vpip) {
      const sizing = state.pot * (0.5 + aggression * 0.75);
      return raiseOrCall(state.currentBet + Math.max(state.minRaise, sizing), state);
    }
    return { action: 'check' };
  }

  // facing a bet
  if (!wantsIn || rng() > vpip + 0.1) {
    return { action: 'fold' };
  }
  const raiseThreshold = 0.62 - aggression * 0.2;
  if ((equity > raiseThreshold && rng() < aggression) || (bluff && rng() < aggression)) {
    const sizing = state.pot * (0.6 + aggression * 0.8);
    return raiseOrCall(state.currentBet + Math.max(state.minRaise, sizing), state);
  }
  return { action: 'call' };
}

// The Kingpin — tight-aggressive: plays few hands but bets/raises hard.
export function kingpinDecide(holeCards, state, params = {}) {
  return baseDecision({ vpip: 0.22, aggression: 0.8, bluffFreq: 0.04, ...params }, holeCards, state, params.rng || Math.random);
}

// Lucky Mary — loose-passive: plays many hands, rarely raises, calls a lot.
export function luckyMaryDecide(holeCards, state, params = {}) {
  const d = baseDecision({ vpip: 0.75, aggression: 0.2, bluffFreq: 0.03, ...params }, holeCards, state, params.rng || Math.random);
  if (d.action === 'raise' && (params.rng || Math.random)() < 0.6) return { action: 'call' }; // passive: downgrade raises often
  return d;
}

// Blaze — the bluffer: high bluff frequency, loose-aggressive.
export function blazeDecide(holeCards, state, params = {}) {
  return baseDecision({ vpip: 0.55, aggression: 0.7, bluffFreq: 0.28, ...params }, holeCards, state, params.rng || Math.random);
}

// Dr. Kush — pot-odds math: decides almost purely on equity vs pot odds.
export function drKushDecide(holeCards, state, params = {}) {
  const rng = params.rng || Math.random;
  const opponents = Math.max(1, (state.playersLeft || 2) - 1);
  const samples = params.samples || 600;
  const equity = estimateEquity(holeCards, state.board, opponents, samples, rng);
  const potOdds = state.toCall > 0 ? state.toCall / (state.pot + state.toCall) : 0;

  if (state.toCall === 0) {
    if (equity > 0.6) {
      return raiseOrCall(state.currentBet + Math.max(state.minRaise, state.pot * 0.66), state);
    }
    return { action: 'check' };
  }
  if (equity < potOdds - 0.02) return { action: 'fold' };
  if (equity > potOdds + 0.25) {
    return raiseOrCall(state.currentBet + Math.max(state.minRaise, state.pot * 0.75), state);
  }
  return { action: 'call' };
}

// Couch Rookie — erratic: mostly random within legal actions, small edge from equity.
export function couchRookieDecide(holeCards, state, params = {}) {
  const rng = params.rng || Math.random;
  const opponents = Math.max(1, (state.playersLeft || 2) - 1);
  const equity = estimateEquity(holeCards, state.board, opponents, params.samples || 300, rng);
  const roll = rng();
  if (state.toCall === 0) {
    if (roll < 0.15 + equity * 0.2) {
      return raiseOrCall(state.currentBet + Math.max(state.minRaise, state.pot * (0.3 + rng() * 0.9)), state);
    }
    return { action: 'check' };
  }
  if (roll < 0.2 && equity < 0.7) return { action: 'fold' };
  if (roll > 0.85) {
    return raiseOrCall(state.currentBet + Math.max(state.minRaise, state.pot * (0.3 + rng() * 1.2)), state);
  }
  return { action: 'call' };
}

export const PERSONALITIES = {
  kingpin: kingpinDecide,
  luckyMary: luckyMaryDecide,
  blaze: blazeDecide,
  drKush: drKushDecide,
  couchRookie: couchRookieDecide,
};
