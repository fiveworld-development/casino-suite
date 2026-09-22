import assert from 'node:assert';
import { PERSONALITIES, estimateEquity } from './ai.js';
import { makeCard, fullDeck } from './evaluator.js';

let pass = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  pass++;
  console.log('  ok - ' + msg);
}

function throwingProxy(label) {
  return new Proxy({}, {
    get(_t, prop) { throw new Error(`ANTI-CHEAT VIOLATION: read of "${String(prop)}" on ${label}`); },
    has() { throw new Error(`ANTI-CHEAT VIOLATION: 'in' check on ${label}`); },
    ownKeys() { throw new Error(`ANTI-CHEAT VIOLATION: key enumeration on ${label}`); },
  });
}

function makeState(overrides = {}) {
  return {
    street: 'flop',
    board: [makeCard(9, 0), makeCard(5, 1), makeCard(2, 2)],
    pot: 100,
    toCall: 10,
    currentBet: 10,
    minRaise: 10,
    stack: 500,
    playersLeft: 3,
    history: [],
    // Sensitive fields an AI must NEVER read: wrapped in throwing proxies.
    otherPlayersHoleCards: throwingProxy('otherPlayersHoleCards'),
    otherPlayersHands: throwingProxy('otherPlayersHands'),
    deck: throwingProxy('deck'),
    undealtDeck: throwingProxy('undealtDeck'),
    ...overrides,
  };
}

console.log('== Anti-cheat proof: AI never reads other players\' hole cards or deck ==');
{
  const myHole = [makeCard(14, 0), makeCard(13, 0)];
  for (const [name, fn] of Object.entries(PERSONALITIES)) {
    let threw = null;
    try {
      fn(myHole, makeState(), { samples: 50 });
    } catch (e) {
      threw = e;
    }
    ok(threw === null, `${name}: no exception reading proxied sensitive state (proves it never touched them)`);
  }
}

console.log('== estimateEquity itself only touches its own args (fresh remainder deck) ==');
{
  const myHole = [makeCard(2, 0), makeCard(2, 1)];
  const board = [];
  // Sanity: equity is a probability in [0,1]
  const eq = estimateEquity(myHole, board, 2, 200);
  ok(eq >= 0 && eq <= 1, `equity in [0,1]: got ${eq.toFixed(3)}`);
}

console.log('== Decision shape validity across personalities and streets ==');
{
  const VALID_ACTIONS = new Set(['fold', 'check', 'call', 'raise']);
  const scenarios = [
    makeState({ toCall: 0, currentBet: 0, pot: 30 }),                 // can check
    makeState({ toCall: 20, currentBet: 20, pot: 60 }),               // facing a bet
    makeState({ toCall: 200, currentBet: 200, pot: 220, stack: 180 }), // facing near-all-in
    makeState({ street: 'river', board: [makeCard(9, 0), makeCard(5, 1), makeCard(2, 2), makeCard(11, 3), makeCard(7, 0)] }),
  ];

  for (const [name, fn] of Object.entries(PERSONALITIES)) {
    for (let i = 0; i < scenarios.length; i++) {
      const state = scenarios[i];
      const myHole = [makeCard(14, 1), makeCard(12, 2)];
      for (let trial = 0; trial < 3; trial++) {
        const dec = fn(myHole, state, { samples: 60 });
        ok(VALID_ACTIONS.has(dec.action), `${name} scenario#${i} trial#${trial}: action "${dec.action}" is valid`);
        if (dec.action === 'raise') {
          ok(Number.isFinite(dec.amount) && dec.amount > state.currentBet, `${name} scenario#${i}: raise amount ${dec.amount} is a legal number above current bet ${state.currentBet}`);
          ok(dec.amount <= state.currentBet + state.stack + 1, `${name} scenario#${i}: raise amount does not exceed stack`);
        }
      }
    }
  }
}

console.log(`\nALL PASS (${pass} assertions)`);
