import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTraffic, RETENTION_MS, ONLINE_MS } from '../server/traffic.mjs';
import { createAccounts } from '../server/accounts.mjs';
import { OAuth2Client } from 'google-auth-library';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aetherii-traffic-'));
  const path = join(dir, 'traffic.json'); let clock = 1800000000000;
  const config = { PUBLIC_URL: 'https://example.org/kroniki-aetherii' };
  const open = () => createTraffic(path, { config, now: () => clock, intervalMs: 1000000 });
  const analytics = open();
  t.after(() => { analytics.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, path, config, analytics, open, advance(ms) { clock += ms; }, clock: () => clock };
}
const request = (cookie = '') => ({ headers: { cookie }, socket: { remoteAddress: '203.0.113.9' } });
function response() {
  const headers = {};
  return { headers, setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; }, writeHead(status, values) { this.status = status; Object.entries(values).forEach(([k, v]) => this.setHeader(k, v)); }, end() {} };
}
const body = (type = 'visit', tab = 'tab-000000000000001') => ({ type, tab });
const cookieOf = res => [].concat(res.getHeader('Set-Cookie')).find(s => s.startsWith('aetherii_visit=')).split(';')[0];

test('anonymous visits deduplicate browsers/tabs, measure overlapping time once and expire online presence', t => {
  const f = fixture(t), r = response();
  assert.deepEqual(f.analytics.pulse(request(), r, body()), { online: 1, unique30d: 1 });
  const cookie = cookieOf(r);
  assert.match(r.headers['set-cookie'][0], /Path=\/kroniki-aetherii\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  f.advance(15000);
  f.analytics.pulse(request(cookie), response(), body('visit', 'tab-000000000000002'));
  f.advance(15000);
  f.analytics.pulse(request(cookie), response(), body('pulse'));
  assert.deepEqual(f.analytics.summary(), { online: 1, unique30d: 1 });
  f.analytics.pulse(request(cookie), response(), body('leave'));
  assert.equal(f.analytics.summary().online, 1, 'other visible tab remains online');
  f.advance(10000);
  f.analytics.pulse(request(cookie), response(), body('leave', 'tab-000000000000002'));
  assert.equal(f.analytics.summary().online, 0);
  f.analytics.pulse(request(), response(), body());
  assert.equal(f.analytics.summary().unique30d, 2);
  f.advance(ONLINE_MS);
  assert.equal(f.analytics.summary().online, 0);
  f.analytics.pulse(request(cookie), response(), body('pulse'));
  f.analytics.flush();
  const data = JSON.parse(readFileSync(f.path));
  assert.equal(data.events.reduce((n, e) => n + e.activeMs, 0), 40000);
  assert.ok(!readFileSync(f.path, 'utf8').includes(cookie.split('=')[1]));
  assert.ok(!readFileSync(f.path, 'utf8').includes('203.0.113.9'));
  assert.equal(statSync(f.path).mode & 0o777, 0o600);
});

test('file survives restart and removes events at the rolling 30-day boundary, including at startup', t => {
  const f = fixture(t);
  f.analytics.pulse(request(), response(), body()); f.analytics.flush();
  const reopened = f.open();
  assert.deepEqual(reopened.summary(), { online: 0, unique30d: 1 }); reopened.close();
  f.advance(RETENTION_MS);
  const expired = f.open();
  assert.deepEqual(expired.summary(), { online: 0, unique30d: 0 });
  assert.deepEqual(JSON.parse(readFileSync(f.path)).events, []); expired.close();
});

test('retention runs without new traffic', async t => {
  const f = fixture(t); f.analytics.close();
  writeFileSync(f.path, JSON.stringify({ version: 1, events: [{ id: 'old', at: f.clock(), type: 'visit', activeMs: 0 }] }));
  let clock = f.clock();
  const analytics = createTraffic(f.path, { now: () => clock, intervalMs: 10 });
  t.after(() => analytics.close()); clock += RETENTION_MS;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(JSON.parse(readFileSync(f.path)).events, []);
});

test('invalid pulse is rejected before visitor creation', t => {
  const f = fixture(t), res = response();
  assert.throws(() => f.analytics.pulse(request(), res, { type: 'pulse', tab: '../../bad' }));
  assert.throws(() => f.analytics.pulse(request(), res, null));
  assert.equal(res.getHeader('Set-Cookie'), undefined);
  assert.deepEqual(f.analytics.summary(), { online: 0, unique30d: 0 });
});

test('successful password/Google sessions count logins without account data or cookie loss; failed logins do not', async t => {
  const f = fixture(t), initial = response();
  f.analytics.pulse(request(), initial, body()); const cookie = cookieOf(initial);
  const config = { ...f.config, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'secret' };
  const accounts = createAccounts(join(f.dir, 'accounts.json'), config, f.analytics.login);
  const registered = response();
  await accounts.register(request(cookie), registered, { email: 'person@example.org', name: 'Secret Name', password: 'a-long-password' });
  await assert.rejects(accounts.login(request(cookie), response(), { email: 'person@example.org', password: 'wrong' }));
  await accounts.login(request(cookie), response(), { email: 'person@example.org', password: 'a-long-password' });
  const start = response(); accounts.googleStart(request(cookie), start, new URL('https://example.org/api/auth/google'));
  const url = new URL(start.headers.location);
  t.mock.method(OAuth2Client.prototype, 'getToken', async () => ({ tokens: { id_token: 'token' } }));
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => ({ sub: 'google-user-id', email: 'google@example.org', email_verified: true, nonce: url.searchParams.get('nonce'), name: 'Google Name' }) }));
  const finish = response();
  await accounts.googleFinish(request(cookie + '; ' + start.headers['set-cookie'].split(';')[0]), finish, new URL('https://example.org/api/auth/google/callback?state=' + url.searchParams.get('state') + '&code=ok'));
  assert.equal(finish.status, 302);
  assert.ok(finish.headers['set-cookie'].every(c => typeof c === 'string'));
  f.analytics.flush(); const text = readFileSync(f.path, 'utf8'), events = JSON.parse(text).events;
  assert.equal(events.filter(e => e.type === 'login').length, 3);
  assert.equal(f.analytics.summary().unique30d, 1);
  for (const value of ['person@example.org', 'google@example.org', 'Secret Name', 'google-user-id', '203.0.113.9', 'a-long-password']) assert.ok(!text.includes(value));
  const withoutVisitor = response();
  await accounts.login(request(), withoutVisitor, { email: 'person@example.org', password: 'a-long-password' });
  assert.equal(withoutVisitor.headers['set-cookie'].length, 2);
  assert.ok(withoutVisitor.headers['set-cookie'][0].startsWith('catan_session='));
});
