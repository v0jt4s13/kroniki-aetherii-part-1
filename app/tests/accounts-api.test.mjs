import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Accounts: private email/password sessions, room recovery, guest linking, restart and Google state/PKCE', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aetherii-accounts-')), base = 'http://127.0.0.1:14275'; let proc;
  async function start() {
    proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14275'], { env: { ...process.env, AETHERII_DATA_DIR: dir, PUBLIC_URL: base, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' }, stdio: 'pipe' });
    await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', c => reject(new Error(`Server exited ${c}`))); });
  }
  const stop = () => new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  async function req(path, body, cookie = '', token = '') {
    const r = await fetch(base + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie, Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: r.status === 302 ? null : await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
  }
  await start();
  try {
    assert.equal((await req('/api/account')).body.user, null);
    assert.equal((await req('/api/auth/register', { name: 'Ala', email: 'bad', password: 'x' })).status, 400);
    const a = await req('/api/auth/register', { name: 'Ala', email: 'Ala@Example.com', password: 'Aetherii-password-123' });
    assert.equal(a.status, 200); assert.equal(a.body.user.email, 'ala@example.com');
    assert.match(a.headers.get('set-cookie'), /HttpOnly/); assert.match(a.headers.get('set-cookie'), /SameSite=Lax/);
    assert.equal(a.body.user.hash, undefined);
    assert.equal((await req('/api/auth/register', { name: 'Inna', email: 'ala@example.com', password: 'Another-password' })).status, 400);
    assert.equal((await req('/api/auth/login', { email: 'ala@example.com', password: 'wrong' })).status, 401);
    const game = await req('/api/rooms', { name: 'Ignored' }, a.cookie);
    assert.equal(game.body.state.accountLinked, true); assert.equal(game.body.state.players[0].name, 'Ala');
    const code = game.body.state.code, roomToken = game.body.token;
    assert.equal((await req(`/api/rooms/${code}`, undefined, '', roomToken)).status, 401);
    assert.equal((await req('/api/account', undefined, a.cookie)).body.rooms.length, 1);
    await req('/api/auth/logout', {}, a.cookie);
    assert.equal((await req('/api/account', undefined, a.cookie)).body.user, null);
    const login = await req('/api/auth/login', { email: 'ala@example.com', password: 'Aetherii-password-123' });
    const resumed = await req('/api/account/resume', { code }, login.cookie);
    assert.equal(resumed.body.token, roomToken); assert.equal(resumed.body.state.me, game.body.state.me);
    const duplicate = await req(`/api/rooms/${code}/join`, {}, login.cookie);
    assert.equal(duplicate.body.state.players.length, 1);
    const other = await req('/api/auth/register', { name: 'Bartek', email: 'bartek@example.com', password: 'Aetherii-password-456' });
    assert.equal((await req('/api/account/resume', { code }, other.cookie)).status, 403);
    assert.equal((await req(`/api/rooms/${code}`, undefined, other.cookie, roomToken)).status, 401);
    const guest = await req('/api/rooms', { name: 'Gość' });
    assert.equal((await req('/api/account/link', { code: guest.body.state.code, token: 'wrong' }, login.cookie)).status, 403);
    assert.equal((await req('/api/account/link', { code: guest.body.state.code, token: guest.body.token }, login.cookie)).body.state.accountLinked, true);
    const data = readFileSync(join(dir, 'accounts.json'), 'utf8');
    assert.ok(!data.includes('Aetherii-password')); assert.ok(!data.includes(login.cookie.split('=')[1]));
    await stop(); await start();
    assert.equal((await req('/api/account', undefined, login.cookie)).body.rooms.length, 2);
    assert.equal((await req('/api/account/resume', { code }, login.cookie)).status, 200);
    const google = await req(`/api/auth/google?room=${code}`);
    assert.equal(google.status, 302);
    const url = new URL(google.headers.get('location'));
    assert.equal(url.hostname, 'accounts.google.com'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), base + '/api/auth/google/callback');
    assert.ok(url.searchParams.get('nonce')); assert.ok(url.searchParams.get('scope').includes('email'));
    const state = url.searchParams.get('state');
    assert.equal((await req(`/api/auth/google/callback?state=${state}&error=access_denied`)).status, 400);
    const denied = await req(`/api/auth/google/callback?state=${state}&error=access_denied`, undefined, google.cookie);
    assert.equal(denied.status, 302); assert.match(denied.headers.get('location'), /auth=cancelled/);
    assert.equal((await req(`/api/auth/google/callback?state=${state}&error=access_denied`, undefined, google.cookie)).status, 400);
    const crossOrigin = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'http://evil.invalid', Cookie: login.cookie }, body: '{}' });
    assert.equal(crossOrigin.status, 403);
  } finally { await stop(); }
});
