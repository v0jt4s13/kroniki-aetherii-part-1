import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, player, act, view, RES, points } from '../server/engine.mjs';
import { chooseBotAction, nextBotMove } from '../server/bot.mjs';

function game() {
  const g = createRoom('BOT123', 'Człowiek', true); g.ai = true;
  const bot = player('Komputer', 1); bot.bot = true; bot.token = null; g.players.push(bot);
  act(g, g.host, 'start'); return g;
}
function setup(g) {
  while (g.phase.startsWith('setup')) {
    const p = g.players[g.active], decision = chooseBotAction(view(g, p.id));
    act(g, p.id, decision.action, decision.payload);
  }
  return g;
}
function grant(g, p, resources) { for (const [r, n] of Object.entries(resources)) { p.resources[r] += n; g.bank[r] -= n; } }
const sum = b => Object.values(b).reduce((a, b) => a + b, 0);

test('AI waits for human actions and completes both setup placements', () => {
  const g = game(); assert.equal(nextBotMove(g), null);
  for (let i = 0; i < 2; i++) { const d = chooseBotAction(view(g, g.host)); act(g, g.host, d.action, d.payload); }
  let moves = 0;
  while (nextBotMove(g)) { const m = nextBotMove(g); act(g, m.playerId, m.action, m.payload); moves++; assert.ok(moves <= 4); }
  assert.equal(moves, 4); assert.equal(g.active, 0); assert.equal(g.phase, 'setup-settlement');
  assert.equal(points(g, g.players[1]), 2);
});
test('AI policy is pure and sees no opponent hand, cards or deck order', () => {
  const g = setup(game()), bot = g.players[1]; g.active = 1;
  const s = view(g, bot.id), before = structuredClone(s);
  assert.equal(s.players[0].resources, undefined); assert.equal(s.players[0].cards, undefined); assert.equal(s.deck, undefined);
  const decision = chooseBotAction(s); assert.equal(decision.action, 'roll'); assert.deepEqual(s, before);
});
test('AI discards the exact required amount outside its own turn', () => {
  const g = setup(game()), bot = g.players[1]; grant(g, bot, { wood: 8, ore: 2 });
  const dice = [3, 4]; act(g, g.host, 'roll', {}, () => dice.shift());
  const required = g.discard[bot.id], m = nextBotMove(g); assert.equal(m.action, 'discard');
  assert.equal(sum(m.payload.resources), required); assert.ok(RES.every(r => m.payload.resources[r] <= bot.resources[r]));
  act(g, m.playerId, m.action, m.payload); assert.equal(g.discard[bot.id], undefined);
});
test('AI accepts useful funded offers but declines a harmful exchange', () => {
  const g = game(), bot = g.players[1]; g.phase = 'main'; grant(g, g.players[0], { ore: 2 }); grant(g, bot, { wood: 4 });
  act(g, g.host, 'offer', { give: { ore: 1 }, want: { wood: 1 } });
  const m = nextBotMove(g); assert.equal(m.action, 'accept'); act(g, m.playerId, m.action, m.payload);
  assert.equal(bot.resources.ore, 1);
  act(g, g.host, 'offer', { give: { ore: 1 }, want: { wood: 3 } }); assert.equal(nextBotMove(g), null);
});
test('AI contributes defensive magic during an active raid', () => {
  const g = setup(game()), bot = g.players[1]; g.active = 1; g.turn = 4;
  bot.cards.push({ id: 'ward', type: 'ward', bought: 1 });
  const dice = [3, 4]; act(g, bot.id, 'roll', {}, () => dice.shift());
  // Empty hands prevent discard interrupting this focused scenario.
  for (const p of g.players) if (g.discard[p.id]) {
    let n = g.discard[p.id]; const resources = {}; for (const r of RES) { resources[r] = Math.min(n, p.resources[r]); n -= resources[r]; }
    act(g, p.id, 'discard', { resources });
  }
  const m = nextBotMove(g); assert.equal(m.action, 'play'); act(g, m.playerId, m.action, m.payload);
  assert.equal(g.raid.contributions[bot.id].armor, 2);
});
test('Bank exchange removes an unfunded offer before AI can accept it', () => {
  const g = game(); g.phase = 'main';
  grant(g, g.players[0], { wood: 4 }); grant(g, g.players[1], { ore: 3 });
  act(g, g.host, 'offer', { give: { wood: 2 }, want: { ore: 1 } });
  assert.equal(nextBotMove(g).action, 'accept');
  act(g, g.host, 'bank', { give: 'wood', want: 'brick' });
  assert.equal(g.offers.length, 0); assert.equal(nextBotMove(g), null);
});
test('AI completes full games using only legal moves while conserving resources', { timeout: 60000 }, () => {
  for (let round = 0; round < 3; round++) {
    const g = game(); let moves = 0;
    // Use the same policy for the test opponent, exercising an entire legal game.
    g.players[0].bot = true;
    while (g.phase !== 'finished' && moves < 6000) {
      const move = nextBotMove(g); assert.ok(move, `Stuck at ${g.phase}, turn ${g.turn}`);
      act(g, move.playerId, move.action, move.payload); moves++;
      for (const r of RES) {
        assert.ok(g.bank[r] >= 0);
        assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0) + Object.values(g.raid?.contributions || {}).reduce((n, c) => n + c.resources[r], 0), 19);
        assert.ok(g.players.every(p => p.resources[r] >= 0));
      }
    }
    assert.equal(g.phase, 'finished', `No winner after ${moves} moves / ${g.turn} turns`);
    assert.ok(g.cataclysm || points(g, g.players.find(p => p.id === g.winner)) >= 10);
    assert.equal(nextBotMove(g), null);
  }
});
