import { COST, RES, view } from './engine.mjs';

const bag = () => Object.fromEntries(RES.map(r => [r, 0]));
const total = b => Object.values(b).reduce((a, b) => a + b, 0);
const affordable = (hand, cost) => RES.every(r => hand[r] >= (cost[r] || 0));
const best = (items, score) => [...items].sort((a, b) => score(b) - score(a) || a - b)[0];

// Policy receives exactly the same private/public snapshot as a human player.
// It cannot inspect opponents' hands, dice, or the development deck order.
export function chooseBotAction(s) {
  const me = s.players.find(p => p.id === s.me), hand = me.resources;
  const active = s.players[s.active].id === s.me;
  const b = s.board;
  const production = bag();
  b.vertices.filter(v => v.owner === s.me).forEach(v => v.tiles.forEach(id => {
    const t = b.tiles[id]; if (RES.includes(t.resource)) production[t.resource] += (6 - Math.abs(7 - t.number)) * v.level;
  }));
  const vertexScore = id => b.vertices[id].tiles.reduce((n, tId) => {
    const t = b.tiles[tId]; return n + (t.number ? (6 - Math.abs(7 - t.number)) * (1 + 1 / (1 + production[t.resource])) : 0);
  }, 0) + (b.ports.some(p => p.vertices.includes(id)) ? 1.2 : 0);
  const openSite = id => {
    const v = b.vertices[id];
    return !v.owner && v.edges.every(eId => { const e = b.edges[eId]; return !b.vertices[e.a === id ? e.b : e.a].owner; });
  };
  // Prefer roads that bring a valuable unoccupied site within reach.
  const roadScore = id => {
    const edge = b.edges[id]; let score = -100;
    for (const start of [edge.a, edge.b]) {
      const seen = new Set(), queue = [[start, 0]];
      while (queue.length) {
        const [vId, distance] = queue.shift(); if (seen.has(vId) || distance > 3) continue; seen.add(vId);
        const v = b.vertices[vId];
        if (v.owner && v.owner !== s.me) continue;
        if (openSite(vId)) score = Math.max(score, vertexScore(vId) - distance * 4);
        for (const eId of v.edges) {
          const e = b.edges[eId]; if (eId === id || (e.owner && e.owner !== s.me)) continue;
          queue.push([e.a === vId ? e.b : e.a, distance + (e.owner === s.me ? 0 : 1)]);
        }
      }
    }
    return score;
  };
  const goals = () => {
    const targets = [];
    if (s.legal.settlements.length) targets.push({ type: 'settlement', id: best(s.legal.settlements, vertexScore), priority: 100 });
    if (s.legal.cities.length) targets.push({ type: 'city', id: best(s.legal.cities, vertexScore), priority: 90 });
    const road = best(s.legal.roads, roadScore);
    if (road !== undefined && roadScore(road) > -50) targets.push({ type: 'road', id: road, priority: 45 });
    if (s.deckCount) targets.push({ type: 'development', priority: 35 });
    return targets;
  };
  // Return excess resources first, keeping a useful mix for future construction.
  if (s.phase === 'discard' && s.discard[s.me]) {
    const discard = bag(), keep = { ...hand };
    for (let i = 0; i < s.discard[s.me]; i++) {
      const r = [...RES].sort((a, b) => (keep[b] - (b === 'ore' ? 1 : 0)) - (keep[a] - (a === 'ore' ? 1 : 0)))[0];
      discard[r]++; keep[r]--;
    }
    return { action: 'discard', payload: { resources: discard } };
  }
  if (!active) {
    if (s.phase === 'main' && !s.built) {
      const offer = s.offers.find(o => o.from !== s.me && (!o.to || o.to === s.me) && affordable(hand, o.want) && total(o.give) >= total(o.want) && RES.reduce((v, r) => v + o.give[r] / (1 + hand[r]) - o.want[r] / (1 + hand[r]), 0) > 0);
      if (offer) return { action: 'accept', payload: { id: offer.id } };
    }
    return null;
  }
  if (s.phase === 'setup-settlement') return { action: 'build', payload: { type: 'settlement', id: best(s.legal.settlements, vertexScore) } };
  if (s.phase === 'setup-road' || s.phase === 'free-roads') return { action: 'build', payload: { type: 'road', id: best(s.legal.roads, roadScore) } };
  if (s.phase === 'robber') {
    const id = best(s.legal.robber, id => {
      const t = b.tiles[id];
      return t.vertices.reduce((n, vId) => { const v = b.vertices[vId]; return n + (!v.owner ? 0 : v.owner === s.me ? -20 * v.level : (6 - Math.abs(7 - t.number)) * v.level + 2); }, 0);
    });
    return { action: 'robber', payload: { id } };
  }
  if (s.phase === 'steal') return { action: 'steal', payload: { player: [...s.victims].sort((a, b) => s.players.find(p => p.id === b).resourceCount - s.players.find(p => p.id === a).resourceCount)[0] } };
  if (!['roll', 'main'].includes(s.phase)) return null;
  if (s.phase === 'roll') return { action: 'roll', payload: {} };
  if (!s.playedCard) {
    const cards = me.cards.filter(c => c.type !== 'point' && c.bought < s.turn);
    for (const type of ['ward', 'plenty', 'monopoly', 'roads']) {
      const card = cards.find(c => c.type === type); if (!card) continue;
      if (type === 'ward' && (!s.raid || s.built)) continue;
      if (type === 'roads' && !s.legal.roads.length) continue;
      const payload = { id: card.id };
      if (type === 'monopoly') {
        // Enemy hand contents are deliberately unknown; choose from our deficits.
        payload.resource = [...RES].sort((a, b) => hand[a] - hand[b] || production[a] - production[b])[0];
      }
      if (type === 'plenty') {
        const chosen = bag(), target = goals()[0]?.type || 'city';
        for (let i = 0; i < Math.min(2, total(s.bank)); i++) {
          const choices = RES.filter(r => s.bank[r] > chosen[r]);
          const r = choices.sort((a, b) => ((COST[target][b] || 0) - hand[b] - chosen[b]) - ((COST[target][a] || 0) - hand[a] - chosen[a]))[0];
          chosen[r]++;
        }
        payload.resources = chosen;
      }
      return { action: 'play', payload };
    }
  }
  if (s.phase === 'roll') return { action: 'roll', payload: {} };
  if (s.raid && !s.built) {
    const strength = Object.values(s.raid.contributions).reduce((n, c) => n + c.armor, 0);
    const missing = s.players.length * 3 - strength;
    if (missing > 0) {
      const contribution = bag(); let added = 0;
      const choices = [...RES].sort((a, b) => (b === 'ore' && me.faction === 'dwarves' ? 100 : hand[b]) - (a === 'ore' && me.faction === 'dwarves' ? 100 : hand[a]));
      for (const r of choices) while (added < missing && contribution[r] < hand[r] - (me.lockedReward?.[r] || 0)) {
        contribution[r]++; added += r === 'ore' && me.faction === 'dwarves' ? 2 : 1;
      }
      const reward = RES.find(r => s.bank[r] > 0);
      if (added && (me.faction !== 'humans' || s.raid.contributions[s.me].rewarded || reward)) return { action: 'contribute', payload: { resources: contribution, reward } };
      if (me.faction === 'rock-elves' && !s.raid.delayed) return { action: 'delay', payload: {} };
    }
  }
  const targets = goals();
  const ready = targets.find(t => affordable(hand, COST[t.type]));
  if (ready) return ready.type === 'development' ? { action: 'buy', payload: {} } : { action: 'build', payload: { type: ready.type, id: ready.id } };
  // Plan the complete exchange before doing its first step, to avoid trade loops.
  if (!s.built) {
    const plans = targets.map(t => {
      const cost = COST[t.type], copy = { ...hand }, bank = { ...s.bank }, trades = [];
      for (const want of RES) while (copy[want] < (cost[want] || 0)) {
        const give = RES.filter(r => r !== want && copy[r] - (cost[r] || 0) >= s.rates[r]).sort((a, b) => copy[b] - copy[a])[0];
        if (!give || !bank[want]) return null;
        copy[give] -= s.rates[give]; copy[want]++; bank[want]--; trades.push({ give, want });
      }
      return { trades, priority: t.priority - trades.length * 8 };
    }).filter(Boolean).sort((a, b) => b.priority - a.priority);
    if (plans[0]?.trades.length) return { action: 'bank', payload: plans[0].trades[0] };
  }
  return { action: 'end', payload: {} };
}

export function nextBotMove(g) {
  if (['lobby', 'finished'].includes(g.phase)) return null;
  for (const p of g.players.filter(p => p.bot)) {
    const decision = chooseBotAction(view(g, p.id));
    if (decision) return { playerId: p.id, ...decision };
  }
  return null;
}
