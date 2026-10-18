import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, player, act, view, points, RES } from '../server/engine.mjs';
const rollFour = () => { const dice = [1, 3]; return () => dice.shift(); };
const total = b => Object.values(b).reduce((n, v) => n + v, 0);
function game(n = 4) {
  const g = createRoom('RAID00', 'Krasnolud');
  for (let i = 1; i < n; i++) g.players.push(player(`Gracz ${i}`, i));
  act(g, g.host, 'start');
  while (g.phase.startsWith('setup')) {
    const p = g.players[g.active], legal = view(g, p.id).legal, road = g.phase === 'setup-road';
    act(g, p.id, 'build', { type: road ? 'road' : 'settlement', id: (road ? legal.roads : legal.settlements)[0] });
  }
  // Return starting cards to isolate bank accounting in the scenarios below.
  for (const p of g.players) for (const r of RES) { g.bank[r] += p.resources[r]; p.resources[r] = 0; }
  return g;
}
function grant(g, p, bag) { for (const [r, n] of Object.entries(bag)) { p.resources[r] += n; g.bank[r] -= n; } }
function seven(g) { g.sevens = 0; const dice = [3, 4]; act(g, g.players[g.active].id, 'roll', {}, () => dice.shift()); }
function end(g) { act(g, g.players[g.active].id, 'end', {}, () => 0); }
function next(g) { end(g); quietRoll(g); }
function quietRoll(g) { const numbers = g.board.tiles.map(t => t.number); g.board.tiles.forEach(t => { t.number = 4; }); const dice = [1, 2]; act(g, g.players[g.active].id, 'roll', {}, () => dice.shift()); g.board.tiles.forEach((t, i) => { t.number = numbers[i]; }); }
function conserve(g) {
  for (const r of RES) assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0) + Object.values(g.raid?.contributions || {}).reduce((n, c) => n + c.resources[r], 0), 19, r);
}

test('one barren hex has no token and lobby factions are unique, changeable only before start', () => {
  const g = createRoom('FRAC00', 'A'); g.players.push(player('B', 1));
  assert.equal(g.board.tiles.filter(t => t.resource === 'desert' && t.number === 0).length, 1);
  assert.ok(g.board.tiles.filter(t => t.resource !== 'desert').every(t => RES.includes(t.resource) && t.number >= 2 && t.number <= 12 && t.number !== 7));
  assert.throws(() => act(g, g.host, 'faction', { faction: 'rock-elves' }));
  act(g, g.host, 'faction', { faction: 'humans' }); assert.equal(g.players[0].faction, 'humans');
  act(g, g.host, 'start'); assert.throws(() => act(g, g.host, 'faction', { faction: 'dwarves' }));
});
test('first seven gives every player one mobilization; more sevens do not reset deadline', () => {
  const g = game(); seven(g); assert.equal(g.raid.dueTurn, 4); assert.equal(g.threat, 20);
  end(g); seven(g); assert.equal(g.threat, 40); assert.equal(g.raid.dueTurn, 4);
  assert.throws(() => act(g, g.players[0].id, 'contribute', { resources: { wood: 1 } }));
  next(g); assert.ok(g.raid); next(g); assert.equal(g.turn, 4); assert.ok(g.raid);
  end(g); assert.equal(g.raid, null); assert.equal(g.threat, 20); assert.equal(g.lastBattle.won, false); conserve(g);
});
test('dwarven mithril doubles armor and unique highest donor receives a hero point', () => {
  const g = game(), p = g.players[0]; grant(g, p, { ore: 6 }); seven(g);
  act(g, p.id, 'contribute', { resources: { ore: 6 } }); assert.equal(g.raid.contributions[p.id].armor, 12); assert.equal(p.resources.ore, 0); conserve(g);
  for (let i = 0; i < 3; i++) next(g);
  end(g); assert.equal(g.lastBattle.won, true); assert.equal(p.heroPoints, 1); assert.equal(points(g, p), 3); assert.equal(g.threat, 0); conserve(g);
});
test('equal highest contributions draw secret magic without hero points', () => {
  const g = game(2), [a, b] = g.players; grant(g, a, { ore: 2 }); grant(g, b, { wood: 4 }); seven(g);
  act(g, a.id, 'contribute', { resources: { ore: 2 } }); next(g);
  act(g, b.id, 'contribute', { resources: { wood: 4 } }); const size = g.deck.length; end(g);
  assert.equal(g.deck.length, size - 2); assert.ok(g.players.every(p => p.heroPoints === 0 && p.cards.length === 1));
  assert.equal(view(g, a.id).players[1].cards, undefined); conserve(g);
});
test('rock elf echo delays exactly one player turn and cannot be repeated', () => {
  const g = game(2); seven(g); next(g); const elf = g.players[1];
  act(g, elf.id, 'delay'); assert.equal(g.raid.dueTurn, 3);
  assert.throws(() => act(g, elf.id, 'delay')); end(g); assert.ok(g.raid);
  quietRoll(g); end(g); assert.equal(g.raid, null); conserve(g);
});
test('human first donation rewards once and locks bonus for this mobilization', () => {
  const g = game(), human = g.players[3]; seven(g); for (let i = 0; i < 3; i++) next(g);
  grant(g, human, { wood: 2 });
  act(g, human.id, 'contribute', { resources: { wood: 1 }, reward: 'ore' });
  assert.equal(human.resources.ore, 1); assert.equal(g.raid.contributions[human.id].rewarded, true);
  assert.throws(() => act(g, human.id, 'contribute', { resources: { ore: 1 }, reward: 'ore' }));
  act(g, human.id, 'contribute', { resources: { wood: 1 }, reward: 'ore' }); assert.equal(human.resources.ore, 1); conserve(g);
  end(g); assert.equal(human.lockedReward, undefined); conserve(g);
});
test('forest herbs protect a road on a losing tied contribution', () => {
  const g = game(), forest = g.players[2];
  grant(g, g.players[0], { wood: 1 }); seven(g); act(g, g.host, 'contribute', { resources: { wood: 1 } });
  next(g); grant(g, g.players[1], { wood: 1 }); act(g, g.players[1].id, 'contribute', { resources: { wood: 1 } });
  next(g); grant(g, forest, { sheep: 1 }); act(g, forest.id, 'contribute', { resources: { sheep: 1 } });
  next(g); grant(g, g.players[3], { wood: 1 }); act(g, g.players[3].id, 'contribute', { resources: { wood: 1 }, reward: 'ore' });
  end(g); assert.equal(g.lastBattle.won, false);
  assert.equal(g.board.edges.filter(e => e.owner === forest.id).length, 2);
  assert.ok(g.players.filter(p => p.id !== forest.id).every(p => g.board.edges.filter(e => e.owner === p.id).length === 1)); conserve(g);
});
test('losing with no roads loses half resources; production penalty lasts exactly a round', () => {
  const g = game(2), p = g.players[0]; seven(g); next(g);
  g.board.edges.filter(e => e.owner === p.id).forEach(e => e.owner = null); grant(g, p, { wood: 3, ore: 2 }); end(g);
  assert.equal(total(p.resources), 3); assert.equal(g.penaltyUntil, 4); assert.equal(g.threat, 20);
  g.board.tiles.forEach(t => { t.number = 3; });
  const t = g.board.tiles.find(t => t.vertices.some(id => g.board.vertices[id].owner === p.id)); t.number = 4;
  g.board.vertices.filter(v => v.owner).forEach(v => { v.owner = null; v.level = 0; });
  Object.assign(g.board.vertices[t.vertices[0]], { owner: p.id, level: 2 });
  act(g, p.id, 'roll', {}, rollFour()); assert.equal(total(view(g, p.id).lastRoll.resources), 1);
  end(g); act(g, g.players[1].id, 'roll', {}, rollFour()); assert.equal(total(view(g, p.id).lastRoll.resources), 1);
  end(g); act(g, p.id, 'roll', {}, rollFour()); assert.equal(total(view(g, p.id).lastRoll.resources), 2); conserve(g);
});
test('raid defers ten-point win until battle and next own turn', () => {
  const g = game(2), p = g.players[0]; seven(g);
  p.cards = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, type: 'point', bought: 0 }));
  assert.equal(points(g, p), 10); end(g); assert.notEqual(g.phase, 'finished');
  quietRoll(g); end(g);
  assert.equal(g.lastBattle.won, false); assert.equal(g.phase, 'finished'); assert.equal(g.winner, p.id); conserve(g);
});
test('second consecutive defeat at 100 percent causes cataclysm before ten-point victory', () => {
  const g = game(); seven(g); for (let i = 0; i < 3; i++) next(g); end(g);
  assert.equal(g.consecutiveDefeats, 1); assert.equal(g.threat, 20);
  for (let i = 0; i < 4; i++) { seven(g); if (i < 3) end(g); }
  const p = g.players[g.active]; p.cards = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, type: 'point', bought: 0 }));
  assert.equal(g.threat, 100); assert.equal(points(g, p), 10); end(g);
  assert.equal(g.phase, 'finished'); assert.equal(g.cataclysm, true); assert.equal(g.winner, null); conserve(g);
});
test('ward is a one-card defensive action; building closes mobilization and trade', () => {
  const g = game(2), p = g.players[0]; p.cards = [{ id: 'w', type: 'ward', bought: 0 }];
  assert.throws(() => act(g, p.id, 'play', { id: 'w' })); seven(g);
  act(g, p.id, 'play', { id: 'w' }); assert.equal(g.raid.contributions[p.id].armor, 2); assert.equal(g.built, false);
  grant(g, p, { wood: 2, brick: 1 }); act(g, p.id, 'build', { type: 'road', id: view(g, p.id).legal.roads[0] });
  assert.throws(() => act(g, p.id, 'contribute', { resources: { wood: 1 } }));
  assert.throws(() => act(g, p.id, 'bank', { give: 'wood', want: 'ore' })); conserve(g);
});

test('19/23/25 hex islands are connected, symmetric, balanced and have legal tokens and distinct ports', () => {
  for (const size of [19, 23, 25]) for (let attempt = 0; attempt < 8; attempt++) {
    const g = createRoom('SIZE00', 'Ala', false, { boardSize: size });
    const b = g.board; assert.equal(b.tiles.length, size);
    assert.equal(b.tiles.filter(t => t.resource === 'desert' && t.number === 0).length, 1);
    assert.ok(b.tiles.filter(t => t.resource !== 'desert').every(t => RES.includes(t.resource) && t.number >= 2 && t.number <= 12 && t.number !== 7));
    assert.ok(b.tiles.every(t => b.tiles.some(other => other.q === -t.q && other.r === -t.r)));
    const counts = RES.map(r => b.tiles.filter(t => t.resource === r).length); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.ok(!b.edges.some(e => e.tiles.length === 2 && e.tiles.every(id => [6, 8].includes(b.tiles[id].number))));
    const seen = new Set([0]);
    for (let previous = -1; previous !== seen.size;) { previous = seen.size; for (const e of b.edges) if (e.tiles.some(id => seen.has(id))) e.tiles.forEach(id => seen.add(id)); }
    assert.equal(seen.size, size); assert.equal(new Set(b.ports.flatMap(p => p.vertices)).size, 18);
    assert.ok(b.vertices.every(v => v.x >= 0 && v.x <= 540 && v.y >= 0 && v.y <= 500));
  }
  for (const size of [0, 20, '23', null]) assert.throws(() => createRoom('BAD000', 'Ala', false, { boardSize: size }));
});
test('host can configure size and reserved AI seats only before start and within human capacity', () => {
  const g = createRoom('CONF00', 'Ala'); g.players.push(player('Bartek', 1));
  assert.throws(() => act(g, g.players[1].id, 'configure', { boardSize: 25 }));
  const before = structuredClone(g.board); act(g, g.host, 'configure', { botCount: 2 }); assert.deepEqual(g.board, before);
  assert.throws(() => act(g, g.host, 'configure', { botCount: 3 }));
  act(g, g.host, 'configure', { boardSize: 23 }); assert.equal(g.board.tiles.length, 23);
  act(g, g.host, 'start'); assert.equal(g.players.length, 4); assert.equal(g.players.filter(p => p.bot).length, 2);
  assert.throws(() => act(g, g.host, 'configure', { boardSize: 19 }));
});
test('all mixed parties start with four unique factions, eight watchtowers and four-player raid timing', () => {
  for (const size of [19, 23, 25]) for (const bots of [1, 2, 3]) {
    const g = createRoom('PARTY0', 'Ala', false, { boardSize: size, botCount: bots });
    if (bots < 3) assert.throws(() => act(g, g.host, 'start'));
    for (let i = 1; i < 4 - bots; i++) {
      const p = player(`Człowiek ${i}`, i); p.faction = ['dwarves', 'rock-elves', 'forest-elves', 'humans'][i]; g.players.push(p);
    }
    act(g, g.host, 'start'); assert.equal(g.players.length, 4); assert.equal(g.players.filter(p => p.bot).length, bots);
    assert.equal(new Set(g.players.map(p => p.faction)).size, 4); assert.ok(g.players.filter(p => p.bot).every(p => p.token === null));
    while (g.phase.startsWith('setup')) {
      const p = g.players[g.active], legal = view(g, p.id).legal, road = g.phase === 'setup-road';
      act(g, p.id, 'build', { type: road ? 'road' : 'settlement', id: (road ? legal.roads : legal.settlements)[0] });
    }
    assert.equal(g.board.vertices.filter(v => v.owner).length, 8); assert.equal(g.board.edges.filter(e => e.owner).length, 8);
    seven(g); assert.equal(g.raid.dueTurn, g.turn + 3);
    const publicState = view(g, g.host); assert.equal(publicState.botCount, bots); assert.equal(publicState.humanLimit, 4 - bots); assert.equal(publicState.boardSize, size);
    assert.ok(publicState.players.filter(p => p.bot).every(p => p.resources === undefined && p.cards === undefined && !('token' in p)));
    conserve(g);
  }
});
test('roll log records actual gain totals for everyone, including shortage, penalty and seven zero gains', () => {
  const g = game(2), p = g.players[0]; g.board.tiles.forEach(t => { t.number = 3; });
  const tile = g.board.tiles.find(t => RES.includes(t.resource)); tile.number = 4;
  g.board.vertices.forEach(v => { v.owner = null; v.level = 0; });
  Object.assign(g.board.vertices[tile.vertices[0]], { owner: p.id, level: 2 });
  g.penaltyUntil = g.turn + 1;
  act(g, p.id, 'roll', {}, rollFour());
  assert.ok(g.log[0].text.includes(`${p.name}: +1 surowców`)); assert.ok(g.log[0].text.includes(`${g.players[1].name}: +0 surowców`));
  const saved = JSON.parse(JSON.stringify(g)); assert.deepEqual(view(saved, p.id).log, view(g, p.id).log);
  g.phase = 'roll'; g.penaltyUntil = 0; grant(g, g.players[1], { [tile.resource]: g.bank[tile.resource] - 1 });
  act(g, p.id, 'roll', {}, rollFour()); assert.ok(g.log[0].text.includes(`${p.name}: +0 surowców`));
  g.phase = 'roll'; seven(g); assert.ok(g.log[0].text.startsWith('Produkcja po rzucie 7:')); assert.ok(!g.log[0].text.includes('+1'));
});

test('barren hex has no token and adjacent watchtowers never receive resources from it', () => {
  const g = createRoom('EMPTY0', 'Ala'); g.players.push(player('Bartek', 1)); g.phase = 'roll'; g.turn = 1;
  const desert = g.board.tiles.find(t => t.resource === 'desert'); assert.equal(desert.number, 0);
  g.board.tiles.filter(t => t !== desert).forEach(t => { t.number = 3; });
  Object.assign(g.board.vertices[desert.vertices[0]], { owner: g.host, level: 2 });
  act(g, g.host, 'roll', {}, () => 1);
  assert.equal(total(g.players[0].resources), 0); assert.equal(total(view(g, g.host).lastRoll.resources), 0); conserve(g);
});
test('seven filter keeps every fourth seven and rerolls the others', () => {
  const g = game(); let kept = 0;
  for (let i = 0; i < 8; i++) {
    g.phase = 'roll'; g.bonusRoll = false;
    const dice = [3, 4, 1, 2]; act(g, g.players[g.active].id, 'roll', {}, () => dice.shift());
    if (g.dice[0] + g.dice[1] === 7) kept++;
    g.raid = null; g.threat = 0; g.phase = 'roll'; g.built = false; g.sevens = g.sevens;
  }
  assert.equal(kept, 2);
});
