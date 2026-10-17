import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseBotAction } from '../server/bot.mjs';

test('AI API: two players, automatic setup/turns and resume after restart without a browser', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'catan-ai-'));
  const base = 'http://127.0.0.1:14274'; let proc, logs = '';
  async function start() {
    proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14274'], { env: { ...process.env, CATAN_DATA_DIR: directory, CATAN_BOT_DELAY_MS: '20' }, stdio: 'pipe' });
    proc.stderr.on('data', c => { logs += c; });
    await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', code => reject(new Error(`Server exited ${code}`))); });
  }
  const stop = () => new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  let token, path;
  async function request(route, body, auth = token) {
    const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  }
  async function waitFor(predicate) {
    for (let i = 0; i < 150; i++) {
      const { body } = await request(path); if (predicate(body)) return body;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('AI did not complete its actions');
  }
  async function move(s, decision = chooseBotAction(s)) {
    const r = await request(path + '/action', { revision: s.revision, ...decision });
    assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body;
  }
  await start();
  try {
    const r = await request('/api/rooms', { name: 'Ala', ai: true }); assert.equal(r.status, 201);
    token = r.body.token; let s = r.body.state; path = `/api/rooms/${s.code}`;
    assert.equal(s.ai, true); assert.equal(s.maxPlayers, 2); assert.equal(s.players.length, 2);
    assert.equal(s.players[1].bot, true); assert.equal(s.phase, 'setup-settlement');
    assert.equal(s.players[1].resources, undefined); assert.equal(s.players[1].cards, undefined);
    assert.ok(s.players.every(p => !('token' in p))); assert.equal((await request(path, undefined, 'null')).status, 401);
    assert.equal((await request(path + '/join', { name: 'Trzeci' })).status, 409);
    s = await move(s); s = await move(s);
    await stop(); await start();
    // No browser is connected. The restored server still completes AI setup.
    s = await waitFor(s => s.active === 0 && s.phase === 'setup-settlement');
    assert.equal(s.board.vertices.filter(v => v.owner === s.players[1].id).length, 2);
    while (s.phase.startsWith('setup')) {
      if (s.players[s.active].id === s.me) s = await move(s);
      else s = await waitFor(s => s.players[s.active].id === s.me);
    }
    assert.equal(s.phase, 'roll');
    for (const p of s.players) assert.equal(s.board.vertices.filter(v => v.owner === p.id).length, 2);
    s = await move(s);
    while (s.phase !== 'main') { s = await move(s); }
    const rollSummary = structuredClone(s.lastRoll);
    await stop(); await start(); s = (await request(path)).body;
    assert.deepEqual(s.lastRoll, rollSummary);
    const humanTurn = s.turn;
    s = await move(s, { action: 'end', payload: {} });
    s = await waitFor(s => s.active === 0 && s.phase === 'roll');
    assert.equal(s.turn, humanTurn + 2); assert.ok(s.log.some(x => JSON.stringify(x).includes('Komputer')));
    assert.equal(logs, '');
  } finally { await stop(); }
});
