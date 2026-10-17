import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { createAccounts } from '../server/accounts.mjs';

const req = (cookie = '') => ({ headers: { cookie }, socket: { remoteAddress: 'test' } });
function res() { const headers = {}; return { headers, setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; }, writeHead(status, h) { this.status = status; Object.entries(h).forEach(([k, v]) => this.setHeader(k, v)); }, end() {} }; }
const config = { PUBLIC_URL: 'https://aetherii.example', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'secret' };
const create = () => createAccounts(join(mkdtempSync(join(tmpdir(), 'aetherii-google-')), 'accounts.json'), config);
function begin(a, cookie = '') {
  const r = res(); a.googleStart(req(cookie), r, new URL('https://aetherii.example/api/auth/google'));
  const u = new URL(r.headers.location); return { nonce: u.searchParams.get('nonce'), state: u.searchParams.get('state'), cookie: r.headers['set-cookie'].split(';')[0] };
}

test('Google callback verifies ID-token audience/nonce and creates a Secure session; linking requires existing authentication', async t => {
  const a = create(); let claims;
  t.mock.method(OAuth2Client.prototype, 'getToken', async function(options) { assert.ok(options.codeVerifier); assert.equal(options.code, 'test-code'); return { tokens: { id_token: 'verified-test-token' } }; });
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async function(options) { assert.equal(options.audience, config.GOOGLE_CLIENT_ID); assert.equal(options.idToken, 'verified-test-token'); return { getPayload: () => claims }; });
  let flow = begin(a); claims = { sub: 'google-id', email: 'google@example.com', email_verified: true, name: 'Google Gracz', nonce: flow.nonce };
  const r = res(); await a.googleFinish(req(flow.cookie), r, new URL(`https://aetherii.example/api/auth/google/callback?state=${flow.state}&code=test-code`));
  assert.equal(r.status, 302); const cookie = r.headers['set-cookie'][0].split(';')[0];
  assert.match(r.headers['set-cookie'][0], /Secure/); assert.equal(a.session(req(cookie)).googleId, 'google-id');
  flow = begin(a); claims.nonce = 'wrong';
  await assert.rejects(a.googleFinish(req(flow.cookie), res(), new URL(`https://aetherii.example/api/auth/google/callback?state=${flow.state}&code=test-code`)), /tożsamości/);
  const localRes = res(); const local = await a.register(req(), localRes, { email: 'local@example.com', name: 'Ala', password: 'Local-password-123' });
  const localCookie = localRes.headers['set-cookie'].split(';')[0];
  flow = begin(a); claims = { sub: 'new-google', email: local.email, email_verified: true, nonce: flow.nonce };
  const collision = res(); await a.googleFinish(req(flow.cookie), collision, new URL(`https://aetherii.example/api/auth/google/callback?state=${flow.state}&code=test-code`));
  assert.match(collision.headers.location, /use-password/); assert.equal(local.googleId, undefined);
  flow = begin(a, localCookie); claims.nonce = flow.nonce;
  const linked = res();
  await a.googleFinish(req(`${flow.cookie}; ${localCookie}`), linked, new URL(`https://aetherii.example/api/auth/google/callback?state=${flow.state}&code=test-code`));
  assert.equal(local.googleId, 'new-google'); assert.equal(local.id, a.session(req(linked.headers['set-cookie'][0].split(';')[0])).id);
  assert.equal(a.session(req(localCookie)), null);
});

test('registration throttles repeated invalid attempts before password hashing', async () => {
  const a = create();
  for (let i = 0; i < 10; i++) await assert.rejects(a.register(req(), res(), {}), /e-mail/);
  await assert.rejects(a.register(req(), res(), {}), e => e.status === 429);
});
