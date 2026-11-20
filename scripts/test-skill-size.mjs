#!/usr/bin/env node
// Tests for scripts/skill-size.mjs: description reading, plugin file references, sizes and deltas.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { approxTokens, bytes, description, formatTable, listEntries, measure, overBudget, parseArgs, pluginRefs, withDelta } from './skill-size.mjs';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`✔ ${name}`);
};

test('bytes counts UTF-8 bytes, not characters', () => {
  assert.equal(bytes('abc'), 3);
  assert.equal(bytes('Wi‑Fi'), 7); // U+2011 is three bytes
  assert.equal(bytes(''), 0);
  assert.equal(approxTokens(4096), 1024);
});

test('description reads plain, quoted and folded values', () => {
  assert.equal(description('---\nname: a\ndescription: Does a thing.\n---\nbody'), 'Does a thing.');
  assert.equal(description('---\nname: a\ndescription: "Run: then report"\n---\n'), 'Run: then report');
  assert.equal(description('---\ndescription: first\n  second line\nname: a\n---\n'), 'first second line');
  assert.equal(description('---\r\nname: a\r\ndescription: crlf\r\n---\r\n'), 'crlf');
  assert.equal(description('no frontmatter'), '');
  assert.equal(description('---\nname: a\n---\n'), '');
});

test('pluginRefs lists Markdown files only, without anchors or punctuation, once each', () => {
  const text = [
    'Read `${CLAUDE_PLUGIN_ROOT}/backends/appium.md` for iOS.',
    'See ${CLAUDE_PLUGIN_ROOT}/backends/appium.md#remote, then ${CLAUDE_PLUGIN_ROOT}/backends/README.md.',
    'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/start-emulator.mjs` into ${CLAUDE_PLUGIN_ROOT}/.runtime/',
    'Never ${CLAUDE_PLUGIN_ROOT}/../secret.md',
  ].join('\n');
  assert.deepEqual(pluginRefs(text), ['backends/README.md', 'backends/appium.md']);
  assert.deepEqual(pluginRefs('nothing here'), []);
});

const files = {
  'skills/a/SKILL.md': '---\nname: a\ndescription: Short.\n---\nUse ${CLAUDE_PLUGIN_ROOT}/backends/x.md and ${CLAUDE_PLUGIN_ROOT}/backends/gone.md\n',
  'backends/x.md': 'x'.repeat(10),
  'agents/r.md': '---\nname: r\ndescription: Agent.\n---\nBody\n',
};
const read = (p) => files[p] ?? null;
const entries = [
  { kind: 'skill', name: 'a', path: 'skills/a/SKILL.md' },
  { kind: 'skill', name: 'b', path: 'skills/b/SKILL.md' },
  { kind: 'agent', name: 'r', path: 'agents/r.md' },
];

test('measure sizes each file, its description and the files it points at', () => {
  const [a, b, r] = measure(entries, read);
  assert.equal(a.bytes, bytes(files['skills/a/SKILL.md']));
  assert.equal(a.descriptionBytes, 6);
  assert.deepEqual(a.refs, [{ path: 'backends/gone.md', bytes: null }, { path: 'backends/x.md', bytes: 10 }]);
  assert.equal(b.missing, true);
  assert.equal(r.descriptionBytes, 6);
  assert.deepEqual(r.refs, []);
});

test('withDelta compares against the base and marks new files', () => {
  const now = measure(entries, read);
  const base = measure(entries, (p) => (p === 'skills/a/SKILL.md' ? 'tiny' : null));
  const [a, b, r] = withDelta(now, base);
  assert.equal(a.delta, a.bytes - 4);
  assert.equal(b.delta, null);
  assert.equal(r.delta, null);
});

test('overBudget flags skills only, strictly above the limit', () => {
  const rows = measure(entries, read);
  const size = rows[0].bytes;
  assert.deepEqual(overBudget(rows, size).map((r) => r.name), []);
  assert.deepEqual(overBudget(rows, size - 1).map((r) => r.name), ['a']);
  assert.deepEqual(overBudget(rows, 1).map((r) => r.name), ['a']); // the agent is not counted
});

test('formatTable marks skills over the target and totals skills only', () => {
  const rows = withDelta(measure(entries, read), []);
  const out = formatTable(rows, { target: 10, showDelta: true });
  const aLine = out.split('\n').find((l) => l.startsWith('skill  a'));
  assert.match(aLine, /\d+ \*/);
  assert.match(aLine, /backends\/gone\.md \(missing\), backends\/x\.md \(10\)/);
  assert.match(out, /Δ base/);
  assert.match(out, new RegExp(`Skills: ${rows[0].bytes} bytes`));
  assert.match(out, /descriptions in every session's listing: 6 bytes/);
  assert.doesNotMatch(formatTable(rows), /Δ base/);
});

test('parseArgs accepts the documented options and rejects the rest', () => {
  assert.deepEqual(parseArgs([]), { base: null, maxBytes: null, json: false });
  assert.deepEqual(parseArgs(['--base', 'develop', '--max-bytes', '4096', '--json']), { base: 'develop', maxBytes: 4096, json: true });
  assert.throws(() => parseArgs(['--base']), /needs a value/);
  assert.throws(() => parseArgs(['--base', '--json']), /needs a value/);
  assert.throws(() => parseArgs(['--max-bytes', '4k']), /positive whole number/);
  assert.throws(() => parseArgs(['--max-bytes', '0']), /positive whole number/);
  assert.throws(() => parseArgs(['--verbose']), /unknown option/);
});

test('listEntries finds every skill and agent in this repo', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const found = listEntries(root);
  assert.ok(found.some((e) => e.kind === 'skill' && e.name === 'run-manual-test' && e.path === 'skills/run-manual-test/SKILL.md'));
  assert.ok(found.some((e) => e.kind === 'agent' && e.name === 'device-runner'));
  assert.ok(found.findIndex((e) => e.kind === 'agent') > found.findLastIndex((e) => e.kind === 'skill'));
});

console.log(`\n${passed} tests passed`);
