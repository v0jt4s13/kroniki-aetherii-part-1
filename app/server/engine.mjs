import { randomInt, randomUUID } from 'node:crypto';

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const COST = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
const COLORS = ['#398147', '#c23c30', '#176cab', '#d69b24'];
const empty = () => Object.fromEntries(RES.map(r => [r, 0]));
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export function board() {
  const tiles = [], vertices = [], edges = [], lookup = new Map(), edgeLookup = new Map();
  for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
    const x = 270 + Math.sqrt(3) * 48 * (q + r / 2), y = 250 + 72 * r;
    const tile = { id: tiles.length, x, y, q, r, vertices: [] };
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 - 90) * Math.PI / 180, vx = x + 48 * Math.cos(a), vy = y + 48 * Math.sin(a);
      const key = `${vx.toFixed(2)},${vy.toFixed(2)}`;
      if (!lookup.has(key)) { lookup.set(key, vertices.length); vertices.push({ id: vertices.length, x: vx, y: vy, tiles: [], edges: [], owner: null, level: 0 }); }
      const id = lookup.get(key); tile.vertices.push(id); vertices[id].tiles.push(tile.id);
    }
    tiles.push(tile);
  }
  for (const t of tiles) for (let i = 0; i < 6; i++) {
    const pair = [t.vertices[i], t.vertices[(i + 1) % 6]].sort((a, b) => a - b), key = pair.join(',');
    if (!edgeLookup.has(key)) {
      const id = edges.length; edgeLookup.set(key, id); edges.push({ id, a: pair[0], b: pair[1], tiles: [], owner: null });
      pair.forEach(v => vertices[v].edges.push(id));
    }
    edges[edgeLookup.get(key)].tiles.push(t.id);
  }
  const terrain = shuffle([...Array(4).fill('wood'), ...Array(4).fill('sheep'), ...Array(4).fill('wheat'), ...Array(3).fill('brick'), ...Array(3).fill('ore'), 'desert']);
  tiles.forEach((t, i) => { t.resource = terrain[i]; });
  let valid = false;
  while (!valid) {
    const numbers = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    tiles.forEach(t => { t.number = t.resource === 'desert' ? 0 : numbers.pop(); });
    valid = !edges.some(e => e.tiles.length === 2 && e.tiles.every(id => [6, 8].includes(tiles[id].number)));
  }
  const coast = edges.filter(e => e.tiles.length === 1).sort((a, b) => {
    const angle = e => Math.atan2((vertices[e.a].y + vertices[e.b].y) / 2 - 250, (vertices[e.a].x + vertices[e.b].x) / 2 - 270);
    return angle(a) - angle(b);
  });
  const types = shuffle(['any', 'any', 'any', 'any', ...RES]);
  const ports = types.map((type, i) => { const e = coast[Math.floor(i * coast.length / 9)]; return { id: i, type, vertices: [e.a, e.b] }; });
  return { tiles, vertices, edges, ports };
}
export function player(name, index) {
  check(typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 24, 'Podaj imię (1–24 znaki).');
  return { id: randomUUID(), token: randomUUID(), name: name.trim(), color: COLORS[index], resources: empty(), cards: [], knights: 0 };
}
export function createRoom(code, name, practice = false) {
  const p = player(name, 0);
  return { code, host: p.id, players: [p], practice, board: board(), phase: 'lobby', active: 0, revision: 0, turn: 0, bank: Object.fromEntries(RES.map(r => [r, 19])), deck: shuffle([...Array(14).fill('knight'), ...Array(5).fill('point'), 'roads', 'roads', 'plenty', 'plenty', 'monopoly', 'monopoly']), log: [], dice: null, longest: null, army: null, robber: null, offers: [], discard: {}, freeRoads: 0, built: false, playedCard: false };
}
const log = (g, text) => { g.log.unshift({ text, turn: g.turn }); g.log = g.log.slice(0, 60); };
const owned = (g, p, level) => g.board.vertices.filter(v => v.owner === p.id && v.level === level).length;
export function points(g, p, hidden = true) {
  return owned(g, p, 1) + 2 * owned(g, p, 2) + (g.longest === p.id ? 2 : 0) + (g.army === p.id ? 2 : 0) + (hidden ? p.cards.filter(c => c.type === 'point').length : 0);
}
export function roadLength(g, id) {
  const { vertices, edges } = g.board;
  const walk = (v, used) => {
    if (used.size && vertices[v].owner && vertices[v].owner !== id) return used.size;
    let best = used.size;
    for (const eId of vertices[v].edges) if (edges[eId].owner === id && !used.has(eId)) {
      const e = edges[eId]; best = Math.max(best, walk(e.a === v ? e.b : e.a, new Set([...used, eId])));
    }
    return best;
  };
  return Math.max(0, ...vertices.map(v => walk(v.id, new Set())));
}
function awards(g) {
  for (const [key, min, value] of [['longest', 5, p => roadLength(g, p.id)], ['army', 3, p => p.knights]]) {
    const max = Math.max(...g.players.map(value));
    const leaders = g.players.filter(p => value(p) === max);
    if (max < min) g[key] = null;
    else if (!leaders.some(p => p.id === g[key])) g[key] = leaders.length === 1 ? leaders[0].id : null;
  }
  if (!g.phase.startsWith('setup') && g.phase !== 'lobby') {
    const p = g.players[g.active];
    if (points(g, p) >= 10) { g.phase = 'finished'; g.winner = p.id; log(g, `${p.name} wygrywa z ${points(g, p)} punktami!`); }
  }
}
export function canSettle(g, p, v, setup = false) {
  if (!v || v.owner || owned(g, p, 1) >= 5) return false;
  if (v.edges.some(id => { const e = g.board.edges[id]; return g.board.vertices[e.a === v.id ? e.b : e.a].owner; })) return false;
  return setup || v.edges.some(id => g.board.edges[id].owner === p.id);
}
export function canRoad(g, p, e, setup = false) {
  if (!e || e.owner || g.board.edges.filter(e => e.owner === p.id).length >= 15) return false;
  if (setup) return e.a === g.lastSettlement || e.b === g.lastSettlement;
  return [e.a, e.b].some(id => {
    const v = g.board.vertices[id];
    if (v.owner) return v.owner === p.id;
    return v.edges.some(eId => g.board.edges[eId].owner === p.id);
  });
}
const afford = (p, cost) => Object.entries(cost).every(([r, n]) => p.resources[r] >= n);
const pay = (g, p, cost) => { check(afford(p, cost), 'Brakuje surowców.'); for (const [r, n] of Object.entries(cost)) { p.resources[r] -= n; g.bank[r] += n; } };
function receive(g, p, r, n = 1) { check(g.bank[r] >= n, 'Brak tego surowca w banku.'); p.resources[r] += n; g.bank[r] -= n; }
export function rate(g, p, r) {
  const ports = g.board.ports.filter(port => port.vertices.some(id => g.board.vertices[id].owner === p.id));
  return ports.some(port => port.type === r) ? 2 : ports.some(port => port.type === 'any') ? 3 : 4;
}
function produce(g, total) {
  for (const r of RES) {
    const demand = new Map();
    for (const t of g.board.tiles) if (t.resource === r && t.number === total && t.id !== g.robber) {
      for (const id of t.vertices) { const v = g.board.vertices[id]; if (v.owner) demand.set(v.owner, (demand.get(v.owner) || 0) + v.level); }
    }
    const need = [...demand.values()].reduce((a, b) => a + b, 0);
    if (g.bank[r] < need && demand.size > 1) continue;
    for (const [id, n] of demand) receive(g, g.players.find(p => p.id === id), r, Math.min(n, g.bank[r]));
  }
}
function resourceBag(bag) {
  check(bag && typeof bag === 'object' && !Array.isArray(bag), 'Nieprawidłowy wybór surowców.');
  check(Object.keys(bag).every(r => RES.includes(r)) && Object.values(bag).every(n => Number.isInteger(n) && n >= 0 && n <= 19), 'Nieprawidłowa liczba surowców.');
  return { ...empty(), ...bag };
}
function resumeRobber(g) { g.phase = g.robberResume || 'main'; delete g.robberResume; }
export function act(g, playerId, action, payload = {}, rng = randomInt) {
  const p = g.players.find(p => p.id === playerId);
  check(p, 'Nie jesteś graczem tego pokoju.');
  check(g.phase !== 'finished', 'Gra już się zakończyła.');
  if (action === 'start') {
    check(g.phase === 'lobby' && g.host === p.id, 'Tylko gospodarz może rozpocząć grę.');
    check(g.players.length >= (g.practice ? 2 : 3), g.practice ? 'Potrzeba co najmniej 2 graczy.' : 'Kroniki Aetherii wymagają 3 lub 4 graczy.');
    const snake = [...g.players.keys(), ...[...g.players.keys()].reverse()];
    g.setupOrder = g.players.length === 2 ? [...snake, ...snake] : snake; g.setupIndex = 0; g.active = 0;
    g.phase = 'setup-settlement'; g.robber = g.board.tiles.find(t => t.resource === 'desert').id;
    log(g, 'Rozstawianie: wybierz pierwszą osadę i drogę.');
  } else if (action === 'discard') {
    check(g.phase === 'discard' && g.discard[p.id], 'Nie musisz odrzucać kart.');
    const bag = resourceBag(payload.resources);
    check(sum(bag) === g.discard[p.id] && afford(p, bag), `Wybierz dokładnie ${g.discard[p.id]} kart.`);
    pay(g, p, bag); delete g.discard[p.id]; log(g, `${p.name} odrzuca ${sum(bag)} kart.`);
    if (!Object.keys(g.discard).length) g.phase = 'robber';
  } else if (action === 'accept') {
    check(g.phase === 'main' && !g.built, 'Handel nie jest teraz dostępny.');
    const offer = g.offers.find(o => o.id === payload.id);
    check(offer && offer.from === g.players[g.active].id && offer.from !== p.id && (!offer.to || offer.to === p.id), 'Oferta nie jest dostępna.');
    const from = g.players.find(x => x.id === offer.from);
    check(afford(from, offer.give) && afford(p, offer.want), 'Oferta nie ma już pokrycia w surowcach.');
    for (const r of RES) { from.resources[r] += offer.want[r] - offer.give[r]; p.resources[r] += offer.give[r] - offer.want[r]; }
    g.offers = []; log(g, `${from.name} i ${p.name} wymieniają surowce.`);
  } else {
    check(g.players[g.active].id === p.id, 'Poczekaj na swoją turę.');
    if (action === 'build') {
      const type = payload.type;
      check(['road', 'settlement', 'city'].includes(type), 'Nieznany rodzaj budowli.');
      const setup = g.phase.startsWith('setup');
      if (setup) check((g.phase === 'setup-road' && type === 'road') || (g.phase === 'setup-settlement' && type === 'settlement'), 'Najpierw osada, potem droga.');
      else check(g.phase === 'main' || (g.phase === 'free-roads' && type === 'road'), 'Teraz nie można budować.');
      if (type === 'road') {
        const e = g.board.edges[payload.id]; check(canRoad(g, p, e, setup), 'Droga musi łączyć się z Twoją siecią.');
        if (!setup && g.phase !== 'free-roads') pay(g, p, COST.road); e.owner = p.id;
      } else {
        const v = g.board.vertices[payload.id];
        if (type === 'settlement') check(canSettle(g, p, v, setup), 'Wybierz wolne skrzyżowanie w odległości od innych osad.');
        else check(v && v.owner === p.id && v.level === 1 && owned(g, p, 2) < 4, 'Miasto zastępuje Twoją osadę (maks. 4 miasta).');
        if (!setup) pay(g, p, COST[type]); v.owner = p.id; v.level = type === 'city' ? 2 : 1;
        if (setup) {
          g.lastSettlement = v.id;
          if (g.setupIndex >= g.setupOrder.length - g.players.length) for (const id of v.tiles) { const r = g.board.tiles[id].resource; if (RES.includes(r)) receive(g, p, r); }
        }
      }
      log(g, `${p.name}: ${type === 'road' ? 'droga' : type === 'city' ? 'miasto' : 'osada'}.`);
      if (setup && type === 'settlement') g.phase = 'setup-road';
      else if (setup) {
        g.setupIndex++;
        if (g.setupIndex === g.setupOrder.length) { g.phase = 'roll'; g.active = 0; g.turn = 1; }
        else { g.active = g.setupOrder[g.setupIndex]; g.phase = 'setup-settlement'; }
      } else if (g.phase === 'free-roads') {
        g.freeRoads--;
        if (!g.freeRoads || !g.board.edges.some(e => canRoad(g, p, e))) { g.phase = g.roadsResume; delete g.roadsResume; g.freeRoads = 0; }
      } else { g.built = true; g.offers = []; }
    } else if (action === 'roll') {
      check(g.phase === 'roll', 'Kości zostały już rzucone.');
      g.dice = [rng(1, 7), rng(1, 7)];
      // Trzy z czterech siódemek są odrzucane i losowane od nowa, więc siódemek jest cztery razy mniej.
      if (sum(g.dice) === 7 && (g.sevens = (g.sevens || 0) + 1) % 4 !== 1) {
        while (sum(g.dice) === 7) g.dice = [rng(1, 7), rng(1, 7)];
      }
      const total = sum(g.dice);
      const before = g.players.map(x => ({ ...x.resources }));
      log(g, `${p.name} wyrzuca ${total} (${g.dice.join(' + ')}).`);
      g.phase = 'main';
      if (total === 7) {
        g.discard = Object.fromEntries(g.players.filter(x => sum(x.resources) > 7).map(x => [x.id, Math.floor(sum(x.resources) / 2)]));
        g.phase = Object.keys(g.discard).length ? 'discard' : 'robber'; g.robberResume = 'main';
      } else produce(g, total);
      g.lastRoll = { dice: [...g.dice], player: p.name, turn: g.turn, gains: Object.fromEntries(g.players.map((x, i) => [x.id, Object.fromEntries(RES.map(r => [r, x.resources[r] - before[i][r]]))])) };
    } else if (action === 'robber') {
      check(g.phase === 'robber', 'Złodziej nie jest teraz aktywny.');
      const tile = g.board.tiles[payload.id];
      check(tile && tile.id !== g.robber && tile.resource !== 'desert', 'Wybierz inny teren produkujący surowce.');
      g.robber = tile.id;
      g.victims = [...new Set(tile.vertices.map(id => g.board.vertices[id].owner))].filter(id => id && id !== p.id && sum(g.players.find(x => x.id === id).resources));
      log(g, `${p.name} przesuwa złodzieja.`);
      if (g.victims.length) g.phase = 'steal'; else resumeRobber(g);
    } else if (action === 'steal') {
      check(g.phase === 'steal' && g.victims.includes(payload.player), 'Wybierz gracza przy złodzieju.');
      const victim = g.players.find(x => x.id === payload.player);
      const cards = RES.flatMap(r => Array(victim.resources[r]).fill(r));
      if (cards.length) { const r = cards[randomInt(cards.length)]; victim.resources[r]--; p.resources[r]++; }
      log(g, `${p.name} zabiera losową kartę graczowi ${victim.name}.`); delete g.victims; resumeRobber(g);
    } else if (action === 'bank') {
      check(g.phase === 'main' && !g.built, 'Handluj przed rozpoczęciem budowy.');
      check(RES.includes(payload.give) && RES.includes(payload.want) && payload.give !== payload.want, 'Wybierz dwa różne surowce.');
      const n = rate(g, p, payload.give); check(g.bank[payload.want] > 0 && p.resources[payload.give] >= n, 'Brakuje surowców do wymiany.');
      pay(g, p, { [payload.give]: n }); receive(g, p, payload.want);
      g.offers = g.offers.filter(o => afford(g.players.find(x => x.id === o.from), o.give));
      log(g, `${p.name} handluje z bankiem ${n}:1.`);
    } else if (action === 'offer') {
      check(g.phase === 'main' && !g.built, 'Handluj przed rozpoczęciem budowy.');
      const give = resourceBag(payload.give), want = resourceBag(payload.want);
      check(sum(give) > 0 && sum(want) > 0 && afford(p, give) && RES.every(r => !give[r] || !want[r]), 'Oferta wymaga różnych surowców po obu stronach i pokrycia w kartach.');
      check(!payload.to || g.players.some(x => x.id === payload.to && x.id !== p.id), 'Nieznany odbiorca.');
      g.offers = [{ id: randomUUID(), from: p.id, to: payload.to || null, give, want }]; log(g, `${p.name} proponuje wymianę.`);
    } else if (action === 'cancel-offer') { g.offers = []; }
    else if (action === 'buy') {
      check(g.phase === 'main' && g.deck.length, 'Nie można kupić karty rozwoju.');
      pay(g, p, COST.development);
      const [type] = g.deck.splice(rng(g.deck.length), 1);
      p.cards.push({ id: randomUUID(), type, bought: g.turn });
      g.built = true; g.offers = []; log(g, `${p.name} kupuje kartę rozwoju.`);
    } else if (action === 'play') {
      check(['roll', 'main'].includes(g.phase) && !g.playedCard, 'Możesz zagrać jedną kartę w turze.');
      const card = p.cards.find(c => c.id === payload.id);
      check(card && card.type !== 'point' && card.bought < g.turn, 'Tej karty nie można teraz zagrać.');
      if (card.type === 'knight') { p.knights++; g.robberResume = g.phase; g.phase = 'robber'; }
      if (card.type === 'roads') {
        check(g.board.edges.some(e => canRoad(g, p, e)), 'Brak miejsca na nową drogę.');
        g.roadsResume = g.phase; g.freeRoads = 2; g.phase = 'free-roads';
      }
      if (card.type === 'plenty') {
        const bag = resourceBag(payload.resources); check(sum(bag) === Math.min(2, sum(g.bank)) && Object.entries(bag).every(([r, n]) => g.bank[r] >= n), 'Wybierz 2 dostępne surowce.');
        for (const [r, n] of Object.entries(bag)) receive(g, p, r, n);
      }
      if (card.type === 'monopoly') {
        check(RES.includes(payload.resource), 'Wybierz surowiec.');
        for (const other of g.players) if (other.id !== p.id) { p.resources[payload.resource] += other.resources[payload.resource]; other.resources[payload.resource] = 0; }
      }
      p.cards = p.cards.filter(c => c.id !== card.id); g.playedCard = true; log(g, `${p.name} zagrywa kartę rozwoju.`);
    } else if (action === 'end') {
      check(g.phase === 'main', 'Dokończ obowiązkową akcję przed końcem tury.');
      awards(g); if (g.phase === 'finished') return;
      g.active = (g.active + 1) % g.players.length; g.turn++; g.phase = 'roll'; g.built = false; g.playedCard = false; g.offers = []; g.dice = null;
      log(g, `Tura gracza ${g.players[g.active].name}.`);
    } else throw new Error('Nieznana akcja.');
  }
  awards(g);
}
export function view(g, playerId) {
  const p = g.players.find(x => x.id === playerId);
  check(p, 'Nieprawidłowa sesja.');
  const legal = { settlements: [], roads: [], cities: [], robber: [] };
  if (g.players[g.active].id === p.id) {
    if (['setup-settlement', 'main'].includes(g.phase)) legal.settlements = g.board.vertices.filter(v => canSettle(g, p, v, g.phase === 'setup-settlement')).map(v => v.id);
    if (['setup-road', 'main', 'free-roads'].includes(g.phase)) legal.roads = g.board.edges.filter(e => canRoad(g, p, e, g.phase === 'setup-road')).map(e => e.id);
    if (g.phase === 'main' && owned(g, p, 2) < 4) legal.cities = g.board.vertices.filter(v => v.owner === p.id && v.level === 1).map(v => v.id);
    if (g.phase === 'robber') legal.robber = g.board.tiles.filter(t => t.id !== g.robber && t.resource !== 'desert').map(t => t.id);
  }
  return { code: g.code, host: g.host, practice: g.practice, ai: Boolean(g.ai), maxPlayers: g.ai ? g.maxPlayers || 2 : 4, me: p.id, accountLinked: Boolean(p.accountId), lastRoll: g.lastRoll ? { dice: g.lastRoll.dice, player: g.lastRoll.player, turn: g.lastRoll.turn, resources: g.lastRoll.gains[p.id] } : null, phase: g.phase, active: g.active, revision: g.revision, turn: g.turn, bank: g.bank, board: g.board, dice: g.dice, robber: g.robber, longest: g.longest, army: g.army, winner: g.winner, built: g.built, playedCard: g.playedCard, freeRoads: g.freeRoads, discard: g.discard, victims: g.victims || [], offers: g.offers, deckCount: g.deck.length, log: g.log, legal,
    players: g.players.map(x => ({ id: x.id, name: x.name, bot: Boolean(x.bot), color: x.color, points: points(g, x, x.id === p.id || g.phase === 'finished'), resources: x.id === p.id ? x.resources : undefined, cards: x.id === p.id ? x.cards : undefined, resourceCount: sum(x.resources), cardCount: x.cards.length, knights: x.knights, roadLength: roadLength(g, x.id) })),
    rates: Object.fromEntries(RES.map(r => [r, rate(g, p, r)])) };
}
