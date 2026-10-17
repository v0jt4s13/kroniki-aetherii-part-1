import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, player, act, view, RES } from '../server/engine.mjs';
import { chooseBotAction } from '../server/bot.mjs';
function game() {
  const g = createRoom('DOUBLE', 'Ala'); g.players.push(player('Bartek', 1)); g.phase = 'roll'; g.turn = 1;
  g.board.tiles.forEach(t => { t.number = 3; }); g.board.tiles.find(t => RES.includes(t.resource)).number = 4;
  Object.assign(g.board.vertices[g.board.tiles.find(t => RES.includes(t.resource)).vertices[0]], { owner: g.host, level: 2 }); return g;
}
function roll(g, a, b) { const dice = [a, b]; act(g, g.players[g.active].id, 'roll', {}, () => dice.shift()); }
function conserve(g) { for (const r of RES) assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 19); }

test('every double grants another roll, pays production once, and keeps the same turn until a non-double', () => {
  const g = game(), resource = g.board.tiles.find(t => RES.includes(t.resource)).resource;
  for (let i = 1; i <= 4; i++) {
    roll(g, 2, 2); assert.equal(g.phase, 'roll'); assert.equal(view(g, g.host).bonusRoll, true);
    assert.equal(g.players[0].resources[resource], 2 * i); assert.equal(g.active, 0); assert.equal(g.turn, 1); conserve(g);
  }
  roll(g, 1, 3); assert.equal(g.phase, 'main'); assert.equal(g.bonusRoll, false); assert.equal(g.players[0].resources[resource], 10);
  assert.equal(g.log.filter(e => e.text.startsWith('Produkcja po rzucie')).length, 5);
  assert.equal(g.log.filter(e => e.text.startsWith('Dublet!')).length, 4);
  assert.throws(() => roll(g, 1, 3)); act(g, g.host, 'end'); assert.equal(g.active, 1); assert.equal(g.turn, 2); conserve(g);
});
test('pending bonus roll prevents trading, construction, magic, mobilization and ending; other players cannot roll', () => {
  const g = game(); roll(g, 2, 2);
  for (const [action, payload] of [['end', {}], ['build', { type: 'road', id: 0 }], ['buy', {}], ['bank', { give: 'wood', want: 'ore' }], ['offer', { give: { wood: 1 }, want: { ore: 1 } }], ['play', { id: 'card' }], ['contribute', { resources: { wood: 1 } }], ['delay', {}]]) {
    const before = structuredClone(g); assert.throws(() => act(g, g.host, action, payload)); assert.deepEqual(g, before);
  }
  assert.throws(() => act(g, g.players[1].id, 'roll')); assert.equal(g.bonusRoll, true);
});
test('pending bonus roll survives serialization and AI keeps rolling until a non-double', () => {
  let g = game(); roll(g, 6, 6); g = JSON.parse(JSON.stringify(g));
  assert.equal(view(g, g.host).bonusRoll, true); assert.equal(chooseBotAction(view(g, g.host)).action, 'roll');
  roll(g, 5, 5); assert.equal(chooseBotAction(view(g, g.host)).action, 'roll');
  roll(g, 2, 3); assert.equal(g.phase, 'main'); assert.equal(view(g, g.host).bonusRoll, false);
  assert.notEqual(chooseBotAction(view(g, g.host)).action, 'roll');
});
test('a final seven ends the doubles chain and applies normal raid/discard rules with zero production', () => {
  const g = game(), p = g.players[0]; p.resources.wood = 8; g.bank.wood -= 8;
  roll(g, 2, 2); const count = Object.values(p.resources).reduce((a, b) => a + b, 0);
  roll(g, 3, 4); assert.equal(g.bonusRoll, false); assert.equal(g.phase, 'discard'); assert.equal(g.threat, 20); assert.equal(g.raid.dueTurn, 2);
  assert.equal(g.discard[p.id], Math.floor(count / 2)); assert.equal(Object.values(view(g, p.id).lastRoll.resources).reduce((a, b) => a + b, 0), 0);
  let remaining = g.discard[p.id]; const resources = {};
  for (const r of RES) { resources[r] = Math.min(remaining, p.resources[r]); remaining -= resources[r]; }
  act(g, p.id, 'discard', { resources }); assert.equal(g.phase, 'main'); assert.throws(() => roll(g, 2, 3)); conserve(g);
});
test('bonus rolls do not advance raid deadlines or penalty rounds; the penalty applies to every production', () => {
  const g = game(); roll(g, 3, 4); act(g, g.host, 'end'); const deadline = g.raid.dueTurn;
  g.penaltyUntil = 4;
  for (let i = 1; i <= 3; i++) {
    roll(g, 2, 2); assert.equal(g.turn, 2); assert.equal(g.raid.dueTurn, deadline); assert.equal(g.penaltyUntil, 4);
    assert.equal(Object.values(g.players[0].resources).reduce((a, b) => a + b, 0), i); assert.equal(g.lastBattle, null);
  }
  roll(g, 1, 3); assert.equal(g.phase, 'main'); assert.equal(g.lastBattle, null);
  act(g, g.players[1].id, 'end'); assert.ok(g.lastBattle); assert.equal(g.raid, null); conserve(g);
});
test('repeated production obeys bank shortages and keeps the final roll summary accurate', () => {
  const g = game(), r = g.board.tiles.find(t => RES.includes(t.resource)).resource; g.players[1].resources[r] = 17; g.bank[r] -= 17;
  roll(g, 2, 2); assert.equal(g.players[0].resources[r], 2); assert.equal(g.bank[r], 0);
  roll(g, 2, 2); assert.equal(g.players[0].resources[r], 2); assert.equal(view(g, g.host).lastRoll.resources[r], 0);
  assert.ok(g.log[0].text.includes('Ala: +0 surowców')); conserve(g);
});
