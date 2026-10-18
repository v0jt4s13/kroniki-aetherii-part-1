import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicBasePath } from '../server/base-path.mjs';

test('PUBLIC_URL accepts root and nested deployment paths and rejects unsafe paths', () => {
  assert.equal(publicBasePath({}), '');
  assert.equal(publicBasePath({ PUBLIC_URL: 'https://example.org/' }), '');
  assert.equal(publicBasePath({ PUBLIC_URL: 'https://example.org/games/aetherii/' }), '/games/aetherii');
  assert.throws(() => publicBasePath({ PUBLIC_URL: 'https://example.org/bad%22path' }));
});

test('prefixed production routes preserve assets, accounts, rooms and OAuth return paths', { timeout: 20000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'aetherii-prefix-'));
  const origin = 'http://127.0.0.1:14285', prefix = '/kroniki-aetherii', base = origin + prefix;
  const proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14285'], {
    env: { ...process.env, AETHERII_DATA_DIR: dir, PUBLIC_URL: base, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' }, stdio: 'pipe',
  });
  t.after(async () => {
    if (proc.exitCode === null) await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', data => { if (data.toString().includes('Kroniki Aetherii:')) resolve(); });
    proc.once('error', reject); proc.once('exit', code => reject(new Error(`Server exited ${code}`)));
  });
  const redirect = await fetch(base + '?room=ABC123', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), prefix + '/?room=ABC123');
  assert.equal((await fetch(origin + '/api/health')).status, 200, 'Docker healthcheck remains available');
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '-other/api/health')).status, 404);
  const html = await (await fetch(base + '/')).text();
  assert.ok(html.includes(`<base href="${prefix}/">`));
  for (const [, path] of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) {
    const asset = await fetch(new URL(path, base + '/'));
    assert.equal(asset.status, 200, path);
    assert.ok(!asset.headers.get('content-type').includes('text/html'), path);
    if (path.endsWith('.css')) {
      const css = await asset.text();
      for (const [, resource] of css.matchAll(/url\((?:["']?)(\.\.\/game\/[^)"']+)/g)) {
        assert.equal((await fetch(new URL(resource, asset.url))).status, 200, resource);
      }
    }
  }
  const registered = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ala', email: 'prefix@example.org', password: 'Prefix-password-123' }) });
  assert.equal(registered.status, 200);
  assert.match(registered.headers.get('set-cookie'), /Path=\/kroniki-aetherii\//);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  const room = await fetch(base + '/api/rooms', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ala' }) });
  assert.equal(room.status, 201);
  const code = (await room.json()).state.code;
  assert.equal((await (await fetch(base + '/api/account', { headers: { Cookie: cookie } })).json()).rooms[0].code, code);
  const google = await fetch(base + '/api/auth/google?room=' + code, { redirect: 'manual' });
  assert.equal(google.status, 302);
  const auth = new URL(google.headers.get('location'));
  assert.equal(auth.searchParams.get('redirect_uri'), base + '/api/auth/google/callback');
  const denied = await fetch(base + '/api/auth/google/callback?error=access_denied&state=' + auth.searchParams.get('state'), { redirect: 'manual', headers: { Cookie: google.headers.get('set-cookie').split(';')[0] } });
  assert.equal(denied.headers.get('location'), `${prefix}/?room=${code}&auth=cancelled`);
});
