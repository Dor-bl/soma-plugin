#!/usr/bin/env node
// Unit tests for the benchmark's run parsing and summary (scripts/benchmark-stats.mjs).
import assert from 'node:assert/strict';
import { measure, median, parseEvents, summarise, toMarkdown } from './benchmark-stats.mjs';

const stream = [
  { type: 'system', subtype: 'init', model: 'claude-test' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'a' }, { type: 'text', text: 'x' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'b' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2' }] } },
  { type: 'result', is_error: false, result: 'done', num_turns: 3, duration_ms: 12500, total_cost_usd: 0.25,
    usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 5 } },
].map((e) => JSON.stringify(e)).join('\n');

const tests = [
  ['median of odd, even and empty lists', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
  }],
  ['parseEvents skips lines that are not JSON', () => {
    assert.deepEqual(parseEvents('{"a":1}\nnot json\n'), [{ a: 1 }, {}]);
  }],
  ['measure reads usage, tool calls and tool errors from a stream', () => {
    const m = measure(parseEvents(stream));
    assert.equal(m.total, 135);
    assert.equal(m.cacheRead, 100);
    assert.equal(m.output, 5);
    assert.equal(m.toolCalls, 2);
    assert.equal(m.toolErrors, 1);
    assert.equal(m.turns, 3);
    assert.equal(m.durationSec, 12.5);
    assert.equal(m.model, 'claude-test');
    assert.equal(m.reply, 'done');
    assert.equal(m.isError, false);
  }],
  ['a stream without a result event is an error run', () => {
    assert.equal(measure(parseEvents('{"type":"system","subtype":"init"}')).isError, true);
  }],
  ['missing usage is null, not 0, and stays out of the medians; usage of an errored run is kept', () => {
    const none = measure(parseEvents('{"type":"system","subtype":"init"}'));
    assert.equal(none.total, null);
    assert.equal(none.output, null);
    const errored = measure(parseEvents(JSON.stringify({ type: 'result', is_error: true, usage: { output_tokens: 7 } })));
    assert.equal(errored.total, 7);
    const base = { task: 't', arm: 'a', passed: false, input: 0, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 1, turns: 1, toolCalls: 1, toolErrors: 0, durationSec: 1 };
    const [row] = summarise([{ ...base, total: null }, { ...base, total: 500 }]);
    assert.equal(row.total.median, 500);
    // An arm with no usage at all shows n/a and no change against plain
    const rows = summarise([{ ...base, arm: 'plain', total: 500 }, { ...base, arm: 'soma', total: null }]);
    assert.match(toMarkdown(rows), /\| t \| soma \| 0\/1 \| n\/a \(n\/a–n\/a\) \| – \|/);
  }],
  ['summarise groups by task and arm; markdown compares against the plain arm', () => {
    const run = (arm, total, passed) => ({ task: 't', arm, passed, total, input: 0, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 1, turns: 1, toolCalls: 2, toolErrors: 0, durationSec: 3 });
    const rows = summarise([run('plain', 100, true), run('plain', 300, false), run('soma', 100, true)]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].passed, 1);
    assert.equal(rows[0].total.median, 200);
    const md = toMarkdown(rows);
    assert.match(md, /\| t \| plain \| 1\/2 \| 200 \(100–300\) \| – \|/);
    assert.match(md, /\| t \| soma \| 1\/1 \| 100 \(100–100\) \| -50% \|/);
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`✔ ${name}`); } catch (error) { failed++; console.error(`✘ ${name}\n  ${error.message}`); }
}
if (failed) process.exit(1);
