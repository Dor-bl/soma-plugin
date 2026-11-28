import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existingAncestor, installFolder, isInstalled, NEEDED_BYTES, verdict } from './disk-space.mjs';

// Same fallback as the launcher: empty or a literal placeholder means the plugin's .runtime/
const runtime = fileURLToPath(new URL('../.runtime/', import.meta.url));
for (const unset of [undefined, '', '${CLAUDE_PLUGIN_DATA}']) assert.equal(installFolder(unset), runtime, `${unset}`);
assert.equal(installFolder('/data/soma'), resolve('/data/soma'));

// A folder that does not exist yet is measured at its nearest existing parent
const real = new Set([resolve('/'), resolve('/home'), resolve('/home/tester')]);
assert.equal(existingAncestor('/home/tester/.claude/plugins/data/soma', (p) => real.has(p)), resolve('/home/tester'));
assert.equal(existingAncestor('/home/tester', (p) => real.has(p)), resolve('/home/tester'));
assert.equal(existingAncestor('/nowhere/at/all', () => false), resolve('/'));

// OK at or above the need; below it, LOW before the first install and WARN after it
assert.equal(verdict(NEEDED_BYTES, false, '/x').level, 'OK');
assert.match(verdict(5 * 1024 ** 3, false, '/x').line, /^OK: 5\.0 GB free on \/x\.$/);
assert.equal(verdict(NEEDED_BYTES - 1, true, '/x').level, 'WARN');
const low = verdict(300 * 1024 ** 2, false, '/x');
assert.equal(low.level, 'LOW');
assert.match(low.line, /^LOW: only 0\.3 GB free on \/x; .*needs about 1\.0 GB/);

// An empty data folder holds no install
const empty = mkdtempSync(join(tmpdir(), 'soma-disk-'));
try {
  assert.equal(isInstalled(empty), false);
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./disk-space.mjs', import.meta.url)), join(empty, 'not-yet')], { encoding: 'utf8', timeout: 30_000 });
  assert.match(run.stdout, /^(OK|LOW|UNKNOWN): /, run.stderr);
  assert.equal(run.status, run.stdout.startsWith('LOW') ? 1 : 0);
  assert.ok(run.stdout.includes(empty), `measures the existing parent ${empty}: ${run.stdout}`);
} finally {
  rmSync(empty, { recursive: true, force: true });
}

console.log('disk-space tests passed');
