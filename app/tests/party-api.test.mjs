import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseBotAction } from '../server/bot.mjs';

test('mixed party API reserves seats, enforces host settings, runs three AI players and persists the game', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aetherii-party-')), base = 'http://127.0.0.1:14278';
  let processHandle, logs = '';
  async function start() {
    processHandle = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14278'], { env: { ...process.env, AETHERII_DATA_DIR: directory, AETHERII_BOT_DELAY_MS: '15' }, stdio: 'pipe' });
    processHandle.stderr.on('data', c => { logs += c; });
    await new Promise((resolve, reject) => { processHandle.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); processHandle.once('error', reject); processHandle.once('exit', code => reject(new Error(`Server exited ${code}`))); });
  }
  const stop = () => new Promise(resolve => { processHandle.once('exit', resolve); processHandle.kill('SIGTERM'); });
  async function request(path, body, token) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const action = (path, token, state, action, payload = {}) => request(path + '/action', { revision: state.revision, action, payload }, token);
  const rooms = [];
  await start();
  try {
    for (const bad of [{ boardSize: 24 }, { botCount: -1 }, { botCount: 4 }, { botCount: 1.5 }, { ai: true, botCount: 3 }]) assert.equal((await request('/api/rooms', { name: 'Ala', ...bad })).status, 400);
    for (const [bots, size] of [[1, 19], [2, 23], [3, 25]]) {
      const created = await request('/api/rooms', { name: 'Ala', botCount: bots, boardSize: size, faction: 'humans' }); assert.equal(created.status, 201);
      const { token } = created.body; let s = created.body.state; const path = `/api/rooms/${s.code}`;
      assert.equal(s.botCount, bots); assert.equal(s.humanLimit, 4 - bots); assert.equal(s.boardSize, size); assert.equal(s.phase, 'lobby');
      if (bots < 3) assert.equal((await action(path, token, s, 'start')).status, 400);
      for (let i = 1; i < 4 - bots; i++) {
        const joined = await request(path + '/join', { name: `Znajomy ${i}` }); assert.equal(joined.status, 201);
        assert.equal((await action(path, joined.body.token, joined.body.state, 'configure', { boardSize: 25 })).status, 400);
      }
      assert.equal((await request(path + '/join', { name: 'Nadmiarowy' })).status, 409);
      s = (await request(path, undefined, token)).body;
      const started = await action(path, token, s, 'start'); assert.equal(started.status, 200); s = started.body;
      assert.equal(s.players.length, 4); assert.equal(s.players.filter(p => p.bot).length, bots); assert.equal(new Set(s.players.map(p => p.faction)).size, 4);
      assert.ok(s.players.filter(p => p.bot).every(p => !('token' in p) && p.resources === undefined));
      assert.equal((await action(path, token, s, 'configure', { boardSize: 23 })).status, 400);
      rooms.push({ path, token });
    }
    const { path, token } = rooms[2];
    // The real scheduler plays all three AI factions; the human completes only their own actions.
    let s;
    for (let i = 0; i < 400; i++) {
      s = (await request(path, undefined, token)).body;
      if (s.turn >= 5 && s.active === 0 && s.phase === 'roll') break;
      const decision = chooseBotAction(s);
      if (decision) {
        const result = await action(path, token, s, decision.action, decision.payload);
        assert.ok([200, 409].includes(result.status), JSON.stringify(result.body));
      }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.equal(s.active, 0); assert.equal(s.phase, 'roll'); assert.ok(s.turn >= 5);
    assert.ok(s.log.some(entry => entry.text.startsWith('Produkcja po rzucie')));
    assert.ok(s.log.some(entry => entry.text.includes('Komputer 3')));
    await stop(); await start();
    const restored = (await request(path, undefined, token)).body; assert.deepEqual(restored, s);
    assert.equal(restored.board.tiles.length, 25); assert.equal(restored.players.filter(p => p.bot).length, 3); assert.equal(logs, '');
  } finally { await stop(); }
});
