#!/usr/bin/env node
// Reports how much text each skill and agent puts into context, for the token work in #55:
// the description (in the skill listing of every session), the whole SKILL.md (loaded when the
// skill runs, the "hot path") and the plugin Markdown files it points at with
// ${CLAUDE_PLUGIN_ROOT}/ (read only when the skill says so). Sizes are UTF-8 bytes; "~tok" is
// bytes / 4, a rough estimate, not a tokenizer count.
//
//   node scripts/skill-size.mjs                    # table for the working tree
//   node scripts/skill-size.mjs --base develop     # plus the change against a git ref
//   node scripts/skill-size.mjs --max-bytes 4096   # exit 1 if a SKILL.md is larger
//   node scripts/skill-size.mjs --json             # machine-readable output
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_BYTES = 4096; // the hot-path target proposed in #55

export const bytes = (text) => Buffer.byteLength(text ?? '', 'utf8');
export const approxTokens = (n) => Math.round(n / 4);

// The description from the frontmatter, unquoted, with folded lines joined. Same minimal
// reading as check-plugin.mjs: top-level `key: value` pairs only.
export function description(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return '';
  let value = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(["']?)([\w-]+)\1\s*:\s*(.*)$/);
    if (kv) {
      if (value !== null) break;
      if (kv[2] === 'description') value = kv[3];
    } else if (value !== null && /^\s+\S/.test(line)) {
      value = `${value} ${line.trim()}`;
    }
  }
  return (value ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

// Plugin Markdown files a skill or agent text points at, without anchors, sorted and unique.
// Scripts and folders are left out: the skill runs them or writes there, it does not read them.
export function pluginRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s`"'()<>[\]]*)/g)) {
    const path = m[1].split('#')[0].replace(/[.,;:]+$/, '');
    if (path.endsWith('.md') && !path.split('/').includes('..')) refs.add(path);
  }
  return [...refs].sort();
}

// One row per file. `readFile(path)` returns the text or null when the file does not exist,
// so the same function measures the working tree and a git ref.
export function measure(entries, readFile) {
  return entries.map(({ kind, name, path }) => {
    const text = readFile(path);
    if (text === null) return { kind, name, path, missing: true };
    const refs = pluginRefs(text).map((ref) => {
      const refText = readFile(ref);
      return { path: ref, bytes: refText === null ? null : bytes(refText) };
    });
    return { kind, name, path, bytes: bytes(text), descriptionBytes: bytes(description(text)), refs };
  });
}

// Adds `delta` (bytes against the base) to each current row; a row new since the base gets null.
export function withDelta(rows, baseRows) {
  const base = new Map(baseRows.filter((r) => !r.missing).map((r) => [r.path, r.bytes]));
  return rows.map((r) => ({ ...r, delta: base.has(r.path) && !r.missing ? r.bytes - base.get(r.path) : null }));
}

export const overBudget = (rows, maxBytes) => rows.filter((r) => r.kind === 'skill' && !r.missing && r.bytes > maxBytes);

const fmtDelta = (d) => (d === null ? 'new' : d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}`);

export function formatTable(rows, { target = TARGET_BYTES, showDelta = false } = {}) {
  const head = ['Kind', 'Name', 'Bytes', '~tok', 'Desc', ...(showDelta ? ['Δ base'] : []), 'Reads when needed'];
  const body = rows.map((r) => [
    r.kind,
    r.name,
    r.missing ? '-' : `${r.bytes}${r.kind === 'skill' && r.bytes > target ? ' *' : ''}`,
    r.missing ? '-' : String(approxTokens(r.bytes)),
    r.missing ? '-' : String(r.descriptionBytes),
    ...(showDelta ? [r.missing ? '-' : fmtDelta(r.delta)] : []),
    r.missing ? '' : r.refs.map((f) => `${f.path} (${f.bytes ?? 'missing'})`).join(', '),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ').trimEnd();
  const skills = rows.filter((r) => r.kind === 'skill' && !r.missing);
  const total = skills.reduce((s, r) => s + r.bytes, 0);
  const listing = skills.reduce((s, r) => s + r.descriptionBytes, 0);
  return [
    line(head),
    ...body.map(line),
    '',
    `Skills: ${total} bytes (~${approxTokens(total)} tok) in all; descriptions in every session's listing: ${listing} bytes (~${approxTokens(listing)} tok).`,
    `* over the ${target}-byte hot-path target (#55).`,
  ].join('\n');
}

// Skills and agents in the plugin folder, in a stable order.
export function listEntries(root) {
  const skills = readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, 'skills', d.name, 'SKILL.md')))
    .map((d) => ({ kind: 'skill', name: d.name, path: `skills/${d.name}/SKILL.md` }));
  const agents = existsSync(join(root, 'agents'))
    ? readdirSync(join(root, 'agents'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ kind: 'agent', name: f.slice(0, -3), path: `agents/${f}` }))
    : [];
  const byName = (a, b) => a.name.localeCompare(b.name);
  return [...skills.sort(byName), ...agents.sort(byName)];
}

export function parseArgs(argv) {
  const opts = { base: null, maxBytes: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--base' || a === '--max-bytes') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new Error(`${a} needs a value`);
      if (a === '--base') opts.base = v;
      else {
        if (!/^\d+$/.test(v) || Number(v) === 0) throw new Error('--max-bytes needs a positive whole number');
        opts.maxBytes = Number(v);
      }
    } else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`skill-size: ${e.message}`);
    console.error('usage: node scripts/skill-size.mjs [--base <git-ref>] [--max-bytes <n>] [--json]');
    process.exit(2);
  }
  const readLocal = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  const entries = listEntries(root);
  let rows = measure(entries, readLocal);
  if (opts.base) {
    const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      git(['rev-parse', '--verify', '--quiet', `${opts.base}^{commit}`]);
    } catch {
      console.error(`skill-size: ${opts.base} is not a git commit, branch or tag here`);
      process.exit(2);
    }
    const readBase = (p) => {
      try {
        return git(['show', `${opts.base}:${p}`]);
      } catch {
        return null;
      }
    };
    rows = withDelta(rows, measure(entries, readBase));
  }
  if (opts.json) console.log(JSON.stringify(rows, null, 2));
  else console.log(formatTable(rows, { showDelta: Boolean(opts.base) }));
  if (opts.maxBytes) {
    const over = overBudget(rows, opts.maxBytes);
    for (const r of over) console.error(`✖ ${r.path}: ${r.bytes} bytes > ${opts.maxBytes}`);
    if (over.length) process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
