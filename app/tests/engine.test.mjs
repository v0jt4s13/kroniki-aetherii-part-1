import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, player, act, view, canSettle, canRoad, roadLength, points, RES, rate } from '../server/engine.mjs';
const rollFour = () => { const dice = [1, 3]; return () => dice.shift(); };

function room(n = 3, practice = false) { const g = createRoom('TEST00', 'Ala', practice); for (let i = 1; i < n; i++) g.players.push(player(`Gracz ${i}`, i)); return g; }
function setup(g = room()) {
  act(g, g.host, 'start');
  while (g.phase.startsWith('setup')) {
    const p = g.players[g.active];
    const legal = view(g, p.id).legal;
    act(g, p.id, 'build', g.phase === 'setup-settlement' ? { type: 'settlement', id: legal.settlements[0] } : { type: 'road', id: legal.roads[0] });
  }
  return g;
}
function grant(g, p, bag) { for (const [r, n] of Object.entries(bag)) { g.bank[r] -= n; p.resources[r] += n; } }
function conserve(g) { for (const r of RES) assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 19, r); }
test('19 tiles, 54 intersections, 72 edges, correct terrain counts and nonadjacent 6/8', () => {
  for (let i = 0; i < 20; i++) {
    const g = room(), b = g.board;
    assert.equal(b.tiles.length, 19); assert.equal(b.vertices.length, 54); assert.equal(b.edges.length, 72);
    assert.equal(b.ports.length, 9); assert.equal(new Set(b.ports.flatMap(p => p.vertices)).size, 18);
    assert.deepEqual(RES.map(r => b.tiles.filter(t => t.resource === r).length), [4, 3, 4, 4, 3]);
    assert.ok(!b.edges.some(e => e.tiles.length === 2 && e.tiles.every(id => [6, 8].includes(b.tiles[id].number))));
  }
});
test('only host starts, 2–4 players in every mode', () => {
 const g = room(2); assert.throws(() => act(g, g.players[1].id, 'start')); act(g, g.host, 'start'); assert.equal(g.phase, 'setup-settlement');
});
test('snake setup order, two settlements and roads each, second settlement resources', () => {
  const g = room(4); act(g, g.host, 'start'); const order = [];
  while (g.phase.startsWith('setup')) {
    const p = g.players[g.active], legal = view(g, p.id).legal;
    if (g.phase === 'setup-settlement') { order.push(g.active); act(g, p.id, 'build', { type: 'settlement', id: legal.settlements[0] }); }
    else act(g, p.id, 'build', { type: 'road', id: legal.roads[0] });
  }
  assert.deepEqual(order, [0, 1, 2, 3, 3, 2, 1, 0]); assert.equal(g.phase, 'roll'); assert.equal(g.active, 0);
  for (const p of g.players) { assert.equal(points(g, p), 2); assert.equal(g.board.edges.filter(e => e.owner === p.id).length, 2); assert.ok(Object.values(p.resources).every(n => Number.isInteger(n) && n >= 0)); }
  conserve(g);
});
test('out of turn and duplicate dice rolls are rejected', () => {
  const g = setup(); assert.throws(() => act(g, g.players[1].id, 'roll'));
  act(g, g.host, 'roll', {}, rollFour()); assert.equal(g.phase, 'main'); assert.throws(() => act(g, g.host, 'roll')); conserve(g);
});
test('two players start with two watchtowers and roads each, resources only from second watchtower', () => {
  const g = room(2, true); act(g, g.host, 'start'); const order = [], final = {};
  while (g.phase.startsWith('setup')) {
    const p = g.players[g.active], legal = view(g, p.id).legal;
    if (g.phase === 'setup-settlement') {
      order.push(g.active); const id = legal.settlements[0];
      act(g, p.id, 'build', { type: 'settlement', id });
      if (g.setupIndex < 2) assert.equal(Object.values(p.resources).reduce((a, b) => a + b, 0), 0);
      else final[p.id] = id;
    } else act(g, p.id, 'build', { type: 'road', id: legal.roads[0] });
  }
  assert.deepEqual(order, [0, 1, 1, 0]);
  for (const p of g.players) {
    assert.equal(points(g, p), 2); assert.equal(g.board.edges.filter(e => e.owner === p.id).length, 2);
    const expected = Object.fromEntries(RES.map(r => [r, g.board.vertices[final[p.id]].tiles.filter(id => g.board.tiles[id].resource === r).length]));
    assert.deepEqual(p.resources, expected);
  }
  assert.equal(g.phase, 'roll'); conserve(g);
});
test('roll summary records actual personal gains, survives spending/end, and reports zero for seven', () => {
  const g = room(), p = g.players[0]; g.phase = 'roll'; g.turn = 1;
  g.board.tiles.forEach(t => { t.number = 3; });
  const t = g.board.tiles.find(t => t.resource !== 'desert'); t.number = 4;
  const v = g.board.vertices[t.vertices[0]]; v.owner = p.id; v.level = 2;
  act(g, p.id, 'roll', {}, rollFour());
  const result = structuredClone(view(g, p.id).lastRoll);
  assert.equal(result.resources[t.resource], 2);
  assert.equal(Object.values(result.resources).reduce((a, b) => a + b, 0), 2);
  assert.equal(view(g, g.players[1].id).lastRoll.resources[t.resource], 0);
  assert.equal(view(g, p.id).lastRoll.gains, undefined);
  act(g, p.id, 'end'); assert.deepEqual(view(g, p.id).lastRoll, result);
  g.active = 0;
  g.phase = 'roll'; const dice = [3, 4]; act(g, p.id, 'roll', {}, () => dice.shift());
  assert.deepEqual(view(g, p.id).lastRoll.dice, [3, 4]);
  assert.equal(Object.values(view(g, p.id).lastRoll.resources).reduce((a, b) => a + b, 0), 0); conserve(g);
});
test('roll summary respects bank shortages rather than reporting theoretical production', () => {
  const g = room(); g.phase = 'roll';
  g.board.tiles.forEach(t => { t.number = 3; });
  const t = g.board.tiles.find(t => t.resource !== 'desert'); t.number = 4;
  t.vertices.slice(0, 2).forEach((id, i) => { g.board.vertices[id].owner = g.players[i].id; g.board.vertices[id].level = 1; });
  grant(g, g.players[2], { [t.resource]: 18 });
  act(g, g.host, 'roll', {}, rollFour());
  for (const p of g.players) assert.equal(view(g, p.id).lastRoll.resources[t.resource], 0);
  conserve(g);
});
test('roll pays watchtowers 1 and citadels 2 without robber blocking', () => {
  const g = room(); g.phase = 'roll'; g.turn = 1;
  const t = g.board.tiles.find(t => t.resource !== 'desert'); t.number = 4; g.robber = -1;
  const v = g.board.vertices[t.vertices[0]]; v.owner = g.host; v.level = 2;
  const before = g.players[0].resources[t.resource]; act(g, g.host, 'roll', {}, rollFour());
  assert.ok(g.players[0].resources[t.resource] >= before + 2); conserve(g);
  g.phase = 'roll'; g.robber = t.id; const old = g.players[0].resources[t.resource];
  g.board.tiles.filter(x => x.id !== t.id).forEach(x => x.number = 3);
  act(g, g.host, 'roll', {}, rollFour()); assert.equal(g.players[0].resources[t.resource], old + 2);
});
test('distance rule and opponent settlements block road extensions', () => {
  const g = room(), p = g.players[0], v = g.board.vertices[0]; v.owner = p.id; v.level = 1;
  const e = g.board.edges[v.edges[0]], next = g.board.vertices[e.a === v.id ? e.b : e.a];
  assert.equal(canSettle(g, p, next, true), false); e.owner = p.id;
  next.owner = g.players[1].id; next.level = 1;
  const extension = g.board.edges[next.edges.find(id => id !== e.id)]; assert.equal(canRoad(g, p, extension), false);
});
test('city costs 3 ore + 2 wheat, returns settlement, doubles points', () => {
  const g = setup(), p = g.players[0]; g.phase = 'main'; grant(g, p, { ore: 3, wheat: 2 });
  const v = g.board.vertices.find(v => v.owner === p.id); const before = { ...p.resources };
  act(g, p.id, 'build', { type: 'city', id: v.id }); assert.equal(v.level, 2); assert.equal(points(g, p), 3);
  assert.equal(p.resources.ore, before.ore - 3); assert.equal(p.resources.wheat, before.wheat - 2); assert.equal(g.built, true); conserve(g);
});
test('7 requires player-chosen half discard, then mobilization without robber', () => {
  const g = setup(), p = g.players[0]; grant(g, p, { wood: 8 });
  const dice = [3, 4]; act(g, p.id, 'roll', {}, () => dice.shift()); assert.equal(g.phase, 'discard');
  for (const other of g.players) if (g.discard[other.id]) {
    const n = g.discard[other.id]; assert.throws(() => act(g, other.id, 'discard', { resources: { wood: 0 } }));
    const bag = {}; let left = n; for (const r of RES) { bag[r] = Math.min(left, other.resources[r]); left -= bag[r]; }
    act(g, other.id, 'discard', { resources: bag });
  }
  assert.equal(g.phase, 'main'); assert.equal(g.threat, 20); assert.equal(g.raid.dueTurn, g.turn + 2);
  assert.throws(() => act(g, p.id, 'robber', { id: 0 })); conserve(g);
});
test('ports give 3:1 and resource-specific 2:1; bank exchanges conserve supply', () => {
  const g = room(), p = g.players[0]; g.phase = 'main';
  assert.equal(rate(g, p, 'ore'), 4);
  const any = g.board.ports.find(port => port.type === 'any'); g.board.vertices[any.vertices[0]].owner = p.id;
  assert.equal(rate(g, p, 'ore'), 3);
  const ore = g.board.ports.find(port => port.type === 'ore'); g.board.vertices[ore.vertices[0]].owner = p.id;
  assert.equal(rate(g, p, 'ore'), 2); grant(g, p, { ore: 2 });
  act(g, p.id, 'bank', { give: 'ore', want: 'wood' }); assert.equal(p.resources.wood, 1); conserve(g);
  g.built = true; assert.throws(() => act(g, p.id, 'bank', { give: 'wood', want: 'ore' }));
});
test('player trades require consent and involve active player', () => {
  const g = room(), [a, b, c] = g.players; g.phase = 'main'; grant(g, a, { wood: 2 }); grant(g, b, { ore: 1 });
  assert.throws(() => act(g, b.id, 'offer', { give: { ore: 1 }, want: { wood: 2 } }));
  act(g, a.id, 'offer', { give: { wood: 2 }, want: { ore: 1 }, to: b.id });
  assert.throws(() => act(g, c.id, 'accept', { id: g.offers[0].id }));
  act(g, b.id, 'accept', { id: g.offers[0].id }); assert.equal(a.resources.ore, 1); assert.equal(b.resources.wood, 2); assert.equal(g.offers.length, 0); conserve(g);
});
test('magic purchase is secret, cannot play in same turn, one action card per turn', () => {
  const g = room(), p = g.players[0]; g.phase = 'main'; g.turn = 1; grant(g, p, { sheep: 1, wheat: 1, ore: 1 }); g.deck = ['plenty'];
  act(g, p.id, 'buy'); const c = p.cards[0]; assert.throws(() => act(g, p.id, 'play', { id: c.id, resources: { wood: 2 } }));
  assert.equal(view(g, g.players[1].id).players[0].cards, undefined);
  g.turn = 4; act(g, p.id, 'play', { id: c.id, resources: { wood: 2 } });
  p.cards.push({ id: 'another', type: 'plenty', bought: 1 }); assert.throws(() => act(g, p.id, 'play', { id: 'another', resources: { wood: 2 } })); conserve(g);
});
test('plenty and monopoly effects conserve resource cards', () => {
  const g = room(), p = g.players[0]; g.phase = 'main'; g.turn = 3;
  p.cards = [{ id: 'plenty', type: 'plenty', bought: 1 }]; act(g, p.id, 'play', { id: 'plenty', resources: { wood: 1, ore: 1 } });
  assert.equal(p.resources.wood, 1); assert.equal(p.resources.ore, 1); conserve(g);
  g.playedCard = false; p.cards.push({ id: 'mono', type: 'monopoly', bought: 1 }); grant(g, g.players[1], { wood: 3 }); grant(g, g.players[2], { wood: 2 });
  act(g, p.id, 'play', { id: 'mono', resource: 'wood' }); assert.equal(p.resources.wood, 6); assert.equal(g.players[1].resources.wood, 0); conserve(g);
});
test('magic roads are played after dice and return to construction', () => {
  const g = setup(), p = g.players[0]; g.turn = 4; p.cards = [{ id: 'roads', type: 'roads', bought: 1 }];
  const before = { ...p.resources }; assert.throws(() => act(g, p.id, 'play', { id: 'roads' })); g.phase = 'main'; act(g, p.id, 'play', { id: 'roads' }); assert.equal(g.phase, 'free-roads');
  for (let i = 0; i < 2; i++) act(g, p.id, 'build', { type: 'road', id: view(g, p.id).legal.roads[0] });
  assert.equal(g.phase, 'main'); assert.equal(g.built, true); assert.deepEqual(p.resources, before); conserve(g);
});
test('longest road does not sum forks and is interrupted by opponent buildings', () => {
  const g = room(), p = g.players[0], b = g.board;
  const tile = b.tiles[9];
  const ring = b.edges.filter(e => e.tiles.includes(tile.id)); ring.forEach(e => e.owner = p.id);
  assert.equal(roadLength(g, p.id), 6);
  b.vertices[tile.vertices[0]].owner = g.players[1].id; assert.equal(roadLength(g, p.id), 6);
  b.vertices[tile.vertices[3]].owner = g.players[1].id; assert.equal(roadLength(g, p.id), 3);
});
test('hidden victory points win only on owner turn and then all scores reveal', () => {
  const g = setup(), p = g.players[0]; g.phase = 'main'; p.cards = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, type: 'point', bought: 1 }));
  assert.equal(view(g, g.players[1].id).players[0].points, 2); assert.equal(view(g, p.id).players[0].points, 10);
  act(g, p.id, 'end'); assert.equal(g.phase, 'finished'); assert.equal(g.winner, p.id); assert.equal(view(g, g.players[1].id).players[0].points, 10);
});
test('negative, noninteger or unknown resources rejected', () => {
  const g = room(), p = g.players[0]; g.phase = 'main';
  for (const bag of [{ wood: -1 }, { wood: 0.5 }, { gold: 2 }, null]) assert.throws(() => act(g, p.id, 'offer', { give: bag, want: { ore: 1 } }));
});
test('dice request two independent unbiased values in 1–6, including natural repeats', () => {
  const g = room(); g.phase = 'roll'; const ranges = [];
  act(g, g.host, 'roll', {}, (min, max) => { ranges.push([min, max]); return 6; });
  assert.deepEqual(ranges, [[1, 7], [1, 7]]); assert.deepEqual(g.dice, [6, 6]);
});
test('development purchase draws a fresh random remaining index, without replacement and with correct counts', () => {
  const g = room(), p = g.players[0]; const original = [...g.deck].sort(); g.phase = 'main';
  while (g.deck.length) {
    grant(g, p, { ore: 1, wheat: 1, sheep: 1 });
    const n = g.deck.length, expected = g.deck[n - 1];
    act(g, p.id, 'buy', {}, max => { assert.equal(max, n); return max - 1; });
    assert.equal(p.cards.at(-1).type, expected);
  }
  assert.deepEqual(p.cards.map(c => c.type).sort(), original);
  assert.equal(p.cards.filter(c => c.type === 'ward').length, 14);
  assert.equal(p.cards.filter(c => c.type === 'point').length, 5);
  assert.throws(() => act(g, p.id, 'buy')); conserve(g);
});
