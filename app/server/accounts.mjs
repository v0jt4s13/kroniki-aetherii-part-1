import { publicBasePath } from './base-path.mjs';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { OAuth2Client } from 'google-auth-library';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));

export function createAccounts(path, config = process.env, onLogin = () => {}) {
  const db = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { users: [], sessions: {} };
  const pending = new Map(), attempts = new Map();
  const secure = config.PUBLIC_URL?.startsWith('https://');
  const home = publicBasePath(config) + '/';
  const cookie = (name, value, age) => `${name}=${value}; Path=${home}; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const save = () => { writeFileSync(path + '.tmp', JSON.stringify(db), { mode: 0o600 }); renameSync(path + '.tmp', path); };
  const publicUser = u => u ? { id: u.id, name: u.name, email: u.email, google: Boolean(u.googleId) } : null;
  const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.PUBLIC_URL);
  const google = googleEnabled ? new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, `${config.PUBLIC_URL.replace(/\/$/, '')}/api/auth/google/callback`) : null;
  function session(req) {
    const raw = cookies(req).catan_session; if (!raw) return null;
    const s = db.sessions[digest(raw)];
    return s && s.expires > Date.now() ? db.users.find(u => u.id === s.userId) : null;
  }
  function issue(req, res, u) {
    const old = cookies(req).catan_session; if (old) delete db.sessions[digest(old)];
    for (const [id, s] of Object.entries(db.sessions)) if (s.expires < Date.now()) delete db.sessions[id];
    const raw = randomBytes(32).toString('hex');
    db.sessions[digest(raw)] = { userId: u.id, expires: Date.now() + 30 * 86400000 };
    save(); res.setHeader('Set-Cookie', cookie('catan_session', raw, 30 * 86400));
    onLogin(req, res);
  }
  function throttle(req) {
    const ip = req.socket.remoteAddress, now = Date.now();
    const a = attempts.get(ip);
    if (!a || now > a.until) attempts.set(ip, { count: 1, until: now + 60000 });
    else if (++a.count > 10) fail('Za dużo prób logowania. Spróbuj za minutę.', 429);
    if (attempts.size > 1000) for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  }
  return {
    session, publicUser, googleEnabled,
    async register(req, res, body) {
      throttle(req);
      const email = emailOf(body.email), name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('Podaj poprawny adres e-mail.');
      if (!name || name.length > 24) fail('Podaj imię (1–24 znaki).');
      if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail('Hasło musi mieć 10–128 znaków.');
      const salt = randomBytes(16).toString('hex'), hash = (await derive(body.password, salt, 64)).toString('hex');
      if (db.users.some(u => u.email === email)) fail('Ten adres ma już konto. Zaloguj się.');
      const u = { id: randomUUID(), name, email, salt, hash }; db.users.push(u); issue(req, res, u); return u;
    },
    async login(req, res, body) {
      throttle(req);
      if (typeof body.password !== 'string' || body.password.length > 128) fail('Nieprawidłowy e-mail lub hasło.', 401);
      const u = db.users.find(u => u.email === emailOf(body.email));
      const computed = await derive(body.password, u?.salt || 'missing-account', 64);
      if (!u?.hash || !timingSafeEqual(computed, Buffer.from(u.hash, 'hex'))) fail('Nieprawidłowy e-mail lub hasło.', 401);
      issue(req, res, u); return u;
    },
    logout(req, res) {
      const raw = cookies(req).catan_session; if (raw) delete db.sessions[digest(raw)];
      save(); res.setHeader('Set-Cookie', cookie('catan_session', '', 0));
    },
    googleStart(req, res, url) {
      if (!google) fail('Logowanie Google wymaga konfiguracji serwera.', 503);
      throttle(req);
      for (const [id, p] of pending) if (p.expires < Date.now()) pending.delete(id);
      const state = randomBytes(32).toString('hex'), verifier = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('hex');
      const room = /^[A-Z0-9]{6}$/.test(url.searchParams.get('room') || '') ? url.searchParams.get('room') : null;
      pending.set(state, { verifier, nonce, room, linkUserId: session(req)?.id, expires: Date.now() + 600000 });
      res.setHeader('Set-Cookie', cookie('catan_oauth', state, 600));
      res.writeHead(302, { Location: google.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }), 'Cache-Control': 'no-store' }); res.end();
    },
    async googleFinish(req, res, url) {
      if (!google) fail('Logowanie Google wymaga konfiguracji serwera.', 503);
      const state = url.searchParams.get('state'), p = pending.get(state);
      if (!p || p.expires < Date.now() || cookies(req).catan_oauth !== state) fail('Sesja Google wygasła. Rozpocznij logowanie ponownie.');
      pending.delete(state);
      const returnTo = p.room ? `${home}?room=${p.room}` : home;
      if (url.searchParams.has('error')) { res.writeHead(302, { Location: `${returnTo}${p.room ? '&' : '?'}auth=cancelled`, 'Set-Cookie': cookie('catan_oauth', '', 0) }); res.end(); return; }
      const code = url.searchParams.get('code'); if (!code) fail('Brak kodu logowania Google.');
      const { tokens } = await google.getToken({ code, codeVerifier: p.verifier });
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID });
      const claims = ticket.getPayload();
      if (!claims?.sub || !claims.email_verified || claims.nonce !== p.nonce) fail('Google nie potwierdziło tożsamości konta.', 401);
      let u = db.users.find(u => u.googleId === claims.sub);
      if (p.linkUserId) {
        const current = session(req);
        if (current?.id !== p.linkUserId) fail('Zaloguj się ponownie przed połączeniem z Google.', 401);
        if (u && u.id !== current.id) fail('To konto Google jest już połączone z innym graczem.');
        current.googleId = claims.sub; u = current;
      }
      // Never link a password account using an unverified local email alone.
      if (!u && db.users.some(u => u.email === emailOf(claims.email))) {
        res.writeHead(302, { Location: `${returnTo}${p.room ? '&' : '?'}auth=use-password`, 'Set-Cookie': cookie('catan_oauth', '', 0) }); res.end(); return;
      }
      if (!u) { u = { id: randomUUID(), name: (claims.name || claims.given_name || 'Gracz').slice(0, 24), email: emailOf(claims.email), googleId: claims.sub }; db.users.push(u); }
      issue(req, res, u);
      res.setHeader('Set-Cookie', [].concat(res.getHeader('Set-Cookie'), cookie('catan_oauth', '', 0)));
      res.writeHead(302, { Location: returnTo, 'Cache-Control': 'no-store' }); res.end();
    },
  };
}
