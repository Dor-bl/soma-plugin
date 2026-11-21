// The Node.js versions the pinned appium-mcp runtime supports, and a check against them.
//
// The range is `supportedNode` in runtime/package.json: `^X.Y.Z` and `>=X.Y.Z` terms joined
// by `||`, nothing else, so it can be checked without the semver package (the launcher runs
// this before appium-mcp and its dependencies are installed). npm does not copy the key into
// the lockfile, so changing it does not force a reinstall. CI checks the range against every
// package in the installed runtime (check-node-range.mjs).
//
// Run directly, it prints whether this Node satisfies the range and exits 1 if it does not.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TERM = /^(\^|>=)(\d+)\.(\d+)\.(\d+)$/;

// [{ op: '^' | '>=', min: [major, minor, patch] }], or throws on any other syntax
export function parseRange(range) {
  if (typeof range !== 'string' || !range.trim()) throw new Error('supportedNode is missing');
  return range.split('||').map((part) => {
    const m = TERM.exec(part.trim());
    if (!m) throw new Error(`supportedNode term "${part.trim()}" is not ^X.Y.Z or >=X.Y.Z`);
    return { op: m[1], min: m.slice(2).map(Number) };
  });
}

// A prerelease or nightly (22.19.0-nightly…) counts as its release: only the numbers are compared
export function parseVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) throw new Error(`cannot read the Node.js version "${version}"`);
  return m.slice(1).map(Number);
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function satisfies(version, range) {
  const v = parseVersion(version);
  return parseRange(range).some(({ op, min }) => compare(v, min) >= 0 && (op === '>=' || v[0] === min[0]));
}

// "22.19 or newer within Node 22, or 24 or newer"
export function describeRange(range) {
  const parts = parseRange(range).map(({ op, min }) => {
    const shown = min[2] ? min.join('.') : `${min[0]}.${min[1]}`;
    if (op === '>=') return `${shown === `${min[0]}.0` ? min[0] : shown} or newer`;
    return shown === `${min[0]}.0` ? `any Node ${min[0]}` : `${shown} or newer within Node ${min[0]}`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, or ${parts.at(-1)}` : parts[0];
}

export function supportedRange(runtimeDir = fileURLToPath(new URL('../runtime/', import.meta.url))) {
  return JSON.parse(readFileSync(`${runtimeDir}/package.json`, 'utf8')).supportedNode;
}

// A one-line explanation when this Node is not supported, otherwise null
export function nodeProblem(version = process.version, range = supportedRange()) {
  if (satisfies(version, range)) return null;
  return `Node.js ${version} is not supported by the appium-mcp runtime SOMA pins. It needs ${describeRange(range)} (${range}). Install a supported version, restart Claude Code, then reconnect with /mcp.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const range = supportedRange();
  const problem = nodeProblem(process.version, range);
  console.log(problem ?? `OK: Node.js ${process.version} is supported (${describeRange(range)}).`);
  process.exit(problem ? 1 : 0);
}
