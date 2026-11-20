#!/usr/bin/env node
// Unit tests for the README benchmark chart (scripts/benchmark-chart.mjs), and a check
// that the committed SVGs match what the config in assets/benchmark-chart.json produces.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, chartData, fmtTokens, renderChart, THEMES } from './benchmark-chart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (arm, task, passed, n) => ({ arm, task, passed, contextPerTurn: 1000 * n, total: 100000 * n, costUsd: 0.1 * n, wallSec: 10 * n });
const results = {
  date: '2026-01-02T03-04-05-678Z',
  runsPerCell: 2,
  results: [
    run('plain', 'a', false, 2), run('soma', 'a', true, 1),
    run('plain', 'b', true, 2), run('soma', 'b', true, 3),
  ],
};

const tests = [
  ['fmtTokens picks a precision by size', () => {
    assert.equal(fmtTokens(950), '950');
    assert.equal(fmtTokens(38029), '38.0k');
    assert.equal(fmtTokens(678220), '678k');
    assert.equal(fmtTokens(1592775), '1.59M');
  }],
  ['chartData takes per-arm means and SOMA as a % of plain', () => {
    const d = chartData(results);
    assert.equal(d.suite, 'Android Settings app');
    assert.equal(d.tasks, 2);
    assert.equal(d.date, '2026-01-02');
    assert.deepEqual(d.metrics.map((m) => m.pct), [100, 100, 100, 100]);
    assert.deepEqual(d.metrics[1], { name: 'Total tokens', plain: '200k', soma: '200k', pct: 100 });
    assert.equal(d.metrics[2].plain, '$0.200');
    assert.equal(d.metrics[3].soma, '20 s');
  }],
  ['chartData lists passes before failures', () => {
    assert.deepEqual(chartData(results).passed, { plain: [true, false], soma: [true, true] });
  }],
  ['chartData names the AndroidWorld suite', () => {
    assert.equal(chartData({ ...results, suite: 'androidworld' }).suite, 'AndroidWorld');
  }],
  ['chartData refuses results without both arms or with a zero baseline', () => {
    assert.throws(() => chartData({ results: results.results.filter((r) => r.arm === 'soma') }), /both/);
    const zero = { results: results.results.map((r) => ({ ...r, costUsd: 0 })) };
    assert.throws(() => chartData(zero), /costUsd/);
  }],
  ['renderChart escapes the note and shows pass counts', () => {
    const svg = renderChart(chartData(results, { note: 'a <b> & "c"' }), THEMES.light);
    assert.match(svg, /a &lt;b&gt; &amp; &quot;c&quot;/);
    assert.match(svg, />1\/2</);
    assert.match(svg, />2\/2</);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }],
  ['renderChart draws no arrow for an unchanged metric', () => {
    const svg = renderChart(chartData(results), THEMES.dark);
    assert.doesNotMatch(svg, /translate\(826 /);
    assert.match(svg, />0%<\/text>/);
  }],
  ['the committed SVGs match assets/benchmark-chart.json', () => {
    for (const [file, svg] of Object.entries(buildAll(ROOT))) {
      const current = readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
      assert.equal(current, svg, `${file} is out of date: run node scripts/benchmark-chart.mjs`);
    }
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`✔ ${name}`); } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message}`); }
}
if (failed) { console.error(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`All ${tests.length} benchmark chart tests passed`);
