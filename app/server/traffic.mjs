import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { publicBasePath } from './base-path.mjs';

export const RETENTION_MS = 30 * 86400000;
export const ONLINE_MS = 60000;
const MAX_GAP_MS = 45000;

// Only random browser-token digests, event types, times and durations enter this file.
export function createTraffic(path, { config = process.env, now = Date.now, intervalMs = 15000 } = {}) {
  const events = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).events : [];
  if (!Array.isArray(events)) throw new Error('Nieprawidłowy plik statystyk.');
  const live = new Map();
  let dirty = true;
  const cookiePath = publicBasePath(config) + '/';
  const prune = () => {
    const cutoff = now() - RETENTION_MS;
    let removed = false;
    for (let i = events.length - 1; i >= 0; i--) if (events[i].at <= cutoff) { events.splice(i, 1); removed = true; }
    dirty ||= removed;
    for (const [id, state] of live) {
      for (const [tab, at] of state.tabs) if (at <= now() - ONLINE_MS) state.tabs.delete(tab);
      if (!state.tabs.size) live.delete(id);
    }
  };
  const flush = () => {
    prune();
    if (!dirty) return;
    writeFileSync(path + '.tmp', JSON.stringify({ version: 1, events }), { mode: 0o600 });
    renameSync(path + '.tmp', path);
    dirty = false;
  };
  const visitor = (req, res) => {
    if (req.trafficId) return req.trafficId;
    let token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('aetherii_visit='))?.slice('aetherii_visit='.length);
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = randomBytes(32).toString('hex');
      const cookie = `aetherii_visit=${token}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${RETENTION_MS / 1000}${config.PUBLIC_URL?.startsWith('https://') ? '; Secure' : ''}`;
      const existing = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [...(existing ? [].concat(existing) : []), cookie]);
    }
    return req.trafficId = createHash('sha256').update(token).digest('hex');
  };
  const add = (id, type, activeMs = 0) => { events.push({ id, type, at: now(), activeMs }); dirty = true; };
  const summary = () => {
    prune();
    return { online: live.size, unique30d: new Set(events.map(e => e.id)).size };
  };
  const pulse = (req, res, body) => {
    if (!body || !['visit', 'pulse', 'leave'].includes(body.type) || typeof body.tab !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.tab)) {
      throw new Error('Nieprawidłowy pomiar aktywności.');
    }
    prune();
    const id = visitor(req, res), at = now();
    const state = live.get(id) || { tabs: new Map(), accountedAt: at };
    // Overlapping tabs count once. Suspended tabs do not turn hours away into play time.
    const recent = [...state.tabs.values()].some(seen => at - seen <= MAX_GAP_MS);
    const elapsed = recent ? Math.max(0, Math.min(MAX_GAP_MS, at - state.accountedAt)) : 0;
    if (body.type === 'visit' && !state.tabs.has(body.tab)) add(id, 'visit');
    else if (!events.some(e => e.id === id)) add(id, 'visit');
    if (elapsed > 0) add(id, 'activity', elapsed);
    state.accountedAt = at;
    if (body.type === 'leave') state.tabs.delete(body.tab);
    else state.tabs.set(body.tab, at);
    if (state.tabs.size) live.set(id, state); else live.delete(id);
    return summary();
  };
  const login = (req, res) => { prune(); add(visitor(req, res), 'login'); };
  flush();
  const timer = setInterval(() => { try { flush(); } catch { console.error('Nie udało się zapisać statystyk odwiedzin.'); } }, intervalMs);
  timer.unref();
  return { pulse, login, summary, flush, close() { clearInterval(timer); flush(); } };
}
