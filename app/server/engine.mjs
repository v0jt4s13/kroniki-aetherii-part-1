import { message, source, LocalizedError } from '../i18n/server.mjs';
import { randomInt, randomUUID } from 'node:crypto';

export const FACTIONS = ['dwarves', 'rock-elves', 'forest-elves', 'humans'];
export const RULES_VERSION = 'aetherii-1';
export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const COST = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { sheep: 1, wheat: 1, ore: 1 } };
const COLORS = ['#398147', '#c23c30', '#176cab', '#d69b24'];
const empty = () => Object.fromEntries(RES.map(r => [r, 0]));
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
const check = (ok, message) => { if (!ok) throw new LocalizedError(message); };
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export const BOARD_SIZES = [19, 23, 25];
export function board(size = 19) {
  check(BOARD_SIZES.includes(size), message("errors.choose_a_board_of_19_23_or_25_hexes"));
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
  check(chosenRed, message("errors.could_not_place_number_tokens"));
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
  check(typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 24, message("errors.enter_a_name_1_24_characters"));
  return { id: randomUUID(), token: randomUUID(), name: name.trim(), color: COLORS[index], resources: empty(), cards: [], knights: 0, faction: FACTIONS[index], heroPoints: 0 };
}
export function createRoom(code, name, practice = false, options = {}) {
  const { boardSize = 19, botCount = 0 } = options;
  check(Number.isInteger(botCount) && botCount >= 0 && botCount <= 3, message("errors.choose_0_to_3_ai_players"));
  const p = player(name, 0);
  return { rulesVersion: RULES_VERSION, threat: 0, raid: null, consecutiveDefeats: 0, penaltyUntil: 0, lastBattle: null, code, host: p.id, players: [p], practice, botCount, board: board(boardSize), phase: 'lobby', active: 0, revision: 0, turn: 0, bank: Object.fromEntries(RES.map(r => [r, 19])), deck: shuffle([...Array(14).fill('ward'), ...Array(5).fill('point'), 'roads', 'roads', 'plenty', 'plenty', 'monopoly', 'monopoly']), log: [], dice: null, bonusRoll: false, longest: null, army: null, robber: null, offers: [], discard: {}, freeRoads: 0, built: false, playedCard: false };
}
const log = (g, entry) => { const descriptor = typeof entry === 'string' ? undefined : entry; const text = descriptor ? source(descriptor.key, descriptor.args) : entry; g.log.unshift({ text, ...(descriptor ? { message: descriptor } : {}), turn: g.turn }); g.log = g.log.slice(0, 60); };
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
    if (points(g, p) >= 10) { g.phase = 'finished'; g.winner = p.id; log(g, message("events.0_wins_with_1_vp", [p.name, points(g, p)])); }
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
    if (leaders.length === 1) { leaders[0].heroPoints++; log(g, message("events.0_hero_of_aetheria_1_vp", [leaders[0].name])); }
    else { leaders.forEach(p => drawMagic(g, p, rng)); log(g, message("events.heroes_tied_one_magic_card_each_no_vp_while_the_deck_lasts")); }
    g.threat = 0; g.consecutiveDefeats = 0;
    log(g, message("events.raid_repelled_armor_0_1", [strength, required]));
  } else {
    g.consecutiveDefeats++;
    if (g.threat >= 100 && g.consecutiveDefeats >= 2) {
      for (const c of Object.values(contributions)) for (const r of RES) g.bank[r] += c.resources[r];
      g.phase = 'finished'; g.winner = null; g.cataclysm = true; g.raid = null;
      log(g, message("events.cataclysm_aetheria_falls_all_players_lose")); return;
    }
    const lowest = Math.min(...g.players.map(p => armor(g, p)));
    for (const p of g.players.filter(p => armor(g, p) === lowest)) {
      const protectedRoad = p.faction === 'forest-elves' && raid.contributions[p.id].resources.sheep > 0;
      const roads = g.board.edges.filter(e => e.owner === p.id).sort((a, b) => b.id - a.id);
      if (protectedRoad && roads.length) { log(g, message("events.0_ethereal_herbs_protect_a_trade_route", [p.name])); continue; }
      g.lastBattle.punished.push(p.id);
      if (roads.length) { roads[0].owner = null; log(g, message("events.0_loses_a_trade_route_for_the_smallest_contribution", [p.name])); }
      else {
        let remaining = Math.floor(sum(p.resources) / 2);
        for (const r of RES) { const n = Math.min(remaining, p.resources[r]); pay(g, p, { [r]: n }); remaining -= n; }
        log(g, message("events.0_loses_half_their_resources_no_trade_routes", [p.name]));
      }
    }
    g.penaltyUntil = g.turn + g.players.length; g.threat = 20;
    log(g, message("events.the_raid_wins_0_1_everyone_s_production_drops_by_1_for_a_round", [strength, required]));
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
const pay = (g, p, cost) => { check(afford(p, cost), message("errors.not_enough_resources")); for (const [r, n] of Object.entries(cost)) { p.resources[r] -= n; g.bank[r] += n; } };
function receive(g, p, r, n = 1) { check(g.bank[r] >= n, message("errors.the_bank_has_none_of_this_resource")); p.resources[r] += n; g.bank[r] -= n; }
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
  check(bag && typeof bag === 'object' && !Array.isArray(bag), message("errors.invalid_resource_selection"));
  check(Object.keys(bag).every(r => RES.includes(r)) && Object.values(bag).every(n => Number.isInteger(n) && n >= 0 && n <= 19), message("errors.invalid_resource_count"));
  return { ...empty(), ...bag };
}
function resumeRobber(g) { g.phase = g.robberResume || 'main'; delete g.robberResume; }
export function act(g, playerId, action, payload = {}, rng = randomInt) {
  const p = g.players.find(p => p.id === playerId);
  check(p, message("errors.you_are_not_a_player_in_this_room"));
  check(g.phase !== 'finished', message("errors.the_game_has_already_ended"));
  if (action === 'configure') {
    check(g.phase === 'lobby' && g.host === p.id, message("errors.only_the_host_can_configure_the_game_before_it_starts"));
    const size = payload.boardSize ?? g.board.tiles.length, bots = payload.botCount ?? g.botCount ?? 0;
    check(BOARD_SIZES.includes(size), message("errors.choose_a_board_of_19_23_or_25_hexes"));
    check(Number.isInteger(bots) && bots >= 0 && bots <= 3 && !g.ai, message("errors.choose_0_to_3_ai_players"));
    check(g.players.filter(x => !x.bot).length <= 4 - bots, message("errors.too_many_humans_for_this_ai_count"));
    if (size !== g.board.tiles.length) g.board = board(size);
    g.botCount = bots;
  } else if (action === 'faction') {
    check(g.phase === 'lobby' && FACTIONS.includes(payload.faction), message("errors.choose_your_faction_before_the_game_starts"));
    check(!g.players.some(x => x.id !== p.id && x.faction === payload.faction), message("errors.this_faction_is_already_taken"));
    p.faction = payload.faction;
  } else if (action === 'start') {
    check(g.phase === 'lobby' && g.host === p.id, message("errors.only_the_host_can_start_the_game"));
    if (g.botCount) {
      check(g.players.filter(x => !x.bot).length === 4 - g.botCount, message("errors.wait_for_0_human_players", [4 - g.botCount]));
      check(!g.players.some(x => x.bot), message("errors.ai_players_are_already_in_the_room"));
      for (let i = 0; i < g.botCount; i++) {
        const bot = player(g.botCount === 1 ? 'Komputer' : `Komputer ${i + 1}`, g.players.length);
        bot.faction = FACTIONS.find(f => !g.players.some(x => x.faction === f));
        bot.bot = true; bot.token = null; g.players.push(bot);
      }
    }
    check(g.players.length >= 2 && g.players.length <= 4, message("errors.chronicles_of_aetheria_requires_2_4_players"));
    check(new Set(g.players.map(p => p.faction)).size === g.players.length && g.players.every(p => FACTIONS.includes(p.faction)), message("errors.each_player_must_have_a_different_faction"));
    if (!g.board.tiles.some(t => t.resource === 'desert')) g.board = board(g.board.tiles.length);
    const snake = [...g.players.keys(), ...[...g.players.keys()].reverse()];
    g.setupOrder = snake; g.setupIndex = 0; g.active = 0;
    g.phase = 'setup-settlement'; g.robber = null;
    log(g, message("events.setup_choose_your_first_watchtower_and_trade_route"));
  } else if (action === 'discard') {
    check(g.phase === 'discard' && g.discard[p.id], message("errors.you_do_not_need_to_discard_cards"));
    const bag = resourceBag(payload.resources);
    check(sum(bag) === g.discard[p.id] && afford(p, bag), message("errors.choose_exactly_0_cards", [g.discard[p.id]]));
    pay(g, p, bag); delete g.discard[p.id]; log(g, message("events.0_discards_1_cards", [p.name, sum(bag)]));
    if (!Object.keys(g.discard).length) g.phase = 'main';
  } else if (action === 'accept') {
    check(g.phase === 'main' && !g.built, message("errors.trading_is_unavailable_now"));
    const offer = g.offers.find(o => o.id === payload.id);
    check(offer && offer.from === g.players[g.active].id && offer.from !== p.id && (!offer.to || offer.to === p.id), message("errors.this_offer_is_unavailable"));
    const from = g.players.find(x => x.id === offer.from);
    check(afford(from, offer.give) && afford(p, offer.want), message("errors.the_offer_is_no_longer_backed_by_resources"));
    for (const r of RES) { from.resources[r] += offer.want[r] - offer.give[r]; p.resources[r] += offer.give[r] - offer.want[r]; }
    g.offers = []; log(g, message("events.0_and_1_exchange_resources", [from.name, p.name]));
  } else {
    check(g.players[g.active].id === p.id, message("errors.wait_for_your_turn"));
    if (action === 'build') {
      const type = payload.type;
      check(['road', 'settlement', 'city'].includes(type), message("errors.unknown_building_type"));
      const setup = g.phase.startsWith('setup');
      if (setup) check((g.phase === 'setup-road' && type === 'road') || (g.phase === 'setup-settlement' && type === 'settlement'), message("errors.watchtower_first_then_trade_route"));
      else check(g.phase === 'main' || (g.phase === 'free-roads' && type === 'road'), message("errors.you_cannot_build_now"));
      if (type === 'road') {
        const e = g.board.edges[payload.id]; check(canRoad(g, p, e, setup), message("errors.a_trade_route_must_connect_to_your_network"));
        if (!setup && g.phase !== 'free-roads') pay(g, p, COST.road); e.owner = p.id;
      } else {
        const v = g.board.vertices[payload.id];
        if (type === 'settlement') check(canSettle(g, p, v, setup), message("errors.choose_an_empty_intersection_away_from_other_watchtowers"));
        else check(v && v.owner === p.id && v.level === 1 && owned(g, p, 2) < 4, message("errors.a_citadel_replaces_your_watchtower_max_4_citadels"));
        if (!setup) pay(g, p, COST[type]); v.owner = p.id; v.level = type === 'city' ? 2 : 1;
        if (setup) {
          g.lastSettlement = v.id;
          if (g.setupIndex >= g.setupOrder.length - g.players.length) for (const id of v.tiles) { const r = g.board.tiles[id].resource; if (RES.includes(r)) receive(g, p, r); }
        }
      }
      log(g, message("events.building", [p.name, type === 'road' ? message("ui.trade_route") : type === 'city' ? message("ui.citadel") : message("ui.watchtower")]));
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
      check(g.phase === 'roll', message("errors.the_dice_have_already_been_rolled"));
      g.dice = [rng(1, 7), rng(1, 7)];
      // Trzy z czterech siódemek są odrzucane i losowane od nowa, więc siódemek jest cztery razy mniej.
      if (sum(g.dice) === 7 && (g.sevens = (g.sevens || 0) + 1) % 4 !== 1) {
        while (sum(g.dice) === 7) g.dice = [rng(1, 7), rng(1, 7)];
      }
      const total = sum(g.dice);
      const before = g.players.map(x => ({ ...x.resources }));
      log(g, message("events.0_rolls_1_2", [p.name, total, g.dice.join(' + ')]));
      g.bonusRoll = g.dice[0] === g.dice[1];
      g.phase = g.bonusRoll ? 'roll' : 'main';
      if (g.bonusRoll) log(g, message("events.doubles_roll_again_before_trading_and_building"));
      if (total === 7) {
        g.discard = Object.fromEntries(g.players.filter(x => sum(x.resources) > 7).map(x => [x.id, Math.floor(sum(x.resources) / 2)]));
        g.phase = Object.keys(g.discard).length ? 'discard' : 'main';
        g.threat = Math.min(100, g.threat + 20);
        if (!g.raid) g.raid = { started: g.turn, dueTurn: g.turn + g.players.length - 1, delayed: false, contributions: Object.fromEntries(g.players.map(x => [x.id, { resources: empty(), armor: 0, rewarded: false }])) };
        log(g, message("events.raid_threat_0_battle_at_the_end_of_turn_1", [g.threat, g.raid.dueTurn]));
      } else produce(g, total);
      g.lastRoll = { dice: [...g.dice], player: p.name, turn: g.turn, gains: Object.fromEntries(g.players.map((x, i) => [x.id, Object.fromEntries(RES.map(r => [r, x.resources[r] - before[i][r]]))])) };
      log(g, message("events.production_after_rolling_0_1", [total, g.players.map(x => message("events.0_1_resources", [x.name, sum(g.lastRoll.gains[x.id])]))]));
    } else if (action === 'contribute') {
      check(g.phase === 'main' && !g.built && g.raid, message("errors.mobilization_is_available_during_a_raid_before_building"));
      const bag = resourceBag(payload.resources), contribution = g.raid.contributions[p.id];
      check(sum(bag) > 0 && afford(p, bag), message("errors.choose_resources_from_your_hand"));
      check(RES.every(r => bag[r] <= p.resources[r] - (p.lockedReward?.[r] || 0)), message("errors.the_humans_free_resource_cannot_be_contributed_in_the_same_phase"));
      const firstHuman = p.faction === 'humans' && !contribution.rewarded;
      if (firstHuman) check(RES.includes(payload.reward) && g.bank[payload.reward] > 0, message("errors.choose_an_available_free_resource"));
      for (const r of RES) {
        p.resources[r] -= bag[r]; contribution.resources[r] += bag[r];
        contribution.armor += bag[r] * (p.faction === 'dwarves' && r === 'ore' ? 2 : 1);
      }
      // Donated cards stay in the public pool, separate from the bank, until resolution.
      if (firstHuman) {
        receive(g, p, payload.reward); p.lockedReward = { [payload.reward]: 1 }; contribution.rewarded = true;
      }
      g.offers = g.offers.filter(o => afford(g.players.find(x => x.id === o.from), o.give));
      log(g, message("events.0_mobilizes_the_defense_1_armor", [p.name, sum(bag) + (p.faction === 'dwarves' ? bag.ore : 0)]));
    } else if (action === 'delay') {
      check(g.phase === 'main' && !g.built && g.raid && !g.raid.delayed && p.faction === 'rock-elves', message("errors.stone_echo_can_be_used_once_per_raid_during_stone_elf_mobilizatio"));
      g.raid.dueTurn++; g.raid.delayed = true; log(g, message("events.0_stone_echo_delays_the_battle_by_one_turn", [p.name]));
    } else if (action === 'bank') {
      check(g.phase === 'main' && !g.built, message("errors.trade_before_you_start_building"));
      check(RES.includes(payload.give) && RES.includes(payload.want) && payload.give !== payload.want, message("errors.choose_two_different_resources"));
      const n = rate(g, p, payload.give); check(g.bank[payload.want] > 0 && p.resources[payload.give] >= n, message("errors.not_enough_resources_for_the_exchange"));
      pay(g, p, { [payload.give]: n }); receive(g, p, payload.want);
      g.offers = g.offers.filter(o => afford(g.players.find(x => x.id === o.from), o.give));
      log(g, message("events.0_trades_with_the_bank_at_1_1", [p.name, n]));
    } else if (action === 'offer') {
      check(g.phase === 'main' && !g.built, message("errors.trade_before_you_start_building"));
      const give = resourceBag(payload.give), want = resourceBag(payload.want);
      check(sum(give) > 0 && sum(want) > 0 && afford(p, give) && RES.every(r => !give[r] || !want[r]), message("errors.an_offer_needs_different_resources_on_each_side_and_enough_cards"));
      check(!payload.to || g.players.some(x => x.id === payload.to && x.id !== p.id), message("errors.unknown_recipient"));
      g.offers = [{ id: randomUUID(), from: p.id, to: payload.to || null, give, want }]; log(g, message("events.0_proposes_a_trade", [p.name]));
    } else if (action === 'cancel-offer') { g.offers = []; }
    else if (action === 'buy') {
      check(g.phase === 'main' && g.deck.length, message("errors.cannot_buy_a_magic_card"));
      pay(g, p, COST.development);
      const [type] = g.deck.splice(rng(g.deck.length), 1);
      p.cards.push({ id: randomUUID(), type, bought: g.turn });
      g.built = true; g.offers = []; log(g, message("events.0_buys_a_magic_card", [p.name]));
    } else if (action === 'play') {
      check(g.phase === 'main' && !g.playedCard, message("errors.you_may_play_one_card_per_turn"));
      const card = p.cards.find(c => c.id === payload.id);
      check(card && card.type !== 'point' && card.bought < g.turn, message("errors.this_card_cannot_be_played_now"));
      if (card.type === 'ward') {
        check(g.phase === 'main' && !g.built && g.raid, message("errors.runic_shield_requires_an_active_raid_and_the_mobilization_phase"));
        g.raid.contributions[p.id].armor += 2;
      }
      if (card.type === 'roads') {
        check(g.board.edges.some(e => canRoad(g, p, e)), message("errors.no_space_for_a_new_trade_route"));
        g.roadsResume = g.phase; g.freeRoads = 2; g.phase = 'free-roads';
      }
      if (card.type === 'plenty') {
        const bag = resourceBag(payload.resources); check(sum(bag) === Math.min(2, sum(g.bank)) && Object.entries(bag).every(([r, n]) => g.bank[r] >= n), message("errors.choose_2_available_resources"));
        for (const [r, n] of Object.entries(bag)) receive(g, p, r, n);
      }
      if (card.type === 'monopoly') {
        check(RES.includes(payload.resource), message("errors.choose_a_resource"));
        for (const other of g.players) if (other.id !== p.id) { p.resources[payload.resource] += other.resources[payload.resource]; other.resources[payload.resource] = 0; }
      }
      if (card.type !== 'ward') { g.built = true; g.offers = []; }
      p.cards = p.cards.filter(c => c.id !== card.id); g.playedCard = true; log(g, message("events.0_plays_a_magic_card", [p.name]));
    } else if (action === 'end') {
      check(g.phase === 'main', message("errors.finish_the_mandatory_action_before_ending_your_turn"));
      if (g.raid && g.turn >= g.raid.dueTurn) resolveBattle(g, rng);
      awards(g); if (g.phase === 'finished') return;
      g.players.forEach(x => { delete x.lockedReward; });
      g.active = (g.active + 1) % g.players.length; g.turn++; g.phase = 'roll'; g.built = false; g.playedCard = false; g.offers = []; g.dice = null; g.bonusRoll = false;
      log(g, message("events.it_is_0_s_turn", [g.players[g.active].name]));
    } else throw new LocalizedError(message("errors.unknown_action"));
  }
  awards(g);
}
export function view(g, playerId) {
  const p = g.players.find(x => x.id === playerId);
  check(p, message("errors.invalid_session"));
  const legal = { settlements: [], roads: [], cities: [], robber: [] };
  if (g.players[g.active].id === p.id) {
    if (['setup-settlement', 'main'].includes(g.phase)) legal.settlements = g.board.vertices.filter(v => canSettle(g, p, v, g.phase === 'setup-settlement')).map(v => v.id);
    if (['setup-road', 'main', 'free-roads'].includes(g.phase)) legal.roads = g.board.edges.filter(e => canRoad(g, p, e, g.phase === 'setup-road')).map(e => e.id);
    if (g.phase === 'main' && owned(g, p, 2) < 4) legal.cities = g.board.vertices.filter(v => v.owner === p.id && v.level === 1).map(v => v.id);
    if (g.phase === 'robber') legal.robber = g.board.tiles.filter(t => t.id !== g.robber && t.resource !== 'desert').map(t => t.id);
  }
  return { rulesVersion: g.rulesVersion, threat: g.threat, raid: g.raid, consecutiveDefeats: g.consecutiveDefeats, penaltyTurns: g.penaltyUntil > 0 ? Math.max(0, g.penaltyUntil - g.turn + 1) : 0, lastBattle: g.lastBattle, cataclysm: Boolean(g.cataclysm), code: g.code, host: g.host, practice: g.practice, ai: Boolean(g.ai), boardSize: g.board.tiles.length, botCount: g.ai ? g.players.filter(p => p.bot).length : g.botCount || 0, humanLimit: g.ai ? 1 : 4 - (g.botCount || 0), maxPlayers: g.ai ? g.players.length : 4, me: p.id, accountLinked: Boolean(p.accountId), lastRoll: g.lastRoll ? { dice: g.lastRoll.dice, player: g.lastRoll.player, turn: g.lastRoll.turn, resources: g.lastRoll.gains[p.id] } : null, phase: g.phase, active: g.active, revision: g.revision, turn: g.turn, bank: g.bank, board: g.board, dice: g.dice, bonusRoll: Boolean(g.bonusRoll), robber: g.robber, longest: g.longest, army: g.army, winner: g.winner, built: g.built, playedCard: g.playedCard, freeRoads: g.freeRoads, discard: g.discard, victims: g.victims || [], offers: g.offers, deckCount: g.deck.length, log: g.log, legal,
    players: g.players.map(x => ({ id: x.id, name: x.name, faction: x.faction, heroPoints: x.heroPoints || 0, lockedReward: x.id === p.id ? x.lockedReward : undefined, bot: Boolean(x.bot), color: x.color, points: points(g, x, x.id === p.id || g.phase === 'finished'), resources: x.id === p.id ? x.resources : undefined, cards: x.id === p.id ? x.cards : undefined, resourceCount: sum(x.resources), cardCount: x.cards.length, knights: x.knights, roadLength: roadLength(g, x.id) })),
    rates: Object.fromEntries(RES.map(r => [r, rate(g, p, r)])) };
}
