import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('AETHERII_DATA_DIR takes precedence and legacy deployments retain their data path', { timeout: 15000 }, async () => {
  for (const mode of ['new', 'legacy', 'both']) {
    const root = mkdtempSync(join(tmpdir(), 'aetherii-env-'));
    const current = join(root, 'current'), legacy = join(root, 'legacy');
    const proc = spawn(process.execPath, ['server/start.mjs', '--production', '--host', '127.0.0.1', '--port', '14293'], { env: { ...process.env, AETHERII_DATA_DIR: mode === 'legacy' ? undefined : current, CATAN_DATA_DIR: mode === 'new' ? undefined : legacy }, stdio: 'pipe' });
    try {
      await new Promise((resolve, reject) => { proc.stdout.on('data', c => { if (c.toString().includes('Kroniki Aetherii:')) resolve(); }); proc.once('error', reject); proc.once('exit', c => reject(new Error('Server exit ' + c))); });
      assert.ok(existsSync(join(mode === 'legacy' ? legacy : current, 'traffic.json')));
      assert.ok(!existsSync(mode === 'legacy' ? current : legacy));
    } finally {
      if (proc.exitCode === null) await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
      rmSync(root, { recursive: true, force: true });
    }
  }
});
