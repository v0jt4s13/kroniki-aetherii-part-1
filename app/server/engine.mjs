import { randomInt, randomUUID } from 'node:crypto';

export const FACTIONS = ['dwarves', 'rock-elves', 'forest-elves', 'humans'];
export const RULES_VERSION = 'aetherii-1';
export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const COST = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
const COLORS = ['#398147', '#c23c30', '#176cab', '#d69b24'];
const empty = () => Object.fromEntries(RES.map(r => [r, 0]));
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export const BOARD_SIZES = [19, 23, 25];
export function board(size = 19) {
  check(BOARD_SIZES.includes(size), 'Wybierz planszę 19, 23 lub 25 heksów.');
  const radius = size === 19 ? 48 : 38;
  const coordinates = [];
  for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) coordinates.push([q, r]);
  // Add opposite pairs along the coast, preserving a connected, balanced island.
  const extra = [[1, -3], [-1, 3], [3, -2], [-3, 2], [2, 1], [-2, -1]];
  coordinates.push(...extra.slice(0, size - 19));
  const tiles = [], vertices = [], edges = [], lookup = new Map(), edgeLookup = new Map();
  for (const [q, r] of coordinates) {
    const x = 270 + Math.sqrt(3) * radius * (q + r / 2), y = 250 + 1.5 * radius * r;
    const tile = { id: tiles.length, x, y, q, r, vertices: [] };
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 - 90) * Math.PI / 180, vx = x + radius * Math.cos(a), vy = y + radius * Math.sin(a);
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
  const terrain = shuffle([...Array(4).fill('wood'), ...Array(4).fill('sheep'), ...Array(4).fill('wheat'), ...Array(3).fill('brick'), ...Array(3).fill('ore'), 'desert', ...['ore', 'brick', 'wood', 'wheat', 'sheep', 'ore'].slice(0, size - 19)]);
  tiles.forEach((t, i) => { t.resource = terrain[i]; });
  const numbers = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, ...[6, 8, 9, 10, 4, 11].slice(0, size - 19)];
  const red = shuffle(numbers.filter(n => n === 6 || n === 8)), other = shuffle(numbers.filter(n => n !== 6 && n !== 8));
  const candidates = shuffle(tiles.filter(t => t.resource !== 'desert').map(t => t.id));
  const adjacent = (a, b) => edges.some(e => e.tiles.includes(a) && e.tiles.includes(b));
  const chooseRed = (start, chosen) => {
    if (chosen.length === red.length) return chosen;
    for (let i = start; i <= candidates.length - (red.length - chosen.length); i++) {
      if (chosen.some(id => adjacent(id, candidates[i]))) continue;
      const found = chooseRed(i + 1, [...chosen, candidates[i]]); if (found) return found;
    }
    return null;
  };
  const chosenRed = chooseRed(0, []);
  check(chosenRed, 'Nie udało się rozmieścić żetonów.');
  const redTiles = new Set(chosenRed);
  tiles.forEach(t => { t.number = t.resource === 'desert' ? 0 : redTiles.has(t.id) ? red.pop() : other.pop(); });
  const coast = edges.filter(e => e.tiles.length === 1).sort((a, b) => {
    const angle = e => Math.atan2((vertices[e.a].y + vertices[e.b].y) / 2 - 250, (vertices[e.a].x + vertices[e.b].x) / 2 - 270);
    return angle(a) - angle(b);
  });
  const types = shuffle(['any', 'any', 'any', 'any', ...RES]);
  const ports = types.map((type, i) => { const e = coast[Math.floor(i * coast.length / 9)]; return { id: i, type, vertices: [e.a, e.b] }; });
  return { tiles, vertices, edges, ports, hexRadius: radius };
}
export function player(name, index) {
  check(typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 24, 'Podaj imię (1–24 znaki).');
  return { id: randomUUID(), token: randomUUID(), name: name.trim(), color: COLORS[index], resources: empty(), cards: [], knights: 0, faction: FACTIONS[index], heroPoints: 0 };
}
export function createRoom(code, name, practice = false, options = {}) {
  const { boardSize = 19, botCount = 0 } = options;
  check(Number.isInteger(botCount) && botCount >= 0 && botCount <= 3, 'Wybierz od 0 do 3 graczy SI.');
  const p = player(name, 0);
  return { rulesVersion: RULES_VERSION, threat: 0, raid: null, consecutiveDefeats: 0, penaltyUntil: 0, lastBattle: null, code, host: p.id, players: [p], practice, botCount, board: board(boardSize), phase: 'lobby', active: 0, revision: 0, turn: 0, bank: Object.fromEntries(RES.map(r => [r, 19])), deck: shuffle([...Array(14).fill('ward'), ...Array(5).fill('point'), 'roads', 'roads', 'plenty', 'plenty', 'monopoly', 'monopoly']), log: [], dice: null, bonusRoll: false, longest: null, army: null, robber: null, offers: [], discard: {}, freeRoads: 0, built: false, playedCard: false };
}
const log = (g, text) => { g.log.unshift({ text, turn: g.turn }); g.log = g.log.slice(0, 60); };
const owned = (g, p, level) => g.board.vertices.filter(v => v.owner === p.id && v.level === level).length;
export function points(g, p, hidden = true) {
  return owned(g, p, 1) + 2 * owned(g, p, 2) + (p.heroPoints || 0) + (hidden ? p.cards.filter(c => c.type === 'point').length : 0);
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
  if (!g.raid && !g.phase.startsWith('setup') && !['lobby', 'finished'].includes(g.phase)) {
    const p = g.players[g.active];
    if (points(g, p) >= 10) { g.phase = 'finished'; g.winner = p.id; log(g, `${p.name} wygrywa z ${points(g, p)} PZ!`); }
  }
}
function drawMagic(g, p, rng) {
  if (!g.deck.length) return;
  const [type] = g.deck.splice(rng(g.deck.length), 1);
  p.cards.push({ id: randomUUID(), type, bought: g.turn });
}
export function armor(g, p) { return g.raid?.contributions[p.id]?.armor || 0; }
function resolveBattle(g, rng) {
  const raid = g.raid, required = g.players.length * 3;
  const strength = g.players.reduce((n, p) => n + armor(g, p), 0);
  const won = strength >= required;
  const contributions = structuredClone(raid.contributions);
  g.lastBattle = { won, strength, required, turn: g.turn, contributions, heroes: [], punished: [] };
  if (won) {
    const highest = Math.max(...g.players.map(p => armor(g, p)));
    const leaders = g.players.filter(p => armor(g, p) === highest);
    g.lastBattle.heroes = leaders.map(p => p.id);
    if (leaders.length === 1) { leaders[0].heroPoints++; log(g, `${leaders[0].name}: Bohater Aetherii, +1 PZ.`); }
    else { leaders.forEach(p => drawMagic(g, p, rng)); log(g, 'Remis bohaterów: po jednej Karcie Magii, bez PZ (do wyczerpania talii).'); }
    g.threat = 0; g.consecutiveDefeats = 0;
    log(g, `Najazd odparty! Pancerz ${strength}/${required}.`);
  } else {
    g.consecutiveDefeats++;
    if (g.threat >= 100 && g.consecutiveDefeats >= 2) {
      for (const c of Object.values(contributions)) for (const r of RES) g.bank[r] += c.resources[r];
      g.phase = 'finished'; g.winner = null; g.cataclysm = true; g.raid = null;
      log(g, 'Kataklizm! Aetheria upada. Wszyscy gracze przegrywają.'); return;
    }
    const lowest = Math.min(...g.players.map(p => armor(g, p)));
    for (const p of g.players.filter(p => armor(g, p) === lowest)) {
      const protectedRoad = p.faction === 'forest-elves' && raid.contributions[p.id].resources.sheep > 0;
      const roads = g.board.edges.filter(e => e.owner === p.id).sort((a, b) => b.id - a.id);
      if (protectedRoad && roads.length) { log(g, `${p.name}: Eteryczne Zioła chronią Trakt Handlowy.`); continue; }
      g.lastBattle.punished.push(p.id);
      if (roads.length) { roads[0].owner = null; log(g, `${p.name} traci Trakt Handlowy za najmniejszy wkład.`); }
      else {
        let remaining = Math.floor(sum(p.resources) / 2);
        for (const r of RES) { const n = Math.min(remaining, p.resources[r]); pay(g, p, { [r]: n }); remaining -= n; }
        log(g, `${p.name} traci połowę surowców (brak Traktów).`);
      }
    }
    g.penaltyUntil = g.turn + g.players.length; g.threat = 20;
    log(g, `Najazd zwycięża: ${strength}/${required}. Przez rundę produkcja każdego gracza spada o 1.`);
  }
  // Contributions leave circulation only until the battle, then return to the bank.
  for (const c of Object.values(contributions)) for (const r of RES) g.bank[r] += c.resources[r];
  g.raid = null;
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
  const gains = Object.fromEntries(g.players.map(p => [p.id, empty()]));
  for (const r of RES) {
    for (const t of g.board.tiles) if (t.resource === r && t.number === total) {
      for (const id of t.vertices) { const v = g.board.vertices[id]; if (v.owner) gains[v.owner][r] += v.level; }
    }
    const demand = g.players.reduce((n, p) => n + gains[p.id][r], 0);
    if (g.bank[r] < demand) for (const p of g.players) gains[p.id][r] = 0;
  }
  for (const p of g.players) {
    if (g.penaltyUntil > 0 && g.turn <= g.penaltyUntil) {
      const r = RES.find(r => gains[p.id][r] > 0); if (r) gains[p.id][r]--;
    }
    for (const r of RES) receive(g, p, r, gains[p.id][r]);
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
  if (action === 'configure') {
    check(g.phase === 'lobby' && g.host === p.id, 'Tylko gospodarz może ustawić grę przed startem.');
    const size = payload.boardSize ?? g.board.tiles.length, bots = payload.botCount ?? g.botCount ?? 0;
    check(BOARD_SIZES.includes(size), 'Wybierz planszę 19, 23 lub 25 heksów.');
    check(Number.isInteger(bots) && bots >= 0 && bots <= 3 && !g.ai, 'Wybierz od 0 do 3 graczy SI.');
    check(g.players.filter(x => !x.bot).length <= 4 - bots, 'Za dużo osób w pokoju dla takiej liczby SI.');
    if (size !== g.board.tiles.length) g.board = board(size);
    g.botCount = bots;
  } else if (action === 'faction') {
    check(g.phase === 'lobby' && FACTIONS.includes(payload.faction), 'Frakcję wybierasz przed rozpoczęciem gry.');
    check(!g.players.some(x => x.id !== p.id && x.faction === payload.faction), 'Ta frakcja jest już zajęta.');
    p.faction = payload.faction;
  } else if (action === 'start') {
    check(g.phase === 'lobby' && g.host === p.id, 'Tylko gospodarz może rozpocząć grę.');
    if (g.botCount) {
      check(g.players.filter(x => !x.bot).length === 4 - g.botCount, `Poczekaj na ${4 - g.botCount} graczy ludzkich.`);
      check(!g.players.some(x => x.bot), 'Gracze SI są już w pokoju.');
      for (let i = 0; i < g.botCount; i++) {
        const bot = player(g.botCount === 1 ? 'Komputer' : `Komputer ${i + 1}`, g.players.length);
        bot.faction = FACTIONS.find(f => !g.players.some(x => x.faction === f));
        bot.bot = true; bot.token = null; g.players.push(bot);
      }
    }
    check(g.players.length >= 2 && g.players.length <= 4, 'Kroniki Aetherii wymagają 2–4 graczy.');
    check(new Set(g.players.map(p => p.faction)).size === g.players.length && g.players.every(p => FACTIONS.includes(p.faction)), 'Każdy gracz musi mieć inną frakcję.');
    if (!g.board.tiles.some(t => t.resource === 'desert')) g.board = board(g.board.tiles.length);
    const snake = [...g.players.keys(), ...[...g.players.keys()].reverse()];
    g.setupOrder = snake; g.setupIndex = 0; g.active = 0;
    g.phase = 'setup-settlement'; g.robber = null;
    log(g, 'Rozstawianie: wybierz pierwszą Strażnicę i Trakt.');
  } else if (action === 'discard') {
    check(g.phase === 'discard' && g.discard[p.id], 'Nie musisz odrzucać kart.');
    const bag = resourceBag(payload.resources);
    check(sum(bag) === g.discard[p.id] && afford(p, bag), `Wybierz dokładnie ${g.discard[p.id]} kart.`);
    pay(g, p, bag); delete g.discard[p.id]; log(g, `${p.name} odrzuca ${sum(bag)} kart.`);
    if (!Object.keys(g.discard).length) g.phase = 'main';
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
      if (setup) check((g.phase === 'setup-road' && type === 'road') || (g.phase === 'setup-settlement' && type === 'settlement'), 'Najpierw Strażnica, potem Trakt.');
      else check(g.phase === 'main' || (g.phase === 'free-roads' && type === 'road'), 'Teraz nie można budować.');
      if (type === 'road') {
        const e = g.board.edges[payload.id]; check(canRoad(g, p, e, setup), 'Trakt musi łączyć się z Twoją siecią.');
        if (!setup && g.phase !== 'free-roads') pay(g, p, COST.road); e.owner = p.id;
      } else {
        const v = g.board.vertices[payload.id];
        if (type === 'settlement') check(canSettle(g, p, v, setup), 'Wybierz wolne skrzyżowanie w odległości od innych Strażnic.');
        else check(v && v.owner === p.id && v.level === 1 && owned(g, p, 2) < 4, 'Cytadela zastępuje Twoją Strażnicę (maks. 4 Cytadele).');
        if (!setup) pay(g, p, COST[type]); v.owner = p.id; v.level = type === 'city' ? 2 : 1;
        if (setup) {
          g.lastSettlement = v.id;
          if (g.setupIndex >= g.setupOrder.length - g.players.length) for (const id of v.tiles) { const r = g.board.tiles[id].resource; if (RES.includes(r)) receive(g, p, r); }
        }
      }
      log(g, `${p.name}: ${type === 'road' ? 'Trakt Handlowy' : type === 'city' ? 'Cytadela' : 'Strażnica'}.`);
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
      g.dice = [rng(1, 7), rng(1, 7)]; const total = sum(g.dice);
      const before = g.players.map(x => ({ ...x.resources }));
      log(g, `${p.name} wyrzuca ${total} (${g.dice.join(' + ')}).`);
      g.bonusRoll = g.dice[0] === g.dice[1];
      g.phase = g.bonusRoll ? 'roll' : 'main';
      if (g.bonusRoll) log(g, 'Dublet! Rzuć ponownie przed handlem i budową.');
      if (total === 7) {
        g.discard = Object.fromEntries(g.players.filter(x => sum(x.resources) > 7).map(x => [x.id, Math.floor(sum(x.resources) / 2)]));
        g.phase = Object.keys(g.discard).length ? 'discard' : 'main';
        g.threat = Math.min(100, g.threat + 20);
        if (!g.raid) g.raid = { started: g.turn, dueTurn: g.turn + g.players.length - 1, delayed: false, contributions: Object.fromEntries(g.players.map(x => [x.id, { resources: empty(), armor: 0, rewarded: false }])) };
        log(g, `Najazd! Zagrożenie ${g.threat}%. Bitwa na koniec tury ${g.raid.dueTurn}.`);
      } else produce(g, total);
      g.lastRoll = { dice: [...g.dice], player: p.name, turn: g.turn, gains: Object.fromEntries(g.players.map((x, i) => [x.id, Object.fromEntries(RES.map(r => [r, x.resources[r] - before[i][r]]))])) };
      log(g, `Produkcja po rzucie ${total}: ${g.players.map(x => `${x.name}: +${sum(g.lastRoll.gains[x.id])} surowców`).join('; ')}.`);
    } else if (action === 'contribute') {
      check(g.phase === 'main' && !g.built && g.raid, 'Mobilizacja jest dostępna podczas najazdu, przed budową.');
      const bag = resourceBag(payload.resources), contribution = g.raid.contributions[p.id];
      check(sum(bag) > 0 && afford(p, bag), 'Wybierz surowce ze swojej ręki.');
      check(RES.every(r => bag[r] <= p.resources[r] - (p.lockedReward?.[r] || 0)), 'Darmowy surowiec ludzi nie może być wpłacony w tej samej fazie.');
      const firstHuman = p.faction === 'humans' && !contribution.rewarded;
      if (firstHuman) check(RES.includes(payload.reward) && g.bank[payload.reward] > 0, 'Wybierz dostępny darmowy surowiec.');
      for (const r of RES) {
        p.resources[r] -= bag[r]; contribution.resources[r] += bag[r];
        contribution.armor += bag[r] * (p.faction === 'dwarves' && r === 'ore' ? 2 : 1);
      }
      // Donated cards stay in the public pool, separate from the bank, until resolution.
      if (firstHuman) {
        receive(g, p, payload.reward); p.lockedReward = { [payload.reward]: 1 }; contribution.rewarded = true;
      }
      g.offers = g.offers.filter(o => afford(g.players.find(x => x.id === o.from), o.give));
      log(g, `${p.name} mobilizuje obronę: +${sum(bag) + (p.faction === 'dwarves' ? bag.ore : 0)} Pancerza.`);
    } else if (action === 'delay') {
      check(g.phase === 'main' && !g.built && g.raid && !g.raid.delayed && p.faction === 'rock-elves', 'Kamienne Echo można użyć raz na najazd, w mobilizacji Elfów Skalnych.');
      g.raid.dueTurn++; g.raid.delayed = true; log(g, `${p.name}: Kamienne Echo opóźnia bitwę o jedną turę.`);
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
      check(g.phase === 'main' && g.deck.length, 'Nie można kupić Karty Magii.');
      pay(g, p, COST.development);
      const [type] = g.deck.splice(rng(g.deck.length), 1);
      p.cards.push({ id: randomUUID(), type, bought: g.turn });
      g.built = true; g.offers = []; log(g, `${p.name} kupuje Kartę Magii.`);
    } else if (action === 'play') {
      check(g.phase === 'main' && !g.playedCard, 'Możesz zagrać jedną kartę w turze.');
      const card = p.cards.find(c => c.id === payload.id);
      check(card && card.type !== 'point' && card.bought < g.turn, 'Tej karty nie można teraz zagrać.');
      if (card.type === 'ward') {
        check(g.phase === 'main' && !g.built && g.raid, 'Runiczna Tarcza wymaga aktywnego najazdu i fazy mobilizacji.');
        g.raid.contributions[p.id].armor += 2;
      }
      if (card.type === 'roads') {
        check(g.board.edges.some(e => canRoad(g, p, e)), 'Brak miejsca na nowy Trakt.');
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
      if (card.type !== 'ward') { g.built = true; g.offers = []; }
      p.cards = p.cards.filter(c => c.id !== card.id); g.playedCard = true; log(g, `${p.name} zagrywa Kartę Magii.`);
    } else if (action === 'end') {
      check(g.phase === 'main', 'Dokończ obowiązkową akcję przed końcem tury.');
      if (g.raid && g.turn >= g.raid.dueTurn) resolveBattle(g, rng);
      awards(g); if (g.phase === 'finished') return;
      g.players.forEach(x => { delete x.lockedReward; });
      g.active = (g.active + 1) % g.players.length; g.turn++; g.phase = 'roll'; g.built = false; g.playedCard = false; g.offers = []; g.dice = null; g.bonusRoll = false;
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
  return { rulesVersion: g.rulesVersion, threat: g.threat, raid: g.raid, consecutiveDefeats: g.consecutiveDefeats, penaltyTurns: g.penaltyUntil > 0 ? Math.max(0, g.penaltyUntil - g.turn + 1) : 0, lastBattle: g.lastBattle, cataclysm: Boolean(g.cataclysm), code: g.code, host: g.host, practice: g.practice, ai: Boolean(g.ai), boardSize: g.board.tiles.length, botCount: g.ai ? 1 : g.botCount || 0, humanLimit: g.ai ? 1 : 4 - (g.botCount || 0), maxPlayers: g.ai ? 2 : 4, me: p.id, accountLinked: Boolean(p.accountId), lastRoll: g.lastRoll ? { dice: g.lastRoll.dice, player: g.lastRoll.player, turn: g.lastRoll.turn, resources: g.lastRoll.gains[p.id] } : null, phase: g.phase, active: g.active, revision: g.revision, turn: g.turn, bank: g.bank, board: g.board, dice: g.dice, bonusRoll: Boolean(g.bonusRoll), robber: g.robber, longest: g.longest, army: g.army, winner: g.winner, built: g.built, playedCard: g.playedCard, freeRoads: g.freeRoads, discard: g.discard, victims: g.victims || [], offers: g.offers, deckCount: g.deck.length, log: g.log, legal,
    players: g.players.map(x => ({ id: x.id, name: x.name, faction: x.faction, heroPoints: x.heroPoints || 0, lockedReward: x.id === p.id ? x.lockedReward : undefined, bot: Boolean(x.bot), color: x.color, points: points(g, x, x.id === p.id || g.phase === 'finished'), resources: x.id === p.id ? x.resources : undefined, cards: x.id === p.id ? x.cards : undefined, resourceCount: sum(x.resources), cardCount: x.cards.length, knights: x.knights, roadLength: roadLength(g, x.id) })),
    rates: Object.fromEntries(RES.map(r => [r, rate(g, p, r)])) };
}
