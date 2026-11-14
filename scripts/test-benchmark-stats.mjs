#!/usr/bin/env node
// Unit tests for the benchmark's run parsing and summary (scripts/benchmark-stats.mjs).
import assert from 'node:assert/strict';
import { measure, median, parseEvents, redactHome, streamFileName, summarise, toMarkdown } from './benchmark-stats.mjs';

const stream = [
  { type: 'system', subtype: 'init', model: 'claude-test' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__appium-mcp__appium_find_element' }, { type: 'text', text: 'x' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'mcp__appium-mcp__appium_click' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'Bash' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't3' }] } },
  // A pending appium call with no result (the run was interrupted): counted, never ok
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't4', name: 'mcp__appium-mcp__appium_get_text' }] } },
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
    assert.equal(m.toolCalls, 4);
    assert.equal(m.toolErrors, 1);
    assert.equal(m.appiumCalls, 3);
    assert.equal(m.appiumOk, 1);
    assert.equal(m.turns, 3);
    assert.equal(m.bashCalls, 1);
    assert.equal(m.contextPerTurn, 100 / 3);
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
  ['a run that checked out without a successful appium-mcp call is listed as invalid, not passed', () => {
    const run = (passed, invalid) => ({ task: 't', arm: 'plain', passed, invalid, total: 100, input: 0, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 1, turns: 1, toolCalls: 2, toolErrors: 0, durationSec: 3 });
    const rows = summarise([run(true, false), run(false, true), run(false, false)]);
    assert.equal(rows[0].passed, 1);
    assert.equal(rows[0].invalid, 1);
    assert.match(toMarkdown(rows), /\| t \| plain \| 1\/3 \(1 no Appium\) \|/);
  }],
  ['context per turn is null without usage or turns, and Bash calls are 0 without Bash', () => {
    const none = measure(parseEvents('{"type":"system","subtype":"init"}'));
    assert.equal(none.contextPerTurn, null);
    assert.equal(none.bashCalls, 0);
    const noTurns = measure(parseEvents(JSON.stringify({ type: 'result', num_turns: 0, usage: { cache_read_input_tokens: 50 } })));
    assert.equal(noTurns.contextPerTurn, null);
  }],
  ['the table shows median context per turn, turns and Bash calls per arm', () => {
    const run = (arm, contextPerTurn, turns, bashCalls) => ({ task: 't', arm, passed: true, total: 100, input: 0, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 1, turns, contextPerTurn, toolCalls: 2, bashCalls, toolErrors: 0, durationSec: 3 });
    const rows = summarise([run('plain', 28_700, 18, 2), run('plain', 28_900, 20, 4), run('soma', 31_300, 22, 0)]);
    assert.equal(rows[0].contextPerTurn.median, 28_800);
    assert.equal(rows[0].bashCalls.median, 3);
    const md = toMarkdown(rows);
    assert.match(md, /\| Context per turn \| Turns \| Output tokens \| Tool calls \| Bash calls \|/);
    assert.match(md, /\| t \| plain \| 2\/2 \| 100 \(100–100\) \| – \| 28,800 \| 19 \| 1 \| 2 \| 3 \|/);
    assert.match(md, /\| t \| soma \| 1\/1 \| 100 \(100–100\) \| 0% \| 31,300 \| 22 \| 1 \| 2 \| 0 \|/);
    // Header and rows keep the same column count
    const cells = md.split('\n').map((l) => l.split('|').length);
    assert.ok(cells.every((c) => c === cells[0]));
  }],
  ['stream file names are <task>-<arm>-<run>.jsonl and cannot leave the folder', () => {
    assert.equal(streamFileName('dark-theme', 'soma', 2), 'dark-theme-soma-2.jsonl');
    assert.equal(streamFileName('../x/y', 'plain', 1), '___x_y-plain-1.jsonl');
  }],
  ['the home folder is redacted from replies in either slash direction and any case', () => {
    const home = 'C:\\Users\\Some.User';
    assert.equal(redactHome('Saved C:\\Users\\Some.User\\AppData\\Local\\Temp\\a.png', home), 'Saved ~\\AppData\\Local\\Temp\\a.png');
    assert.equal(redactHome('c:/users/some.user/x and C:\\Users\\Some.User\\y', home), '~/x and ~\\y');
    assert.equal(redactHome('/home/u/x', '/home/u/'), '~/x');
    // A dot in the name is literal, not "any character"
    assert.equal(redactHome('C:\\Users\\SomexUser\\x', home), 'C:\\Users\\SomexUser\\x');
    // Only the complete home path: not a sibling home with the same prefix, not a path that embeds it
    assert.equal(redactHome('/home/user2/a.png and /mnt/home/user/a.png', '/home/user'), '/home/user2/a.png and /mnt/home/user/a.png');
    assert.equal(redactHome('C:\\Users\\Some.User2\\a.png', home), 'C:\\Users\\Some.User2\\a.png');
    assert.equal(redactHome('see /home/user, then "/home/user/a.png"', '/home/user'), 'see ~, then "~/a.png"');
    // Siblings whose name continues with "+", ".x" or a non-ASCII letter stay as they are
    assert.equal(redactHome('/home/useré/a.png /home/user+x/a.png /home/user.old/a.png', '/home/user'), '/home/useré/a.png /home/user+x/a.png /home/user.old/a.png');
    // Inside a file URL too
    // (the home path's leading slash also takes the URL's slashes; the name is gone either way)
    assert.equal(redactHome('file:///home/user/a.png', '/home/user'), 'file:~/a.png');
    assert.equal(redactHome('file:///C:/Users/Some.User/a.png', home), 'file:///~/a.png');
    // Markdown around the path does not hide it
    for (const [wrapped, out] of [['`/home/user/a.png`', '`~/a.png`'], ['**/home/user/a.png**', '**~/a.png**'], ['_/home/user_', '_~_'], ['~~/home/user/a.png~~', '~~~/a.png~~'], ['[a](/home/user/a.png)', '[a](~/a.png)']])
      assert.equal(redactHome(wrapped, '/home/user'), out);
    // Repeated separators in a longer path do not let the home match inside it
    assert.equal(redactHome('/mnt//home/user/a.png', '/home/user'), '/mnt//home/user/a.png');
    // A sentence's final period ends the path, so the name is not left exposed
    assert.equal(redactHome('Files are under /home/user.', '/home/user'), 'Files are under ~.');
    assert.equal(redactHome('Saved in C:\\Users\\Some.User.', home), 'Saved in ~.');
    // A space ends it too: a sibling named after the home folder plus a space is redacted (privacy first)
    assert.equal(redactHome('"C:\\Users\\Some.User Backup\\a.png"', home), '"~ Backup\\a.png"');
    // A bare home path followed by ordinary words is still redacted
    assert.equal(redactHome('files under /home/user and nowhere else', '/home/user'), 'files under ~ and nowhere else');
    assert.equal(redactHome('/home/user', '/home/user'), '~');
    assert.equal(redactHome(null, home), null);
    assert.equal(redactHome('no paths', ''), 'no paths');
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`✔ ${name}`); } catch (error) { failed++; console.error(`✘ ${name}\n  ${error.message}`); }
}
if (failed) process.exit(1);
