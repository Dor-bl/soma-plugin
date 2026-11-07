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
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, parseEvents, summarise, toMarkdown } from './benchmark-stats.mjs';
import { TASKKILL } from './system-tools.mjs';

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
// Node turns a NaN, negative or over-2^31 timer delay into 1 ms, which would kill every run at once
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2 ** 31 - 1) fail('--timeout-min must be a positive number of minutes (at most 35791)');

// The plugin's own placeholders stay unsubstituted when it is loaded with --plugin-dir, and
// skills read that as local mode; the server comes from --mcp-config instead
const launcher = join(root, 'scripts', 'start-appium-mcp.mjs');
// Resolved here: each run's child starts in its own temporary folder, so a relative
// CLAUDE_PLUGIN_DATA (".runtime", as the README's warm-up uses) would install a fresh
// server per run instead of reusing the warmed one
const dataDir = process.env.CLAUDE_PLUGIN_DATA ? resolve(process.env.CLAUDE_PLUGIN_DATA) : join(root, '.runtime');
const mcpConfig = JSON.stringify({
  mcpServers: { 'appium-mcp': { command: 'node', args: [launcher], env: { SOMA_DATA_DIR: dataDir } } },
});
// The same for both arms. Bash is open because SOMA's skills may call adb or aapt; the plain
// arm gets the same freedom, and any use of it is counted in tool calls.
const ALLOWED = ['Read', 'Bash', 'Skill', 'mcp__appium-mcp'];

// Large tool results (page source, screenshots) are saved under Claude's config folder, in a
// folder named after the run's working directory. Reading them back is outside the workspace,
// and `claude -p` cannot ask: a denied read blocked an arm in a trial. So each run may read
// its own folder, and nothing else extra.
const claudeProjects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
const savedResultsDir = (cwd) => join(claudeProjects, cwd.replace(/[^a-zA-Z0-9]/g, '-'));

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

// Discovery is unscoped; every later command is pinned to the validated serial with -s, so an
// emulator that drops out mid-run makes the command fail instead of adb picking another device
const adbAny = (args) => spawnSync('adb', args.split(' '), { encoding: 'utf8' });
const devices = (adbAny('devices').stdout ?? '').split('\n').slice(1).filter((l) => /\tdevice$/.test(l.trim()));
if (devices.length !== 1) fail(`need exactly one running device for adb, found ${devices.length}`);
// The runs change settings and force-stop apps, so a physical phone is refused even when it
// is the only device attached: emulator serials always look like emulator-5554
const serial = devices[0].trim().split('\t')[0];
if (!/^emulator-\d+$/.test(serial)) fail(`${serial} is not an emulator. The benchmark changes device settings, so it only runs on an emulator.`);
const adb = (args) => adbAny(`-s ${serial} ${args}`);
// For steps that must work for a run to mean anything: stop the whole benchmark otherwise
const adbOrFail = (args) => {
  const r = adb(args);
  if (r.error || r.status !== 0) fail(`adb ${args} failed: ${r.error?.message ?? (r.stderr || `exit ${r.status}`).trim()}`);
  return r;
};

// A locked or sleeping device makes every run fail the same way and say nothing about either
// arm: the reset step shortens the screen timeout, and a device with a PIN then locks.
// Keep the screen on, wake it, and stop the benchmark if a lock screen is still up.
function requireUnlockedDevice() {
  adbOrFail('shell svc power stayon true');
  adbOrFail('shell input keyevent KEYCODE_WAKEUP');
  adb('shell wm dismiss-keyguard');
  const state = adb('shell dumpsys window').stdout ?? '';
  if (/isKeyguardShowing=true/.test(state)) {
    fail('the device is showing a lock screen. Set Screen lock to None (Settings > Security) or use a fresh emulator, then rerun.');
  }
}

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
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// Written after every run, so an interrupted benchmark keeps the runs it already paid for
function writeReports() {
  const models = [...new Set(results.map((r) => r.model).filter(Boolean))];
  const table = toMarkdown(summarise(results));
  writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ date: stamp, models, runsPerCell: runs, adbDevice: serial, appiumMcp: appiumMcpVersion(), results }, null, 2));
  writeFileSync(join(outDir, `${stamp}.md`), `Model: ${models.join(', ') || 'unknown'}; runs per task and arm: ${runs}\n\n${table}\n`);
  return table;
}
// Interleaved, so drift (a warming emulator, a busy machine) hits both arms alike
for (let n = 1; n <= runs; n++) {
  for (const task of tasks) {
    for (const arm of arms) {
      requireUnlockedDevice();
      // A reset that did not take could leave the expected value from the last run in place
      for (const cmd of task.reset) adbOrFail(cmd);
      // Home only backgrounds Settings, and the next run would resume on the last screen;
      // force-stop ends the task but keeps the app's data (unlike pm clear)
      adbOrFail(`shell am force-stop ${app.package}`);
      adbOrFail('shell input keyevent KEYCODE_HOME');
      // Resolved: the child sees the real path (macOS /var is /private/var) and saved results are keyed by it
      const cwd = (workspace = realpathSync(mkdtempSync(join(tmpdir(), 'soma-bench-'))));
      const saved = savedResultsDir(cwd);
      mkdirSync(saved, { recursive: true });
      const args = [
        '-p', promptFor(arm, task),
        '--strict-mcp-config', '--mcp-config', mcpConfig,
        // Skip the caller's user settings, so a SOMA already enabled there cannot leak into the plain arm
        '--setting-sources', 'project,local',
        '--allowedTools', ...ALLOWED,
        '--add-dir', saved,
        '--output-format', 'stream-json', '--verbose',
        '--no-session-persistence',
        ...(arm === 'soma' ? ['--plugin-dir', root] : []),
        ...(model ? ['--model', model] : []),
      ];
      const started = Date.now();
      const run = await runClaude(args, { cwd, timeout: timeoutMs });
      cleanUp(cwd);
      cleanUp(saved);
      workspace = null;
      const m = measure(parseEvents(run.stdout ?? ''));
      const check = verify(task, m.reply);
      // With Bash allowed, an agent could change the setting through adb and skip the UI work
      // being measured, so a pass also needs at least one appium-mcp tool call that succeeded
      const outcomeOk = !run.error && !m.isError && check.ok;
      const invalid = outcomeOk && m.appiumOk === 0;
      const passed = outcomeOk && !invalid;
      results.push({ task: task.id, arm, run: n, passed, invalid, checkError: check.error ?? null, ...m, wallSec: (Date.now() - started) / 1000, error: run.error?.message ?? null });
      writeReports();
      console.log(`${passed ? '✔' : '✘'}${check.error ? ' (adb check failed: ' + check.error + ')' : ''}${invalid ? ' (no successful appium-mcp call: not counted as a pass)' : ''} run ${n} ${task.id} [${arm}]: ${m.total == null ? 'no usage reported' : m.total.toLocaleString('en-US') + ' tokens'}, ${m.toolCalls} tool calls, ${m.durationSec?.toFixed(0) ?? '?'} s${run.error ? ` (${run.error.message})` : ''}`);
    }
  }
}

const table = writeReports();
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
  // Exact: "60000" must not match inside "600000"
  return { ok: out === task.verify.expect };
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
    if (process.platform === 'win32') spawnSync(TASKKILL, ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}
