import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createRoom, player } from '../server/engine.mjs';

test('API: capacity, identity, hidden hands, stale actions, atomic failures and persisted restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'catan-test-'));
  const legacy = createRoom('OLD123', 'Stary gracz'); legacy.players.push(player('Drugi gracz', 1));
  delete legacy.rulesVersion; legacy.players.forEach(p => { delete p.faction; delete p.heroPoints; });
  const originalBarren = legacy.board.tiles.find(t => t.resource === 'desert');
  if (originalBarren.id !== 0) { originalBarren.resource = legacy.board.tiles[0].resource; originalBarren.number = legacy.board.tiles[0].number; }
  legacy.board.tiles[0].resource = 'desert'; legacy.board.tiles[0].number = 0;
  legacy.players[0].cards = [{ id: 'old-knight', type: 'knight', bought: 0 }]; legacy.deck = ['knight'];
  const legacyData = JSON.stringify({ OLD123: legacy }); writeFileSync(join(directory, 'rooms.json'), legacyData);
  const port = 14273, base = `http://127.0.0.1:${port}`;
  let proc;
  async function start() {
    proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', `${port}`], { cwd: process.cwd(), env: { ...process.env, CATAN_DATA_DIR: directory }, stdio: 'pipe' });
    await new Promise((resolve, reject) => { proc.stdout.on('data', chunk => { if (chunk.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.on('error', reject); proc.on('exit', code => { if (code) reject(new Error(`Server exited ${code}`)); }); });
  }
  const stop = () => new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  async function request(path, body, token) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  await start();
  try {
    assert.equal(readFileSync(join(directory, 'rooms.pre-aetherii.json'), 'utf8'), legacyData);
    const migrated = (await request('/api/rooms/OLD123', undefined, legacy.players[0].token)).body;
    assert.equal(migrated.rulesVersion, 'aetherii-1'); assert.equal(migrated.players[0].faction, 'dwarves');
    assert.equal(migrated.players[0].cards[0].type, 'ward'); assert.equal(migrated.board.tiles[0].resource, 'desert'); assert.equal(migrated.board.tiles[0].number, 0);
    assert.equal(migrated.threat, 0); assert.equal(migrated.raid, null);
    const created = await request('/api/rooms', { name: 'Ala' }); assert.equal(created.status, 201);
    const { token, state } = created.body; const path = `/api/rooms/${state.code}`;
    assert.equal((await request(path)).status, 401);
    const players = [];
    for (const name of ['Bartek', 'Celina', 'Dawid']) { const next = await request(path + '/join', { name }); assert.equal(next.status, 201); players.push(next.body); }
    assert.equal((await request(path + '/join', { name: 'Piąty' })).status, 409);
    const snapshot = (await request(path, undefined, token)).body;
    assert.equal(snapshot.players.length, 4);
    assert.ok(!JSON.stringify(snapshot).includes(players[0].token));
    assert.equal(snapshot.players[1].resources, undefined); assert.equal(snapshot.players[1].cards, undefined);
    assert.equal((await request(path + '/action', { revision: snapshot.revision, action: 'start' }, players[0].token)).status, 400);
    const started = await request(path + '/action', { revision: snapshot.revision, action: 'start' }, token); assert.equal(started.status, 200);
    assert.equal((await request(path + '/action', { revision: snapshot.revision, action: 'start' }, token)).status, 409);
    const before = readFileSync(join(directory, 'rooms.json'), 'utf8');
    const invalid = await request(path + '/action', { revision: started.body.revision, action: 'build', payload: { type: 'road', id: -1 } }, token);
    assert.equal(invalid.status, 400); assert.equal(readFileSync(join(directory, 'rooms.json'), 'utf8'), before);
    // Hold two request bodies open so both headers arrive at the same revision.
    const concurrent = started.body.legal.settlements.slice(0, 2).map(id => {
      const data = JSON.stringify({ revision: started.body.revision, action: 'build', payload: { type: 'settlement', id } });
      let request;
      const result = new Promise((resolve, reject) => {
        request = http.request(base + path + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${token}` } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject); request.flushHeaders();
      });
      return { request, data, result };
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    concurrent.forEach(x => x.request.end(x.data));
    assert.deepEqual((await Promise.all(concurrent.map(x => x.result))).sort(), [200, 409]);
    const latest = (await request(path, undefined, token)).body;
    assert.equal(latest.revision, started.body.revision + 1);
    assert.equal(latest.board.vertices.filter(v => v.owner).length, 1);
    await stop(); await start();
    assert.equal(readFileSync(join(directory, 'rooms.pre-aetherii.json'), 'utf8'), legacyData);
    const restored = await request(path, undefined, token); assert.equal(restored.status, 200); assert.deepEqual(restored.body, latest);
    const page = await fetch(base + '/'); assert.equal(page.status, 200); assert.ok((await page.text()).includes('Kroniki Aetherii'));
    const asset = await fetch(base + '/game/forest.webp'); assert.equal(asset.status, 200); assert.equal(asset.headers.get('content-type'), 'image/webp');
    const forbidden = await fetch(base + path + '/action', { method: 'POST', headers: { Origin: 'http://evil.invalid', Authorization: `Bearer ${token}` }, body: '{}' }); assert.equal(forbidden.status, 403);
  } finally { await stop(); }
});
