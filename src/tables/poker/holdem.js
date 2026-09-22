// No-Limit Texas Hold'em engine. Blinds 5/10, buy-in 1000.
import { wallet } from '../../shared/wallet.js';
import { fullDeck, evaluateBest } from './evaluator.js';

export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const BUY_IN = 1000;
export const MAX_SEATS = 6;

function shuffled(rng = Math.random) {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.stack = 0;
    this.hole = [];
    this.folded = false;
    this.allIn = false;
    this.seat = null;
    this.committedThisHand = 0; // total put into pot across all streets this hand
  }

  sitDown(seat) {
    if (!wallet.take(BUY_IN)) return false;
    this.stack = BUY_IN;
    this.seat = seat;
    return true;
  }

  cashOut() {
    wallet.add(this.stack);
    const s = this.stack;
    this.stack = 0;
    this.seat = null;
    return s;
  }
}

export class Table {
  constructor(rng = Math.random) {
    this.seats = new Array(MAX_SEATS).fill(null);
    this.buttonSeat = -1;
    this.rng = rng;
    this.handNumber = 0;
  }

  seatPlayer(player, seatIdx) {
    if (this.seats[seatIdx]) throw new Error('seat occupied');
    if (!player.sitDown(seatIdx)) return false;
    this.seats[seatIdx] = player;
    return true;
  }

  activeSeatOrder() {
    // seats with a player, in seat-index order
    const idxs = [];
    for (let i = 0; i < MAX_SEATS; i++) if (this.seats[i]) idxs.push(i);
    return idxs;
  }

  nextButton() {
    const occ = this.activeSeatOrder();
    if (occ.length === 0) return -1;
    if (this.buttonSeat === -1) return occ[0];
    let i = occ.indexOf(this.buttonSeat);
    if (i === -1) i = -1;
    return occ[(i + 1) % occ.length];
  }

  // Plays one full hand to showdown (or to a single remaining player) using
  // provided decision function `decide(player, state) -> {action, amount}`.
  // decide is called for each player to act; action in fold/check/call/raise.
  // `decide` may return a plain object OR a Promise (awaited) - this lets a
  // real UI pause the hand and wait for the human player's button click,
  // while AI players (synchronous) resolve instantly, same as before.
  // `onStreet(street, board)` (optional) fires right after each street's cards are dealt
  // (preflop immediately, then flop/turn/river as they're revealed) - lets a UI animate
  // community cards in one at a time instead of only seeing the final board at the end.
  async playHand(decide, onStreet) {
    const occ = this.activeSeatOrder().filter((i) => this.seats[i].stack > 0);
    if (occ.length < 2) throw new Error('need at least 2 players with chips to play a hand');
    this.handNumber++;
    this.buttonSeat = this.nextButton();

    const players = occ.map((i) => this.seats[i]);
    for (const p of players) { p.folded = false; p.allIn = false; p.hole = []; p.committedThisHand = 0; }

    const deck = shuffled(this.rng);
    for (const p of players) p.hole = [deck.pop(), deck.pop()];
    const board = [];

    const n = players.length;
    const btnIdx = occ.indexOf(this.buttonSeat);
    // heads-up: button is small blind
    const sbIdx = n === 2 ? btnIdx : (btnIdx + 1) % n;
    const bbIdx = n === 2 ? (btnIdx + 1) % n : (btnIdx + 2) % n;

    const stakes = new Map(players.map((p) => [p.id, 0])); // this-street commitment
    const postBlind = (idx, amt) => {
      const p = players[idx];
      const put = Math.min(amt, p.stack);
      p.stack -= put;
      p.committedThisHand += put;
      stakes.set(p.id, stakes.get(p.id) + put);
      if (p.stack === 0) p.allIn = true;
    };
    postBlind(sbIdx, SMALL_BLIND);
    postBlind(bbIdx, BIG_BLIND);

    let pot = 0;
    const streetContrib = () => { let s = 0; for (const v of stakes.values()) s += v; return s; };

    const bettingRound = async (startIdx, currentBet, minRaise, street) => {
      for (const p of players) stakes.set(p.id, stakes.get(p.id) || 0);
      let lastRaiser = null;
      let idx = startIdx;
      let actedSinceRaise = 0;
      const contestants = () => players.filter((p) => !p.folded);
      let safety = 0;
      while (true) {
        safety++;
        if (safety > 1000) break;
        if (contestants().length <= 1) break;
        const p = players[idx];
        if (p.folded || p.allIn) {
          idx = (idx + 1) % n;
          if (lastRaiser === null && actedSinceRaise >= n) break;
          continue;
        }
        const toCall = currentBet - (stakes.get(p.id) || 0);
        const state = {
          street, board: [...board], pot: pot + streetContrib(), toCall,
          currentBet, minRaise, stack: p.stack, playersLeft: contestants().length,
        };
        let dec = (await decide(p, state)) || { action: 'fold' };
        if (toCall <= 0 && dec.action === 'fold') dec = { action: 'check' };

        if (dec.action === 'fold') {
          p.folded = true;
        } else if (dec.action === 'check') {
          if (toCall > 0) { p.folded = true; } // illegal check treated as fold for safety
        } else if (dec.action === 'call') {
          const amt = Math.min(toCall, p.stack);
          p.stack -= amt; p.committedThisHand += amt;
          stakes.set(p.id, stakes.get(p.id) + amt);
          if (p.stack === 0) p.allIn = true;
        } else if (dec.action === 'raise') {
          let raiseTo = Math.max(dec.amount || 0, currentBet + minRaise);
          raiseTo = Math.min(raiseTo, (stakes.get(p.id) || 0) + p.stack);
          const need = raiseTo - (stakes.get(p.id) || 0);
          const actualNeed = Math.min(need, p.stack);
          p.stack -= actualNeed; p.committedThisHand += actualNeed;
          stakes.set(p.id, stakes.get(p.id) + actualNeed);
          if (p.stack === 0) p.allIn = true;
          const newBet = stakes.get(p.id);
          if (newBet > currentBet) {
            minRaise = Math.max(minRaise, newBet - currentBet);
            currentBet = newBet;
            lastRaiser = p.id;
            actedSinceRaise = 0;
          }
        }
        actedSinceRaise++;
        idx = (idx + 1) % n;

        // termination: everyone acted and matched currentBet (or folded/all-in)
        const active = contestants();
        const allMatched = active.every((pl) => pl.allIn || (stakes.get(pl.id) || 0) === currentBet);
        if (allMatched && actedSinceRaise >= active.length) break;
      }
      // fold pot contributions into main pot
      let streetTotal = 0;
      for (const v of stakes.values()) streetTotal += v;
      pot += streetTotal;
      for (const p of players) stakes.set(p.id, 0);
      return currentBet;
    };

    // preflop: action starts left of BB
    const preflopStart = n === 2 ? sbIdx : (bbIdx + 1) % n;
    await onStreet?.('preflop', []);
    await bettingRound(preflopStart, BIG_BLIND, BIG_BLIND, 'preflop');

    const dealStreet = (count) => { for (let i = 0; i < count; i++) board.push(deck.pop()); };
    const postflopStart = n === 2 ? bbIdx : (sbIdx);

    const remaining = () => players.filter((pl) => !pl.folded);

    if (remaining().length > 1) { dealStreet(3); await onStreet?.('flop', [...board]); await bettingRound(postflopStart, 0, BIG_BLIND, 'flop'); }
    if (remaining().length > 1) { dealStreet(1); await onStreet?.('turn', [...board]); await bettingRound(postflopStart, 0, BIG_BLIND, 'turn'); }
    if (remaining().length > 1) { dealStreet(1); await onStreet?.('river', [...board]); await bettingRound(postflopStart, 0, BIG_BLIND, 'river'); }

    const result = this.resolveShowdown(players, board, pot, btnIdx);
    return { board, pot, players, result };
  }

  // Build side pots from committedThisHand and distribute to best eligible hand(s).
  resolveShowdown(players, board, totalPot, btnIdx) {
    const contenders = players.filter((p) => !p.folded);
    const payouts = new Map(players.map((p) => [p.id, 0]));

    if (contenders.length === 1) {
      payouts.set(contenders[0].id, totalPot);
      contenders[0].stack += totalPot;
      return { pots: [{ amount: totalPot, eligible: [contenders[0].id], winners: [contenders[0].id] }], payouts };
    }

    // Build side pots from distinct commitment levels among all players (folded included, they contribute chips but aren't eligible).
    const levels = [...new Set(players.map((p) => p.committedThisHand))].filter((v) => v > 0).sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;
    for (const level of levels) {
      const layerSize = level - prevLevel;
      let amount = 0;
      const eligible = [];
      for (const p of players) {
        if (p.committedThisHand >= level) amount += layerSize;
        else if (p.committedThisHand > prevLevel) amount += (p.committedThisHand - prevLevel);
        if (p.committedThisHand >= level && !p.folded) eligible.push(p.id);
      }
      if (amount > 0) pots.push({ amount, eligible });
      prevLevel = level;
    }

    const evalCache = new Map();
    const evalOf = (p) => {
      if (!evalCache.has(p.id)) evalCache.set(p.id, evaluateBest([...p.hole, ...board]));
      return evalCache.get(p.id);
    };

    const order = players.map((p) => p.id);
    const potResults = [];
    for (const pot of pots) {
      const eligPlayers = players.filter((p) => pot.eligible.includes(p.id));
      if (eligPlayers.length === 0) continue;
      let bestVal = -1;
      for (const p of eligPlayers) bestVal = Math.max(bestVal, evalOf(p).value);
      const winners = eligPlayers.filter((p) => evalOf(p).value === bestVal).map((p) => p.id);

      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;

      // deterministic odd-chip assignment: first eligible winner clockwise after the button
      const winnersOrdered = orderClockwiseFromButton(winners, order, btnIdx, players);
      for (const wid of winnersOrdered) {
        let amt = share;
        if (remainder > 0) { amt += 1; remainder--; }
        payouts.set(wid, payouts.get(wid) + amt);
        players.find((p) => p.id === wid).stack += amt;
      }
      potResults.push({ amount: pot.amount, eligible: pot.eligible, winners });
    }
    return { pots: potResults, payouts };
  }
}

function orderClockwiseFromButton(winnerIds, allIdsInSeatOrder, btnIdx, players) {
  // players array is indexed 0..n-1 in seat/clockwise order used during the hand;
  // "first after button" = players[(btnIdx+1)%n], then clockwise.
  const n = players.length;
  const seq = [];
  for (let k = 1; k <= n; k++) seq.push(players[(btnIdx + k) % n].id);
  return seq.filter((id) => winnerIds.includes(id));
}
