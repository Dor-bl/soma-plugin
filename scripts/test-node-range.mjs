import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeRange, nodeProblem, parseRange, satisfies, supportedRange } from './node-range.mjs';

// Only ^X.Y.Z and >=X.Y.Z terms joined by || are accepted
for (const bad of [undefined, '', '>=22', '~22.19.0', '22.19.0', '>=22.19.0 <23', '^22.19.0 ||', '>= 22.19.0x']) {
  assert.throws(() => parseRange(bad), `${bad} should be rejected`);
}
assert.deepEqual(parseRange('^22.19.0 || >=24.0.0'), [{ op: '^', min: [22, 19, 0] }, { op: '>=', min: [24, 0, 0] }]);

const today = '^22.19.0 || >=24.0.0';
const cases = {
  '20.19.0': false, '22.0.0': false, '22.18.9': false, '22.19.0': true, 'v22.23.4': true,
  '23.0.0': false, '23.11.1': false, '24.0.0': true, '25.2.0': true, '27.0.0': true,
  // As in semver, a prerelease or nightly comes before its release and satisfies none of these
  '22.19.0-nightly20261101': false, 'v22.20.0-rc.1': false, 'v24.0.0-rc.1': false, 'v26.0.0-nightly20270101': false,
  // Build metadata is ignored
  'v22.19.0+build.5': true,
};
for (const [version, expected] of Object.entries(cases)) assert.equal(satisfies(version, today), expected, `${version} vs ${today}`);

// Upper bounds per major, as webdriver 10 needs
const wdio = '^22.23.4 || ^24.22.1 || >=26.12.1';
for (const [version, expected] of Object.entries({ '22.23.3': false, '22.23.4': true, '24.22.0': false, '24.22.1': true, '25.9.0': false, '26.12.0': false, '26.12.1': true, '28.0.0': true })) {
  assert.equal(satisfies(version, wdio), expected, `${version} vs ${wdio}`);
}

assert.equal(describeRange(today), '22.19 or newer within Node 22, or 24 or newer');
assert.equal(describeRange(wdio), '22.23.4 or newer within Node 22, 24.22.1 or newer within Node 24, or 26.12.1 or newer');
assert.equal(describeRange('^24.0.0'), 'any Node 24');
assert.equal(nodeProblem('v22.19.0', today), null);
assert.match(nodeProblem('v23.11.1', today), /^Node\.js v23\.11\.1 is not supported .*22\.19 or newer within Node 22, or 24 or newer \(\^22\.19\.0 \|\| >=24\.0\.0\)/);

// The rejection is built without newer built-ins (here Array.prototype.at, missing before
// Node 16.6), so it explains itself on the old runtimes it rejects instead of throwing
const oldRuntime = spawnSync(process.execPath, [
  '--import', 'data:text/javascript,delete Array.prototype.at;delete String.prototype.at;delete String.prototype.replaceAll',
  '--input-type=module', '-e',
  `import { nodeProblem } from ${JSON.stringify(new URL('./node-range.mjs', import.meta.url).href)}; console.log(nodeProblem('v16.5.0', '${wdio}'))`,
], { encoding: 'utf8', timeout: 30_000 });
assert.equal(oldRuntime.status, 0, oldRuntime.stderr);
assert.match(oldRuntime.stdout, /^Node\.js v16\.5\.0 is not supported .*26\.12\.1 or newer \(/);

// The committed range parses, and the Node running the checks satisfies it
assert.doesNotThrow(() => parseRange(supportedRange()));
assert.equal(nodeProblem(process.version, supportedRange()), null, `CI's Node ${process.version} should be supported`);
console.log('✔ supportedNode parses and versions are checked against it');

// Run directly, it reports, also when the plugin folder is reached through a link (a junction
// on Windows, which needs no extra rights; a directory symlink elsewhere)
const linkRoot = mkdtempSync(join(tmpdir(), 'soma-node-range-link-'));
try {
  const link = join(linkRoot, 'scripts');
  symlinkSync(fileURLToPath(new URL('.', import.meta.url)), link, 'junction');
  for (const script of [fileURLToPath(new URL('./node-range.mjs', import.meta.url)), join(link, 'node-range.mjs')]) {
    const direct = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(direct.status, 0, `${script}: ${direct.stderr}`);
    assert.match(direct.stdout, /^OK: Node\.js v\d+\.\d+\.\d+ is supported/, `${script} printed nothing`);
  }
} finally {
  rmSync(linkRoot, { recursive: true, force: true });
}
console.log('✔ node-range.mjs reports when run directly, also through a linked folder');

// The launcher refuses an unsupported Node before it installs or writes anything
const data = mkdtempSync(join(tmpdir(), 'soma-node-range-'));
try {
  const fakeOld = 'data:text/javascript,Object.defineProperty(process,"version",{value:"v22.11.0"})';
  const run = spawnSync(process.execPath, ['--import', fakeOld, fileURLToPath(new URL('./start-appium-mcp.mjs', import.meta.url))], {
    env: { ...process.env, SOMA_DATA_DIR: data }, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(run.status, 1, `launcher exit code (stderr: ${run.stderr})`);
  assert.match(run.stderr, /\[soma\] Node\.js v22\.11\.0 is not supported/);
  assert.deepEqual(readdirSync(data), [], 'the launcher wrote into its data folder');
} finally {
  rmSync(data, { recursive: true, force: true });
}
console.log('✔ the launcher stops on an unsupported Node before installing anything');
