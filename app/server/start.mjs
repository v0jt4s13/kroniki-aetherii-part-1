import { message, source, LocalizedError, localizedResponse } from '../i18n/server.mjs';
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
import { createInvitations } from './invitations.mjs';
import { createCommunication } from './communication.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
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
  if (requested !== undefined && !FACTIONS.includes(requested)) throw new LocalizedError(message("errors.unknown_faction"));
  // Join links may carry an already chosen faction; use the first free faction in that case.
  p.faction = available.includes(requested) ? requested : available.includes(p.faction) ? p.faction : available[0];
};
const save = () => { writeFileSync(`${dbPath}.tmp`, JSON.stringify(rooms), { mode: 0o600 }); renameSync(`${dbPath}.tmp`, dbPath); };
const commitRoom = next => { const previous=rooms[next.code];rooms[next.code]=next;try{save();}catch(error){rooms[next.code]=previous;throw error;} };
const mutateRoom = (code,fn) => {const next=structuredClone(rooms[code]);const result=fn(next);commitRoom(next);return result;};
const invitations = createInvitations({ basePath, secure: process.env.PUBLIC_URL?.startsWith('https://') });
const gameView = (g, id) => ({ ...view(g,id), communication: communication.flags(g,g.players.find(p=>p.id===id)) });
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
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(localizedResponse(body))); };
const readBody = req => new Promise((resolveBody, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 12000) { reject(new LocalizedError(message("errors.request_too_large"))); req.destroy(); } });
  req.on('end', () => { try { resolveBody(JSON.parse(body || '{}')); } catch { reject(new LocalizedError(message("errors.invalid_json_data"))); } });
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
      if (req.headers.origin && req.headers.origin !== (process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : `http://${req.headers.host}`)) return json(res, 403, { error: source("errors.request_origin_not_allowed") });
      const authCode=url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})/ )?.[1];
      const authToken=req.headers.authorization?.replace(/^Bearer /,'');
      const rateUser=accounts.session(req);
      const ratePlayer=authCode&&authToken&&rooms[authCode]?.players.find(p=>!p.bot&&p.token===authToken&&(!p.accountId||p.accountId===rateUser?.id));
      const ip = ratePlayer ? `player:${ratePlayer.id}` : rateUser ? `account:${rateUser.id}` : req.socket.remoteAddress;
      const count = (limiter.get(ip) || 0) + 1; limiter.set(ip, count);
      if (count > 600) return json(res, 429, { error: source("errors.too_many_requests_try_again_shortly") });
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
        if (!user) return json(res, 401, { error: source("errors.sign_in_to_your_player_account") });
        const body = await readBody(req), g = rooms[body.code];
        if (!g) return json(res, 404, { error: source("errors.game_not_found") });
        let p = g.players.find(p => !p.bot && p.accountId === user.id);
        if (url.pathname.endsWith('link') && !p) {
          p = g.players.find(p => !p.bot && !p.accountId && p.token === body.token);
          if (p) { p.accountId = user.id; g.revision++; save(); }
        }
        if (!p) return json(res, 403, { error: source("errors.this_game_does_not_belong_to_your_account") });
        return json(res, 200, { token: p.token, state: gameView(g, p.id) });
      }
      if (url.pathname === '/api/health') return json(res, 200, { ok: true });
      if (url.pathname === '/api/version' && req.method === 'GET') return json(res, 200, { version: appVersion });
      if (url.pathname === '/api/readiness' && req.method === 'GET') return json(res, communication.ready() ? 200 : 503, { ok: Boolean(communication.ready()) });
      if (url.pathname === '/api/preview' && req.method === 'GET') return json(res, 200, view(demo, demo.players[0].id));
      if (req.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readBody(req);
        let code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms[code]);
        if (body.ai === true && body.botCount) throw new LocalizedError(message("errors.choose_solo_mode_or_a_friends_room_lineup"));
        const g = createRoom(code, user?.name || body.name, body.practice === true || body.ai === true, { boardSize: body.boardSize, botCount: body.botCount });
        assignFaction(g, g.players[0], body.faction);
        if (user) g.players[0].accountId = user.id;
        if (body.ai === true) {
          g.ai = true;
          const aiCount = body.aiCount === undefined ? 1 : body.aiCount;
          if (!Number.isInteger(aiCount) || aiCount < 1 || aiCount > 3) throw new LocalizedError(message("errors.choose_1_to_3_ai_opponents"));
          for (let i = 1; i <= aiCount; i++) {
            const bot = player(aiCount === 1 ? 'Komputer' : `Komputer ${i}`, i);
            assignFaction(g, bot); bot.bot = true; bot.token = null; g.players.push(bot);
          }
          act(g, g.host, 'start'); g.revision++;
        }
        g.communicationApproved = true; rooms[code] = g; save();
        return json(res, 201, { token: g.players[0].token, state: gameView(g, g.players[0].id) });
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|action|invitations|invitation-context|communication-ticket|messages|voice-credentials|communication-settings))?$/);
      if (!match) return json(res, 404, { error: source("errors.room_not_found") });
      let g = rooms[match[1]];
      if (!g) return json(res, 404, { error: source("errors.this_room_does_not_exist_check_the_link") });
      if (match[2] === 'invitation-context') {
        if (req.method === 'POST') { const b=await readBody(req); return json(res,200,mutateRoom(match[1],next=>invitations.stage(req,res,next,b.secret))); }
        if (req.method === 'GET') return json(res,200,{ready:invitations.context(req,g)});
      }
      if (req.method === 'POST' && match[2] === 'join') {
        const body = await readBody(req);
        const joiningUser=accounts.session(req);
        g = structuredClone(rooms[match[1]]);
        const existing = joiningUser && g.players.find(p => p.accountId === joiningUser.id);
        if (existing) return json(res, 200, { token: existing.token, state: gameView(g, existing.id) });
        const invitation=invitations.inspect(req,g,joiningUser);
        if(invitation.existing)return json(res,200,{token:invitation.existing.token,state:gameView(g,invitation.existing.id)});
        if (g.phase !== 'lobby') return json(res, 409, { error: source("errors.the_game_is_in_progress_new_players_cannot_join") });
        if (g.players.length >= (g.ai ? 2 : 4) || g.players.filter(p => !p.bot).length >= (g.ai ? 1 : 4 - (g.botCount || 0))) return json(res, 409, { error: source("errors.the_room_is_full") });
        const p = player(joiningUser?.name || body.name, g.players.length); assignFaction(g, p, body.faction); if (joiningUser) p.accountId = joiningUser.id;
        invitation.consume(p); g.players.push(p); g.revision++; commitRoom(g);
        return json(res, 201, { token: p.token, state: gameView(g, p.id) });
      }
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const p = token && g.players.find(x => !x.bot && x.token === token && (!x.accountId || x.accountId === user?.id));
      if (!p) return json(res, 401, { error: source("errors.join_the_room_to_view_the_game") });
      if (match[2] === 'invitations') {
        if(g.host!==p.id)return json(res,403,{error:source("errors.only_the_host_invites_players")});
        if(req.method==='GET')return json(res,200,{invitations:(g.invitations||[]).filter(x=>!x.used&&x.expires>Date.now()).map(({id,expires,accountId})=>({id,expires,accountId}))});
        if(req.method==='POST'){
          const b=await readBody(req);g=rooms[match[1]];
          if(p.accountId&&accounts.session(req)?.id!==p.accountId)return json(res,401,{error:source("errors.session_expired")});
          if(b.revoke){mutateRoom(g.code,next=>{next.invitations=(next.invitations||[]).filter(x=>x.id!==b.revoke);});return json(res,200,{ok:true});}
          if(b.accountId && (typeof b.accountId!=='string'||!accounts.hasUser(b.accountId)))throw new LocalizedError(message("errors.the_specified_account_was_not_found"));
          return json(res,201,mutateRoom(g.code,next=>invitations.create(next,b.accountId)));
        }
      }
      if(await communication.route(req,res,url,g,p,match[2]))return;
      if (req.method === 'GET' && !match[2]) return json(res, 200, gameView(g, p.id));
      if (req.method === 'POST' && match[2] === 'action') {
        const body = await readBody(req);
        g = rooms[match[1]];
        if (body.revision !== g.revision) return json(res, 409, { error: source("errors.the_board_was_updated_try_again"), state: gameView(g, p.id) });
        // Apply on a copy: rejected actions cannot spend cards or partially mutate state.
        const next = structuredClone(g); act(next, p.id, body.action, body.payload); next.revision++; rooms[g.code] = next; save();
        return json(res, 200, gameView(next, p.id));
      }
      return json(res, 405, { error: source("errors.method_not_allowed") });
    } catch (error) { return json(res, error.status || 400, { error: error.message || source('ui.could_not_connect'), errorMessage: error.messageDescriptor }); }
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
const communication=createCommunication({server,basePath,dataDir,getRoom:code=>rooms[code],accounts,mutateRoom,json,readBody,env:process.env});
server.listen(port, host, () => console.log(`Kroniki Aetherii: http://${host}:${port} (${production ? 'production' : 'development'})`));
const shutdown = () => { clearInterval(botTimer); traffic.close(); communication.close(); server.close(); vite?.close(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
