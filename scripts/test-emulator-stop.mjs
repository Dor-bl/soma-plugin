#!/usr/bin/env node
// Tests for scripts/emulator-stop.mjs: `--stop` argument parsing and the stopped/running/unknown decision.
import assert from 'node:assert/strict';
import { DEFAULT_STOP_SECONDS, parseStopArgs, stopState } from './emulator-stop.mjs';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`✔ ${name}`);
};

test('parseStopArgs takes a name and an optional positive timeout', () => {
  assert.deepEqual(parseStopArgs(['Pixel_6']), { name: 'Pixel_6', timeoutMs: DEFAULT_STOP_SECONDS * 1000 });
  assert.deepEqual(parseStopArgs(['Pixel_6', '--timeout', '30']), { name: 'Pixel_6', timeoutMs: 30_000 });
  assert.deepEqual(parseStopArgs(['Pixel_6', '--timeout', '1.5']), { name: 'Pixel_6', timeoutMs: 1_500 });
});

test('parseStopArgs rejects a missing name and stray flags', () => {
  assert.ok(parseStopArgs([]).error);
  assert.ok(parseStopArgs(['--timeout', '30']).error);
  assert.ok(parseStopArgs(['Pixel_6', '--cold']).error);
  assert.ok(parseStopArgs(['Pixel_6', '--timeout']).error);
  assert.ok(parseStopArgs(['Pixel_6', '--timeout', '30', '--cold']).error);
});

test('parseStopArgs rejects a timeout that is a flag, not finite, or not above 0', () => {
  for (const value of ['--cold', 'Infinity', '-Infinity', 'NaN', '0', '-5', '1e9999', 'abc', '']) {
    assert.ok(parseStopArgs(['Pixel_6', '--timeout', value]).error, `accepted --timeout ${JSON.stringify(value)}`);
  }
});

test('stopState says stopped only when both observers read cleanly and show nothing', () => {
  const targets = ['emulator-5554'];
  assert.equal(stopState({ adb: { ok: true, serials: [] }, proc: false, targets }), 'stopped');
  assert.equal(stopState({ adb: { ok: true, serials: ['emulator-5556'] }, proc: false, targets }), 'stopped');
  assert.equal(stopState({ adb: { ok: true, serials: ['emulator-5554'] }, proc: false, targets }), 'running');
  assert.equal(stopState({ adb: { ok: true, serials: [] }, proc: true, targets }), 'running');
});

test('stopState never treats a failed read as stopped', () => {
  const targets = ['emulator-5554'];
  assert.equal(stopState({ adb: { ok: false, serials: [] }, proc: false, targets }), 'unknown');
  assert.equal(stopState({ adb: { ok: true, serials: [] }, proc: null, targets }), 'unknown');
  assert.equal(stopState({ adb: { ok: false, serials: [] }, proc: null, targets }), 'unknown');
});

console.log(`\n${passed} tests passed`);
