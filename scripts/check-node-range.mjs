#!/usr/bin/env node
// Checks supportedNode in runtime/package.json against the installed appium-mcp runtime:
// - every runtime package in the lockfile must accept every Node version supportedNode allows,
//   so a bump that needs a newer Node fails here until supportedNode is raised;
// - node-range.mjs must agree with the semver package on versions around each bound.
// Needs the install that mcp-smoke.mjs (or the plugin) made: it uses that install's semver.
// CLAUDE_PLUGIN_DATA selects the install folder, as for mcp-smoke.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRange, satisfies, supportedRange } from './node-range.mjs';

const runtimeDir = fileURLToPath(new URL('../runtime/', import.meta.url));
const lockBytes = readFileSync(join(runtimeDir, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
// Same folder the launcher installs into (start-appium-mcp.mjs)
const dataDir = process.env.CLAUDE_PLUGIN_DATA || fileURLToPath(new URL('../.runtime/', import.meta.url));
const installDir = join(dataDir, `appium-mcp-${createHash('sha256').update(lockBytes).digest('hex').slice(0, 16)}`);
if (!existsSync(join(installDir, 'node_modules', 'semver'))) {
  console.error(`✘ no runtime install with semver in ${installDir}; run scripts/mcp-smoke.mjs first`);
  process.exit(1);
}
const semver = createRequire(join(installDir, 'package.json'))('semver');
const range = supportedRange(runtimeDir);
let failed = false;

// 1. Every runtime package accepts the whole supported range. Optional packages (sharp,
// applesign) are skipped: npm installs them only where they work, and the server runs without them.
const narrower = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  const needs = pkg.engines?.node;
  if (!path || pkg.dev || pkg.optional || pkg.devOptional || typeof needs !== 'string') continue;
  let ok;
  try {
    ok = semver.subset(range, needs, { loose: true });
  } catch {
    ok = false;
  }
  if (!ok) narrower.push(`${path.replace(/.*node_modules\//, '')}@${pkg.version} needs ${needs}`);
}
if (narrower.length) {
  failed = true;
  console.error(`✘ supportedNode (${range}) allows Node versions that ${narrower.length} runtime package(s) do not support. Raise it in runtime/package.json and update the README:`);
  for (const line of [...new Set(narrower)].slice(0, 20)) console.error(`  ${line}`);
} else {
  console.log(`✔ every runtime package supports supportedNode (${range})`);
}

// 2. node-range.mjs agrees with semver around every bound and across majors
const probes = new Set();
for (let major = 18; major <= 30; major++) probes.add(`${major}.0.0`).add(`${major}.99.99`).add(`${major}.0.0-nightly20260101`);
for (const { min: [a, b, c] } of parseRange(range)) {
  for (const v of [[a, b, c], [a, b, c + 1], [a, b + 1, 0], c ? [a, b, c - 1] : b ? [a, b - 1, 99] : [a - 1, 99, 99]]) {
    probes.add(v.join('.')).add(`${v.join('.')}-rc.1`);
  }
}
const disagree = [...probes].filter((v) => satisfies(v, range) !== semver.satisfies(v, range));
if (disagree.length) {
  failed = true;
  console.error(`✘ node-range.mjs and semver disagree on ${disagree.join(', ')} for ${range}`);
} else {
  console.log(`✔ node-range.mjs matches semver on ${probes.size} versions`);
}
process.exit(failed ? 1 : 0);
