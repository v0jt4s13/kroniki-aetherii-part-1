import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoom, player, act, view, FACTIONS, RULES_VERSION } from './engine.mjs';
import { nextBotMove } from './bot.mjs';
import { createAccounts } from './accounts.mjs';
import { publicBasePath } from './base-path.mjs';
import { createTraffic } from './traffic.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const production = process.argv.includes('--production');
const basePath = publicBasePath();
const arg = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const port = Number(arg('--port') || process.env.PORT || 4173);
const host = arg('--host') || process.env.HOST || '0.0.0.0';
const dataDir = resolve(process.env.AETHERII_DATA_DIR || process.env.CATAN_DATA_DIR || resolve(root, 'data'));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const dbPath = resolve(dataDir, 'rooms.json');
const traffic = createTraffic(resolve(dataDir, 'traffic.json'));
const accounts = createAccounts(resolve(dataDir, 'accounts.json'), process.env, (req, res) => traffic.login(req, res));
let rooms = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, 'utf8')) : {};
// Keep a one-time backup before upgrading any saved game.
if (Object.values(rooms).some(g => g.rulesVersion !== RULES_VERSION) && !existsSync(resolve(dataDir, 'rooms.pre-aetherii.json'))) {
  writeFileSync(resolve(dataDir, 'rooms.pre-aetherii.json'), JSON.stringify(rooms), { mode: 0o600, flag: 'wx' });
}
// Upgrade saved games without touching accounts, player tokens or placed pieces.
for (const g of Object.values(rooms)) if (g.rulesVersion !== RULES_VERSION) {
  Object.assign(g, { rulesVersion: RULES_VERSION, threat: 0, raid: null, consecutiveDefeats: 0, penaltyUntil: 0, lastBattle: null, robber: null, longest: null, army: null });
  g.players.forEach((p, i) => { p.faction = FACTIONS[i]; p.heroPoints = 0; p.cards.forEach(c => { if (c.type === 'knight') c.type = 'ward'; }); });
  g.deck = g.deck.map(c => c === 'knight' ? 'ward' : c);
  if (['robber', 'steal'].includes(g.phase)) g.phase = g.robberResume || 'main';
  if (g.phase.startsWith('setup') && g.players.length === 2 && g.setupIndex < 4) g.setupOrder = [0, 1, 1, 0];
  g.revision++;
}
const assignFaction = (g, p, requested) => {
  const available = FACTIONS.filter(f => !g.players.some(x => x.id !== p.id && x.faction === f));
  if (requested !== undefined && !FACTIONS.includes(requested)) throw new Error('Nieznana frakcja.');
  // Join links may carry an already chosen faction; use the first free faction in that case.
  p.faction = available.includes(requested) ? requested : available.includes(p.faction) ? p.faction : available[0];
};
const save = () => { writeFileSync(`${dbPath}.tmp`, JSON.stringify(rooms), { mode: 0o600 }); renameSync(`${dbPath}.tmp`, dbPath); };
// Timed server-side actions survive reloads and server restarts. No bot token is
// issued to a browser, and all moves go through the same rules as human moves.
const botTimer = setInterval(() => {
  for (const g of Object.values(rooms)) {
    if (!g.players.some(p => p.bot) || ['lobby', 'finished'].includes(g.phase)) continue;
    try {
      const move = nextBotMove(g); if (!move) continue;
      const next = structuredClone(g); act(next, move.playerId, move.action, move.payload);
      next.revision++; rooms[g.code] = next; save();
    } catch (error) { console.error(`AI action failed in room ${g.code}: ${error.message}`); }
  }
}, Math.max(10, Number(process.env.AETHERII_BOT_DELAY_MS || process.env.CATAN_BOT_DELAY_MS) || 650));
botTimer.unref();
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolveBody, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 12000) { reject(new Error('Żądanie jest za duże.')); req.destroy(); } });
  req.on('end', () => { try { resolveBody(JSON.parse(body || '{}')); } catch { reject(new Error('Nieprawidłowe dane JSON.')); } });
  req.on('error', reject);
});
const limiter = new Map();
const timer = setInterval(() => limiter.clear(), 60000); timer.unref();
const demo = createRoom('WYSPA7', 'Ala');
['Bartek', 'Celina', 'Dawid'].forEach((name, i) => demo.players.push(player(name, i + 1)));
demo.phase = 'roll'; demo.robber = null;
demo.players.forEach((p, i) => {
  p.resources = { wood: 3, brick: 2, sheep: 1, wheat: 4, ore: 2 };
  for (let n = 0; n < 2; n++) {
    const vertex = demo.board.vertices.find(v => !v.owner && v.tiles.length >= 2 && v.edges.every(eId => { const e = demo.board.edges[eId]; return !demo.board.vertices[e.a === v.id ? e.b : e.a].owner; }) && Math.abs(v.x - (100 + i * 100)) < 160);
    if (vertex) { vertex.owner = p.id; vertex.level = 1; const e = demo.board.edges[vertex.edges.find(id => !demo.board.edges[id].owner)]; if (e) e.owner = p.id; }
  }
});
const vite = production ? null : await (await import('vite')).createServer({ root, configFile: resolve(root, 'vite.game.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local.invalid');
  if (basePath && url.pathname === basePath) {
    res.writeHead(301, { Location: basePath + '/' + url.search }); return res.end();
  }
  if (basePath && url.pathname.startsWith(basePath + '/')) {
    url.pathname = url.pathname.slice(basePath.length);
    req.url = url.pathname + url.search;
  } else if (basePath && url.pathname !== '/api/health') {
    res.writeHead(404); return res.end('Not found');
  }
  if (url.pathname.startsWith('/api/')) {
    try {
      // Browser writes must originate from this host. No wildcard CORS.
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Niedozwolone źródło żądania.' });
      const ip = req.socket.remoteAddress;
      const count = (limiter.get(ip) || 0) + 1; limiter.set(ip, count);
      if (count > 600) return json(res, 429, { error: 'Za dużo żądań. Spróbuj za chwilę.' });
      if (url.pathname === '/api/traffic' && req.method === 'GET') return json(res, 200, traffic.summary());
      if (url.pathname === '/api/traffic' && req.method === 'POST') return json(res, 200, traffic.pulse(req, res, await readBody(req)));
      const user = accounts.session(req);
      const accountView = u => ({ user: accounts.publicUser(u), googleEnabled: accounts.googleEnabled, rooms: u ? Object.values(rooms).filter(g => g.players.some(p => p.accountId === u.id)).map(g => ({ code: g.code, ai: Boolean(g.ai), phase: g.phase, players: g.players.map(p => p.name) })).reverse() : [] });
      if (url.pathname === '/api/auth/google' && req.method === 'GET') return accounts.googleStart(req, res, url);
      if (url.pathname === '/api/auth/google/callback' && req.method === 'GET') return await accounts.googleFinish(req, res, url);
      if (url.pathname === '/api/account' && req.method === 'GET') return json(res, 200, accountView(user));
      if (['/api/auth/register', '/api/auth/login'].includes(url.pathname) && req.method === 'POST') {
        const body = await readBody(req);
        const u = await accounts[url.pathname.endsWith('register') ? 'register' : 'login'](req, res, body);
        return json(res, 200, accountView(u));
      }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') { accounts.logout(req, res); return json(res, 200, { ok: true }); }
      if (['/api/account/resume', '/api/account/link'].includes(url.pathname) && req.method === 'POST') {
        if (!user) return json(res, 401, { error: 'Zaloguj się na konto gracza.' });
        const body = await readBody(req), g = rooms[body.code];
        if (!g) return json(res, 404, { error: 'Nie znaleziono gry.' });
        let p = g.players.find(p => !p.bot && p.accountId === user.id);
        if (url.pathname.endsWith('link') && !p) {
          p = g.players.find(p => !p.bot && !p.accountId && p.token === body.token);
          if (p) { p.accountId = user.id; g.revision++; save(); }
        }
        if (!p) return json(res, 403, { error: 'Ta gra nie należy do Twojego konta.' });
        return json(res, 200, { token: p.token, state: view(g, p.id) });
      }
      if (url.pathname === '/api/health') return json(res, 200, { ok: true });
      if (url.pathname === '/api/preview' && req.method === 'GET') return json(res, 200, view(demo, demo.players[0].id));
      if (req.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readBody(req);
        let code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms[code]);
        if (body.ai === true && body.botCount) throw new Error('Wybierz tryb solo albo skład pokoju ze znajomymi.');
        const g = createRoom(code, user?.name || body.name, body.practice === true || body.ai === true, { boardSize: body.boardSize, botCount: body.botCount });
        assignFaction(g, g.players[0], body.faction);
        if (user) g.players[0].accountId = user.id;
        if (body.ai === true) {
          g.ai = true;
          const aiCount = body.aiCount === undefined ? 1 : body.aiCount;
          if (!Number.isInteger(aiCount) || aiCount < 1 || aiCount > 3) throw new Error('Wybierz od 1 do 3 przeciwników SI.');
          for (let i = 1; i <= aiCount; i++) {
            const bot = player(aiCount === 1 ? 'Komputer' : `Komputer ${i}`, i);
            assignFaction(g, bot); bot.bot = true; bot.token = null; g.players.push(bot);
          }
          act(g, g.host, 'start'); g.revision++;
        }
        rooms[code] = g; save();
        return json(res, 201, { token: g.players[0].token, state: view(g, g.players[0].id) });
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|action))?$/);
      if (!match) return json(res, 404, { error: 'Nie znaleziono pokoju.' });
      let g = rooms[match[1]];
      if (!g) return json(res, 404, { error: 'Ten pokój nie istnieje. Sprawdź link.' });
      if (req.method === 'POST' && match[2] === 'join') {
        const body = await readBody(req);
        g = rooms[match[1]];
        const existing = user && g.players.find(p => p.accountId === user.id);
        if (existing) return json(res, 200, { token: existing.token, state: view(g, existing.id) });
        if (g.phase !== 'lobby') return json(res, 409, { error: 'Gra już trwa. Nowi gracze nie mogą dołączyć.' });
        if (g.players.length >= (g.ai ? 2 : 4) || g.players.filter(p => !p.bot).length >= (g.ai ? 1 : 4 - (g.botCount || 0))) return json(res, 409, { error: 'Pokój jest pełny.' });
        const p = player(user?.name || body.name, g.players.length); assignFaction(g, p, body.faction); if (user) p.accountId = user.id;
        g.players.push(p); g.revision++; save();
        return json(res, 201, { token: p.token, state: view(g, p.id) });
      }
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const p = token && g.players.find(x => !x.bot && x.token === token && (!x.accountId || x.accountId === user?.id));
      if (!p) return json(res, 401, { error: 'Dołącz do pokoju, aby zobaczyć rozgrywkę.' });
      if (req.method === 'GET' && !match[2]) return json(res, 200, view(g, p.id));
      if (req.method === 'POST' && match[2] === 'action') {
        const body = await readBody(req);
        g = rooms[match[1]];
        if (body.revision !== g.revision) return json(res, 409, { error: 'Plansza została zaktualizowana. Spróbuj ponownie.', state: view(g, p.id) });
        // Apply on a copy: rejected actions cannot spend cards or partially mutate state.
        const next = structuredClone(g); act(next, p.id, body.action, body.payload); next.revision++; rooms[g.code] = next; save();
        return json(res, 200, view(next, p.id));
      }
      return json(res, 405, { error: 'Niedozwolona metoda.' });
    } catch (error) { return json(res, error.status || 400, { error: error.message || 'Nie udało się wykonać akcji.' }); }
  }
  if (url.pathname === '/' && !url.searchParams.has('preview')) req.url = '/play.html' + url.search;
  if (vite) return vite.middlewares(req, res);
  try {
    const client = resolve(root, 'dist/client');
    let path = resolve(client, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(client + sep) && path !== client) { res.writeHead(403); return res.end(); }
    if (!extname(path)) path = resolve(client, url.searchParams.has('preview') ? 'index.html' : 'play.html');
    let data = readFileSync(path);
    if (extname(path) === '.html') data = Buffer.from(data.toString().replace('<head>', `<head><base href="${basePath}/">`));
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, host, () => console.log(`Kroniki Aetherii: http://${host}:${port} (${production ? 'production' : 'development'})`));
const shutdown = () => { clearInterval(botTimer); traffic.close(); server.close(); vite?.close(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
