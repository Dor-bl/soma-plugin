// Pure helpers for scripts/benchmark.mjs: read one `claude -p --output-format stream-json`
// run into numbers, and summarise several runs. No I/O, so test-benchmark-stats.mjs covers them.

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Parses stream-json output (one JSON object per line; unparsable lines are skipped)
export function parseEvents(stdout) {
  return stdout.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return {}; }
  });
}

// Everything a run reports that the benchmark compares. `result.usage` is the session
// total, summed over every turn, so cache reads and writes are included.
export function measure(events) {
  const result = events.find((e) => e.type === 'result') ?? {};
  const usage = result.usage ?? {};
  const toolUses = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  const results = events.filter((e) => e.type === 'user').flatMap((e) => e.message?.content ?? []).filter((c) => c?.type === 'tool_result');
  const failedIds = new Set(results.filter((r) => r.is_error).map((r) => r.tool_use_id));
  // No result event (a timeout) means no usage was reported: null, never 0, so it stays out of
  // the medians. A run that ended in an error still reports its usage, which is kept.
  const field = (key) => (result.usage ? usage[key] ?? 0 : null);
  const input = field('input_tokens');
  const cacheRead = field('cache_read_input_tokens');
  const cacheWrite = field('cache_creation_input_tokens');
  const output = field('output_tokens');
  return {
    model: events.find((e) => e.type === 'system' && e.subtype === 'init')?.model ?? null,
    input, cacheRead, cacheWrite, output,
    // All tokens the model processed or produced; cache reads are the bulk of a long session
    total: result.usage ? input + cacheRead + cacheWrite + output : null,
    costUsd: result.total_cost_usd ?? null,
    turns: result.num_turns ?? null,
    durationSec: result.duration_ms == null ? null : result.duration_ms / 1000,
    toolCalls: toolUses.length,
    toolErrors: toolUses.filter((t) => failedIds.has(t.id)).length,
    isError: Boolean(result.is_error) || !result.type,
    reply: typeof result.result === 'string' ? result.result : '',
  };
}

const METRICS = ['total', 'input', 'cacheRead', 'cacheWrite', 'output', 'costUsd', 'turns', 'toolCalls', 'toolErrors', 'durationSec'];

// runs: [{ task, arm, passed, ...measure() }] -> one row per task and arm
export function summarise(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.task}\u0000${run.arm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  return [...groups.values()].map((group) => {
    const row = { task: group[0].task, arm: group[0].arm, runs: group.length, passed: group.filter((r) => r.passed).length };
    for (const m of METRICS) {
      const values = group.map((r) => r[m]).filter((v) => typeof v === 'number');
      row[m] = { median: median(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
    }
    return row;
  });
}

const fmt = (n, digits = 0) => (n == null ? 'n/a' : Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

// Markdown table: medians, with the min-max range for total tokens. Rows of one task sit
// next to each other; "vs plain" is the arm's median total tokens against the baseline arm's.
export function toMarkdown(rows, baselineArm = 'plain') {
  const lines = [
    '| Task | Arm | Passed | Total tokens (median, range) | vs plain | Output tokens | Tool calls | Cost (USD) | Time (s) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const base = rows.find((o) => o.task === r.task && o.arm === baselineArm);
    const change = r.total.median != null && base?.total.median && r.arm !== baselineArm ? `${((r.total.median / base.total.median - 1) * 100).toFixed(0)}%` : '–';
    lines.push(
      `| ${r.task} | ${r.arm} | ${r.passed}/${r.runs} | ${fmt(r.total.median)} (${fmt(r.total.min)}–${fmt(r.total.max)}) | ${change} | ${fmt(r.output.median)} | ${fmt(r.toolCalls.median)} | ${fmt(r.costUsd.median, 2)} | ${fmt(r.durationSec.median)} |`,
    );
  }
  return lines.join('\n');
}
