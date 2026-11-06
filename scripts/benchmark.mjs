// Live benchmark: what does the SOMA plugin change in token use, compared with plain Claude
// Code driving the same appium-mcp server? Not run in CI: it needs the `claude` CLI (logged
// in), Node 22+, `adb` and ONE running Android emulator, and it spends model calls.
//   node scripts/benchmark.mjs [--runs 3] [--tasks id,id] [--arms plain,soma] [--model <id>]
//                              [--timeout-min 15] [--out <folder>] [--dry-run]
// See benchmarks/README.md for the method and how to read the results.
//
// Both arms get the same appium-mcp launch (this repo's launcher, and --strict-mcp-config so
// nothing else is loaded), the same tools allowed and the same task text. They differ only in
// what SOMA ships besides the server: "soma" loads the plugin with --plugin-dir and sends the
// task through /soma:run-test; "plain" sends it as a bare prompt. Each run starts from a reset
// device state, and the outcome is checked with adb, not by trusting the reply.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, parseEvents, summarise, toMarkdown } from './benchmark-stats.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const { app, tasks: allTasks } = JSON.parse(readFileSync(join(root, 'benchmarks', 'tasks.json'), 'utf8'));
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`);
  return value;
};
const runs = Number(flag('runs', 3));
const arms = flag('arms', 'plain,soma').split(',');
const taskIds = flag('tasks', allTasks.map((t) => t.id).join(',')).split(',');
const model = flag('model', '');
const timeoutMs = Number(flag('timeout-min', 15)) * 60_000;
const outDir = flag('out', join(root, 'benchmarks', 'results'));
const dryRun = process.argv.includes('--dry-run');

const tasks = taskIds.map((id) => allTasks.find((t) => t.id === id) ?? fail(`unknown task: ${id}`));
for (const arm of arms) if (!['plain', 'soma'].includes(arm)) fail(`unknown arm: ${arm}`);
if (!Number.isInteger(runs) || runs < 1) fail('--runs must be a positive integer');

// The plugin's own placeholders stay unsubstituted when it is loaded with --plugin-dir, and
// skills read that as local mode; the server comes from --mcp-config instead
const launcher = join(root, 'scripts', 'start-appium-mcp.mjs');
const mcpConfig = JSON.stringify({
  mcpServers: { 'appium-mcp': { command: 'node', args: [launcher], env: { SOMA_DATA_DIR: process.env.CLAUDE_PLUGIN_DATA ?? join(root, '.runtime') } } },
});
// The same for both arms. Bash is open because SOMA's skills may call adb or aapt; the plain
// arm gets the same freedom, and any use of it is counted in tool calls.
const ALLOWED = ['Read', 'Bash', 'Skill', 'mcp__appium-mcp'];

// What the tester says. Skills stop to confirm the plan, which -p cannot answer, so both arms
// carry the confirmation up front.
const CONFIRM = `Platform Android, app ${app.name} (${app.package}) on the running emulator. I confirm the steps and the app: run it now without asking again, and finish with a one-line result.`;
const promptFor = (arm, task) =>
  arm === 'soma'
    ? `/soma:run-test android ${task.steps} ${CONFIRM}`
    : `Using the Appium tools, on an Android device: ${task.steps} ${CONFIRM}`;

if (dryRun) {
  for (const task of tasks) for (const arm of arms) console.log(`[${arm}] ${task.id}: ${promptFor(arm, task)}`);
  console.log(`${tasks.length * arms.length * runs} runs planned (${runs} per task and arm)`);
  process.exit(0);
}

const adb = (args) => spawnSync('adb', args.split(' '), { encoding: 'utf8' });
// For steps that must work for a run to mean anything: stop the whole benchmark otherwise
const adbOrFail = (args) => {
  const r = adb(args);
  if (r.error || r.status !== 0) fail(`adb ${args} failed: ${r.error?.message ?? (r.stderr || `exit ${r.status}`).trim()}`);
  return r;
};
const devices = (adb('devices').stdout ?? '').split('\n').slice(1).filter((l) => /\tdevice$/.test(l.trim()));
if (devices.length !== 1) fail(`need exactly one running device for adb, found ${devices.length}`);

let running = null;
let workspace = null;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (running) killTree(running);
    if (workspace) cleanUp(workspace);
    console.error(`✘ stopped by ${signal}`);
    process.exit(130);
  });
}

mkdirSync(outDir, { recursive: true });
const results = [];
// Interleaved, so drift (a warming emulator, a busy machine) hits both arms alike
for (let n = 1; n <= runs; n++) {
  for (const task of tasks) {
    for (const arm of arms) {
      // A reset that did not take could leave the expected value from the last run in place
      for (const cmd of task.reset) adbOrFail(cmd);
      adbOrFail('shell input keyevent KEYCODE_HOME');
      const cwd = (workspace = mkdtempSync(join(tmpdir(), 'soma-bench-')));
      const args = [
        '-p', promptFor(arm, task),
        '--strict-mcp-config', '--mcp-config', mcpConfig,
        '--allowedTools', ...ALLOWED,
        '--output-format', 'stream-json', '--verbose',
        '--no-session-persistence',
        ...(arm === 'soma' ? ['--plugin-dir', root] : []),
        ...(model ? ['--model', model] : []),
      ];
      const started = Date.now();
      const run = await runClaude(args, { cwd, timeout: timeoutMs });
      cleanUp(cwd);
      workspace = null;
      const m = measure(parseEvents(run.stdout ?? ''));
      const check = verify(task, m.reply);
      const passed = !run.error && !m.isError && check.ok;
      results.push({ task: task.id, arm, run: n, passed, checkError: check.error ?? null, ...m, wallSec: (Date.now() - started) / 1000, error: run.error?.message ?? null });
      console.log(`${passed ? '✔' : '✘'}${check.error ? ' (adb check failed: ' + check.error + ')' : ''} run ${n} ${task.id} [${arm}]: ${m.total == null ? 'no usage reported' : m.total.toLocaleString('en-US') + ' tokens'}, ${m.toolCalls} tool calls, ${m.durationSec?.toFixed(0) ?? '?'} s${run.error ? ` (${run.error.message})` : ''}`);
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const models = [...new Set(results.map((r) => r.model).filter(Boolean))];
const table = toMarkdown(summarise(results));
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ date: stamp, models, runsPerCell: runs, adbDevice: devices[0], appiumMcp: appiumMcpVersion(), results }, null, 2));
writeFileSync(join(outDir, `${stamp}.md`), `Model: ${models.join(', ') || 'unknown'}; runs per task and arm: ${runs}\n\n${table}\n`);
console.log(`\n${table}\n\nSaved to ${join(outDir, stamp)}.{json,md}`);

// The outcome as the device and the reply show it, never the reply alone for state changes
// Returns { ok } or { ok: false, error } when adb itself failed, which says nothing about the task
function verify(task, reply) {
  const r = adb(task.verify.adb);
  if (r.error || r.status !== 0) return { ok: false, error: r.error?.message ?? (r.stderr || `exit ${r.status}`).trim() };
  const out = (r.stdout ?? '').trim();
  if (task.verify.expectInReply) {
    // The whole value: "14" must not match inside "114" or "14.1"
    const escaped = out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { ok: out !== '' && new RegExp(`(?<![\\d.])${escaped}(?!\\d|\\.\\d)`).test(reply) };
  }
  return { ok: out.includes(task.verify.expect) };
}

// On Windows a folder stays locked for a moment while a child of the finished run (the
// appium-mcp server) exits. A leftover temp folder must never lose the results.
function cleanUp(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (error) {
    console.error(`⚠ could not remove ${dir}: ${error.code ?? error.message}`);
  }
}

function appiumMcpVersion() {
  return JSON.parse(readFileSync(join(root, 'runtime', 'package.json'), 'utf8')).dependencies['appium-mcp'];
}

function fail(message) {
  console.error(`✘ ${message}`);
  process.exit(1);
}

// Same approach as injection-check.mjs: claude.exe directly, claude.cmd through cmd.exe with
// quoted arguments, and the whole process tree stopped on timeout.
function runClaude(args, { cwd, timeout }) {
  const win = process.platform === 'win32';
  let file = 'claude';
  let argv = args;
  let extra = {};
  if (win) {
    const found = spawnSync('where', ['claude'], { encoding: 'utf8' }).stdout?.split(/\r?\n/).filter(Boolean) ?? [];
    const exe = found.find((p) => /\.exe$/i.test(p));
    if (exe) {
      file = exe;
    } else {
      const quote = (a) => `"${String(a).replace(/"/g, '""')}"`;
      file = quote(found.find((p) => /\.cmd$/i.test(p)) ?? 'claude.cmd');
      argv = args.map(quote);
      extra = { shell: true, windowsVerbatimArguments: true };
    }
  }
  return new Promise((resolve) => {
    const child = spawn(file, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: !win, windowsHide: true, env: { ...process.env, MCP_TIMEOUT: process.env.MCP_TIMEOUT ?? '120000' }, ...extra });
    running = child;
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    child.on('error', (error) => {
      clearTimeout(timer);
      running = null;
      resolve({ error, stdout, stderr });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      running = null;
      const error = timedOut ? new Error(`timed out after ${timeout / 60_000} min`) : status ? new Error(`claude exited with ${status}: ${stderr.slice(-200)}`) : undefined;
      resolve({ status, stdout, stderr, error });
    });
  });
}

function killTree(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}
