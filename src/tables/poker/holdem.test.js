import assert from 'node:assert';
import { Table, Player, BUY_IN, SMALL_BLIND, BIG_BLIND } from './holdem.js';
import { makeCard } from './evaluator.js';
import { wallet } from '../../shared/wallet.js';

let pass = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  pass++;
  console.log('  ok - ' + msg);
}

// Simple deterministic RNG (mulberry32) so shuffles are reproducible.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('== Full hand, no all-ins: pot math + payout ==');
{
  const table = new Table(mulberry32(42));
  const p1 = new Player('p1', 'Alice');
  const p2 = new Player('p2', 'Bob');
  ok(table.seatPlayer(p1, 0), 'p1 sits down (wallet debited buy-in)');
  ok(table.seatPlayer(p2, 1), 'p2 sits down');
  ok(p1.stack === BUY_IN && p2.stack === BUY_IN, 'both start with buy-in stack');

  const stackBefore = p1.stack + p2.stack;
  // both always call/check - never raise or fold -> hand runs to showdown
  const decide = (player, state) => (state.toCall > 0 ? { action: 'call' } : { action: 'check' });
  const { pot, players, result } = await table.playHand(decide);

  const stackAfter = players.reduce((s, p) => s + p.stack, 0);
  const payoutSum = [...result.payouts.values()].reduce((a, b) => a + b, 0);
  ok(stackAfter === stackBefore, 'chip conservation: stacks sum unchanged across the hand');
  ok(payoutSum === pot, 'total payouts equal the pot');
  ok(result.pots.length >= 1, 'at least one pot resolved');
  console.log(`  pot=${pot} payoutSum=${payoutSum} winners=${JSON.stringify(result.pots.map((x) => x.winners))}`);
}

console.log('== 3-way all-in: side pots, correct eligibility, conservation ==');
{
  const table = new Table(mulberry32(1));
  const p1 = new Player('a1', 'Short');
  const p2 = new Player('a2', 'Mid');
  const p3 = new Player('a3', 'Big');
  table.seatPlayer(p1, 0); table.seatPlayer(p2, 1); table.seatPlayer(p3, 2);

  // Manually stage a post-hand state: 3 players committed different totals (simulating
  // a short all-in, and two others who committed more), then resolve showdown directly.
  const totalBefore = p1.stack + p2.stack + p3.stack; // 3000 (3x buy-in)
  p1.committedThisHand = 100; p1.stack -= 100; p1.folded = false;
  p2.committedThisHand = 300; p2.stack -= 300; p2.folded = false;
  p3.committedThisHand = 300; p3.stack -= 300; p3.folded = false;

  // Fixed board + hole cards: p3 gets the best hand (trip aces), p2 second (pair kings), p1 worst.
  const board = [makeCard(9, 0), makeCard(5, 1), makeCard(2, 2), makeCard(7, 3), makeCard(3, 0)];
  p1.hole = [makeCard(12, 2), makeCard(11, 3)];    // high card only (no pair, no straight)
  p2.hole = [makeCard(13, 0), makeCard(13, 1)];    // pair of kings
  p3.hole = [makeCard(14, 2), makeCard(14, 3)];    // pair of aces (best among these + board)

  const totalPot = 700; // 100+300+300
  const result = table.resolveShowdown([p1, p2, p3], board, totalPot, 2 /* btnIdx = p3's index */);

  const mainPot = result.pots.find((pp) => pp.eligible.length === 3);
  const sidePot = result.pots.find((pp) => pp.eligible.length === 2);
  ok(!!mainPot && mainPot.amount === 300, `main pot is 300 (100*3), eligible all 3: got ${mainPot && mainPot.amount}`);
  ok(!!sidePot && sidePot.amount === 400, `side pot is 400 (200*2), eligible only p2/p3: got ${sidePot && sidePot.amount}`);
  ok(sidePot.eligible.includes('a2') && sidePot.eligible.includes('a3') && !sidePot.eligible.includes('a1'), 'short-stacked p1 excluded from side pot');
  ok(mainPot.winners.includes('a3'), 'main pot won by best hand among all 3 (aces)');
  ok(sidePot.winners.includes('a3') && !sidePot.winners.includes('a2'), 'side pot won by aces over kings');

  const payoutSum = [...result.payouts.values()].reduce((s, v) => s + v, 0);
  ok(payoutSum === totalPot, 'side-pot payouts sum to total pot (700)');

  const totalAfter = p1.stack + p2.stack + p3.stack;
  ok(totalAfter === totalBefore, `chip conservation across 3-way all-in: before=${totalBefore} after=${totalAfter}`);
}

console.log('== Split pot with odd chip: deterministic assignment ==');
{
  const table = new Table(mulberry32(7));
  const p1 = new Player('s1', 'One');
  const p2 = new Player('s2', 'Two');
  const p3 = new Player('s3', 'Three');
  table.seatPlayer(p1, 0); table.seatPlayer(p2, 1); table.seatPlayer(p3, 2);

  const totalBefore = p1.stack + p2.stack + p3.stack;
  p1.committedThisHand = 101; p1.stack -= 101;
  p2.committedThisHand = 101; p2.stack -= 101;
  p3.committedThisHand = 1; p3.stack -= 1; p3.folded = true; // p3 folded but left 1 dead chip in -> odd total
  const totalPot = p1.committedThisHand + p2.committedThisHand + p3.committedThisHand; // 203, odd

  // Board alone is the nut broadway straight (A-K-Q-J-10, no flush possible); hole cards
  // are low unrelated cards that cannot improve it, so both players' best-5 == the board
  // and their hand values are exactly equal.
  const board = [makeCard(10, 0), makeCard(11, 1), makeCard(12, 2), makeCard(13, 3), makeCard(14, 0)];
  p1.hole = [makeCard(2, 1), makeCard(3, 2)];
  p2.hole = [makeCard(2, 3), makeCard(3, 0)];

  const btnIdx = 0; // button = p1 (seat index within [p1,p2] order passed to resolveShowdown)
  const result = table.resolveShowdown([p1, p2, p3], board, totalPot, btnIdx);
  ok(result.pots.every((pp) => pp.winners.length === 2), 'both p1 and p2 tie for every pot');
  const p1Payout = result.payouts.get('s1');
  const p2Payout = result.payouts.get('s2');
  ok(p1Payout + p2Payout === totalPot, 'split payouts sum to pot (201)');
  ok(Math.abs(p1Payout - p2Payout) === 1, 'one player gets exactly one extra chip');
  // First player clockwise after button (btnIdx=0 -> players[1] = p2) gets the odd chip.
  ok(p2Payout > p1Payout, 'odd chip deterministically goes to first player after the button (clockwise)');

  const totalAfter = p1.stack + p2.stack + p3.stack;
  ok(totalAfter === totalBefore, 'chip conservation on split pot with odd chip');
}

console.log('== Button rotation across multiple hands ==');
{
  wallet.set(100000); // ensure enough play money for 4 more buy-ins after earlier tests
  const table = new Table(mulberry32(99));
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = new Player('b' + i, 'P' + i);
    ok(table.seatPlayer(p, i), `seat ${i} occupied`);
    players.push(p);
  }
  const decide = (player, state) => (state.toCall > 0 ? { action: 'call' } : { action: 'check' });
  const buttons = [];
  for (let h = 0; h < 5; h++) {
    await table.playHand(decide);
    buttons.push(table.buttonSeat);
    // refill anyone busted so hands can keep going
    for (const p of players) if (p.stack < BIG_BLIND * 2) p.stack += 500;
  }
  console.log('  button sequence: ' + buttons.join(', '));
  const uniqueSteps = new Set(buttons);
  ok(uniqueSteps.size > 1, 'button moves across hands (not stuck on one seat)');
  // rotation should be a consistent +1 seat cyclic step each hand (since all 4 seats stay occupied)
  let rotates = true;
  for (let i = 1; i < buttons.length; i++) {
    const prev = buttons[i - 1];
    const cur = buttons[i];
    if ((prev + 1) % 4 !== cur) rotates = false;
  }
  ok(rotates, 'button rotates one seat clockwise each hand');
}

console.log(`\nALL PASS (${pass} assertions)`);
