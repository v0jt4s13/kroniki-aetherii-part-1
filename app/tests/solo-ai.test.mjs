import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseBotAction } from '../server/bot.mjs';

test('solo AI supports 1–3 distinct factions on every board, rejects invalid counts and restores parties', { timeout: 20000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'aetherii-solo-')), base = 'http://127.0.0.1:14294'; let proc;
  async function start() {
    proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14294'], { env: { ...process.env, AETHERII_DATA_DIR: dir, AETHERII_BOT_DELAY_MS: '10' }, stdio: 'pipe' });
    await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', c => reject(new Error('Server exit ' + c))); });
  }
  const stop = () => !proc || proc.exitCode !== null ? Promise.resolve() : new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
  t.after(async () => { await stop(); rmSync(dir, { recursive: true, force: true }); });
  const create = body => fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ala', ai: true, ...body }) });
  const read = game => fetch(base + '/api/rooms/' + game.state.code, { headers: { Authorization: 'Bearer ' + game.token } }).then(r => r.json());
  await start(); const games = [];
  for (const aiCount of [1, 2, 3]) for (const boardSize of [19, 23, 25]) {
    const response = await create({ aiCount, boardSize }); assert.equal(response.status, 201);
    const game = await response.json(); const s = game.state; games.push(game);
    assert.equal(s.players.length, aiCount + 1); assert.equal(s.botCount, aiCount); assert.equal(s.humanLimit, 1); assert.equal(s.maxPlayers, aiCount + 1);
    assert.equal(s.board.tiles.length, boardSize); assert.equal(s.players.filter(p => p.bot).length, aiCount);
    assert.equal(new Set(s.players.map(p => p.faction)).size, aiCount + 1);
    assert.equal(s.phase, 'setup-settlement');
  }
  for (const aiCount of [0, 4, -1, 1.5, '2', null]) assert.equal((await create({ aiCount })).status, 400);
  const game = games.at(-1); let finished = false;
  for (let i = 0; i < 250; i++) {
    const s = await read(game);
    if (!s.phase.startsWith('setup')) {
      for (const p of s.players) assert.equal(s.board.vertices.filter(v => v.owner === p.id).length, 2);
      finished = true; break;
    }
    if (s.players[s.active].id === s.me) {
      const move = chooseBotAction(s); assert.ok(move);
      const response = await fetch(base + '/api/rooms/' + s.code + '/action', { method: 'POST', headers: { Authorization: 'Bearer ' + game.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...move, revision: s.revision }) });
      assert.equal(response.status, 200);
    } else await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(finished, 'four-player snake setup completes');
  await stop(); await start();
  for (const game of games) { const s = await read(game); assert.equal(s.players.length, game.state.players.length); assert.equal(s.maxPlayers, game.state.maxPlayers); }
});
