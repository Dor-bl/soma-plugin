#!/usr/bin/env node
// Draws the README benchmark chart (assets/benchmark-light.svg and benchmark-dark.svg)
// from a benchmark results file. Which file, and an optional note on the plain arm's
// failures, are set in assets/benchmark-chart.json.
//
//   node scripts/benchmark-chart.mjs   write both SVGs from the config
// scripts/test-benchmark-chart.mjs (in CI) fails when the committed SVGs are out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG = 'assets/benchmark-chart.json';
export const THEMES = {
  light: { bg: '#FFFFFF', border: '#D0D7DE', text: '#1F2328', muted: '#656D76', grid: '#E5E7EB', link: '#AFB8C1', pill: '#F6F8FA', ok: '#1A7F37', bad: '#CF222E' },
  dark: { bg: '#0D1117', border: '#30363D', text: '#E6EDF3', muted: '#8B949E', grid: '#21262D', link: '#484F58', pill: '#161B22', ok: '#238636', bad: '#DA3633' },
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e5) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
const fmtUsd = (n) => `$${n.toFixed(3)}`;
const fmtSec = (n) => `${Math.round(n)} s`;

const METRICS = [
  { key: 'contextPerTurn', name: 'Context per turn', fmt: fmtTokens },
  { key: 'total', name: 'Total tokens', fmt: fmtTokens },
  { key: 'costUsd', name: 'Cost per run', fmt: fmtUsd },
  { key: 'wallSec', name: 'Wall time', fmt: fmtSec },
];

// Per-arm means over every run, as in the benchmark README's per-arm tables. Refuses an
// interrupted or partial file: every task needs runsPerCell runs in each arm, and every
// run a value for each metric, so both arms are averaged over the same task mix.
export function chartData(results, { note = '' } = {}) {
  const runs = results.results ?? [];
  const arm = (name) => runs.filter((r) => r.arm === name);
  const plain = arm('plain'), soma = arm('soma');
  if (!plain.length || !soma.length) throw new Error('results need runs for both the plain and soma arms');
  const perCell = results.runsPerCell;
  if (!Number.isInteger(perCell) || perCell < 1) throw new Error('results need a whole-number runsPerCell');
  for (const task of new Set(runs.map((r) => r.task))) {
    for (const [name, rs] of [['plain', plain], ['soma', soma]]) {
      const n = rs.filter((r) => r.task === task).length;
      if (n !== perCell) throw new Error(`task ${task} has ${n} ${name} runs, expected ${perCell}: the results file looks incomplete`);
    }
  }
  const metrics = METRICS.map((m) => {
    for (const r of runs) {
      if (typeof r[m.key] !== 'number' || !Number.isFinite(r[m.key])) throw new Error(`run ${r.run ?? '?'} of ${r.task} (${r.arm}) has no ${m.key}`);
    }
    const p = mean(plain.map((r) => r[m.key])), s = mean(soma.map((r) => r[m.key]));
    if (p <= 0) throw new Error(`the plain arm's mean ${m.key} is zero`);
    return { name: m.name, plain: m.fmt(p), soma: m.fmt(s), pct: Math.round((s / p) * 100) };
  });
  const passes = (rs) => rs.map((r) => Boolean(r.passed)).sort((a, b) => b - a);
  return {
    suite: results.suite === 'androidworld' ? 'AndroidWorld' : 'Android Settings app',
    tasks: new Set(runs.map((r) => r.task)).size,
    runsPerCell: perCell,
    date: String(results.date).slice(0, 10),
    metrics,
    passed: { plain: passes(plain), soma: passes(soma) },
    note,
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const LOGO = `<g transform="translate(40 34) scale(0.1875)">
    <rect width="256" height="256" rx="56" fill="url(#brand)"/>
    <rect x="70" y="78" width="8" height="18" rx="3" fill="#FFFFFF"/>
    <rect x="70" y="104" width="8" height="30" rx="3" fill="#FFFFFF"/>
    <rect x="178" y="92" width="8" height="36" rx="3" fill="#FFFFFF"/>
    <rect x="76" y="34" width="104" height="188" rx="25" fill="#FFFFFF"/>
    <rect x="84" y="42" width="88" height="172" rx="17" fill="#0B2545"/>
    <rect x="113" y="50" width="30" height="9" rx="4.5" fill="#062A30"/>
    <path d="M128 70 L149 122 L128 140 Z" fill="#FFFFFF"/>
    <path d="M128 70 L107 122 L128 140 Z" fill="#A7F3D0"/>
    <rect x="113" y="144" width="30" height="8" rx="4" fill="#FFFFFF"/>
    <rect x="123.5" y="156" width="9" height="38" rx="4.5" fill="#FFFFFF"/>
  </g>`;
const r1 = (n) => Math.round(n * 10) / 10;

// One run's pass/fail tile, size px square; the mark is drawn on a 22 px grid and scaled.
function tile(t, x, y, ok, size) {
  const mark = ok
    ? '<path d="M6 11.5 l4 4 l8 -9" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M7 7 l8 8 M15 7 l-8 8" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/>';
  const scale = size === 22 ? '' : ` scale(${r1(size / 22 * 100) / 100})`;
  return `
  <g transform="translate(${r1(x)} ${y})${scale}"><rect width="22" height="22" rx="5" fill="${ok ? t.ok : t.bad}"/>${mark}</g>`;
}

export function renderChart(data, t) {
  const W = 920, H = 640, X0 = 260, rowsTop = 190, step = 60;
  // 1% = K px; shrink the scale when SOMA goes far past plain, so its label clears the pills.
  const K = Math.min(4.3, 464 / Math.max(100, ...data.metrics.map((m) => m.pct)));
  const x = (p) => r1(X0 + p * K);
  let body = '';
  for (const [p, label] of [[0, '0%'], [50, '50%'], [100, 'plain = 100%']]) {
    body += `\n  <line x1="${x(p)}" y1="${rowsTop - 28}" x2="${x(p)}" y2="${rowsTop + step * 3 + 24}" stroke="${t.grid}" stroke-width="${p === 100 ? 2 : 1}"${p === 100 ? '' : ' stroke-dasharray="3 4"'}/>`;
    body += `\n  <text x="${x(p)}" y="${rowsTop + step * 3 + 44}" text-anchor="middle" class="tick">${label}</text>`;
  }
  data.metrics.forEach((m, i) => {
    const y = rowsTop + i * step, xp = x(100), xs = x(m.pct);
    const somaLeft = xs < xp, lo = Math.min(xp, xs), hi = Math.max(xp, xs);
    body += `\n  <text x="40" y="${y + 5}" class="metric">${esc(m.name)}</text>`;
    body += `\n  <line x1="${xp}" y1="${y}" x2="${xs}" y2="${y}" stroke="${t.link}" stroke-width="4" stroke-linecap="round"/>`;
    body += `\n  <circle cx="${xp}" cy="${y}" r="7" fill="${t.bg}" stroke="${t.muted}" stroke-width="2.5"/>`;
    body += `\n  <circle cx="${xs}" cy="${y}" r="8.5" fill="url(#brand)"/>`;
    body += `\n  <text x="${r1(lo - 16)}" y="${y + 5}" text-anchor="end" class="${somaLeft ? 'vsoma' : 'val'}">${esc(somaLeft ? m.soma : m.plain)}</text>`;
    body += `\n  <text x="${r1(hi + 16)}" y="${y + 5}" class="${somaLeft ? 'val' : 'vsoma'}">${esc(somaLeft ? m.plain : m.soma)}</text>`;
    const px = 806, d = Math.abs(100 - m.pct);
    body += `\n  <rect x="${px}" y="${y - 14}" width="74" height="28" rx="14" fill="${t.pill}" stroke="${t.grid}"/>`;
    if (m.pct !== 100) body += `\n  <path d="${m.pct < 100 ? 'M-5 -3 L5 -3 L0 4 Z' : 'M-5 3 L5 3 L0 -4 Z'}" transform="translate(${px + 20} ${y})" fill="${t.text}"/>`;
    body += `\n  <text x="${px + 32}" y="${y + 5}" class="pct">${d}%</text>`;
  });
  const ry = 506;
  body += `\n  <line x1="40" y1="${ry - 48}" x2="${W - 40}" y2="${ry - 48}" stroke="${t.grid}"/>`;
  body += `\n  <text x="40" y="${ry - 14}" class="metric">Runs passed</text>`;
  // Up to 20 runs per arm get full-size tiles; more shrink to fit 560 px, so no tile covers another.
  const most = Math.max(data.passed.plain.length, data.passed.soma.length);
  const gap = Math.min(28, 560 / most), size = r1(Math.min(22, gap - 4));
  const noteFits = (end) => end + 42 + data.note.length * 6.4 <= W - 40;
  let noteBelow = false;
  [['plain', 'Claude Code + appium-mcp'], ['soma', 'with SOMA']].forEach(([k, label], j) => {
    const y = ry + j * 36, runs = data.passed[k];
    const end = X0 + (runs.length - 1) * gap + size;
    body += `
  <text x="${X0 - 16}" y="${y + 16}" text-anchor="end" class="val">${label}</text>`;
    runs.forEach((ok, n) => { body += tile(t, X0 + n * gap, y + (22 - size) / 2, ok, size); });
    body += `
  <text x="${r1(end + 8)}" y="${y + 16}" class="${k === 'soma' ? 'vsoma' : 'val'}">${runs.filter(Boolean).length}/${runs.length}</text>`;
    if (k === 'plain' && data.note) {
      if (noteFits(end)) body += `
  <text x="${r1(end + 44)}" y="${y + 16}" class="note">${esc(data.note)}</text>`;
      else noteBelow = true;
    }
  });
  if (noteBelow) body += `
  <text x="${X0}" y="${ry + 88}" class="note">Plain: ${esc(data.note)}</text>`;
  const descMetrics = data.metrics.map((m) => `${m.name} ${m.plain} to ${m.soma} (${m.pct === 100 ? 'unchanged' : `${m.pct < 100 ? 'down' : 'up'} ${Math.abs(100 - m.pct)}%`}).`).join(' ');
  const count = (k) => `${data.passed[k].filter(Boolean).length} of ${data.passed[k].length}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
  <!-- Generated by scripts/benchmark-chart.mjs from ${CONFIG}; do not edit by hand. -->
  <title id="title">SOMA benchmark: ${esc(data.suite)}</title>
  <desc id="desc">Mean per run over ${data.passed.plain.length} runs per arm, plain Claude Code with appium-mcp against the same with SOMA. ${esc(descMetrics)} Runs passed: plain ${count('plain')}, SOMA ${count('soma')}.</desc>
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10B981"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: ${FONT}; }
    .title { font-size: 22px; font-weight: 700; fill: ${t.text}; }
    .subtitle { font-size: 14px; fill: ${t.muted}; }
    .metric { font-size: 15px; font-weight: 600; fill: ${t.text}; }
    .val { font-size: 14px; fill: ${t.muted}; }
    .vsoma, .pct { font-size: 14px; font-weight: 700; fill: ${t.text}; }
    .tick { font-size: 12px; fill: ${t.muted}; }
    .legend, .note { font-size: 13px; fill: ${t.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="${t.bg}" stroke="${t.border}"/>
  ${LOGO}
  <text x="100" y="58" class="title">Benchmark: SOMA vs plain Claude Code</text>
  <text x="100" y="80" class="subtitle">${esc(data.suite)} · ${data.tasks} tasks × ${data.runsPerCell} ${data.runsPerCell === 1 ? 'run' : 'runs'} per arm · same appium-mcp · ${esc(data.date)}</text>
  <circle cx="47" cy="124" r="6" fill="${t.bg}" stroke="${t.muted}" stroke-width="2.5"/>
  <text x="61" y="129" class="legend">Claude Code + appium-mcp</text>
  <circle cx="257" cy="124" r="7" fill="url(#brand)"/>
  <text x="271" y="129" class="legend">with SOMA</text>
  <text x="${W - 40}" y="129" text-anchor="end" class="legend">mean per run · lower is better</text>${body}
  <text x="40" y="${H - 24}" class="note">Differences under ~15% are noise. Full results and method: benchmarks/README.md</text>
</svg>
`;
}

export function buildAll(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, CONFIG), 'utf8'));
  const results = JSON.parse(readFileSync(join(root, config.results), 'utf8'));
  const data = chartData(results, { note: config.note });
  return Object.fromEntries(Object.entries(THEMES).map(([name, t]) => [`assets/benchmark-${name}.svg`, renderChart(data, t)]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [file, svg] of Object.entries(buildAll())) {
    writeFileSync(join(ROOT, file), svg);
    console.log(`wrote ${file}`);
  }
}
