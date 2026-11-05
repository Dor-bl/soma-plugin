#!/usr/bin/env node
// Starts appium-mcp exactly as .mcp.json does, performs the MCP handshake over
// stdio and checks that the tools the SOMA skills rely on are still exposed,
// and that remote servers are blocked when no remote URL is configured.
// Used by CI and by the check-setup skill.
// Exit codes: 0 OK, 1 failed (crash, protocol error, missing tools, remote not blocked),
// 2 timed out (inconclusive), 130 interrupted.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProcessTree, parseSnapshot, takeSnapshots, killCommand, SNAPSHOT_COMMAND, watchCommand } from './process-tree.mjs';

const REQUIRED_TOOLS = [
  'select_device',
  'appium_session_management',
  'appium_find_element',
  'appium_gesture',
  'appium_get_page_source',
  'appium_screenshot',
  // generate-test
  'appium_generate_tests',
  'generate_locators',
  // backends/appium.md
  'appium_set_value',
  'appium_get_text',
  'appium_app_lifecycle',
  // start-device, via backends/appium.md
  'prepare_ios_simulator',
  'appium_prepare_ios_real_device',
];
// Includes the first npm ci install of appium-mcp, which is slow on a cold cache.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 480_000);

// Substitute variables the way Claude Code does, with every plugin setting
// left at its empty default.
const pluginRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
// CLAUDE_PLUGIN_DATA is taken from the environment when set (CI points it at a cached
// folder); otherwise it stays empty and the launcher installs into the plugin's .runtime/.
const resolve = (value) =>
  value
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot)
    .replaceAll('${CLAUDE_PLUGIN_DATA}', process.env.CLAUDE_PLUGIN_DATA ?? '')
    .replace(/\$\{user_config\.\w+\}/g, '');

const config = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
const server = config.mcpServers['appium-mcp'];
const command = resolve(server.command);
const args = (server.args ?? []).map(resolve);
const env = { ...process.env };
for (const [key, value] of Object.entries(server.env ?? {})) env[key] = resolve(value);
console.log(`Starting: ${command} ${args.join(' ')}`);

const isWindows = process.platform === 'win32';
const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env,
  // npx is a .cmd shim on Windows and needs a shell; node does not.
  shell: isWindows && command !== 'node',
  // Own process group on POSIX, so the whole launcher -> npm/appium-mcp tree can be stopped
  detached: !isWindows,
});
let stderr = '';
child.stderr.on('data', (d) => (stderr += d));

// Windows has no process groups to signal, so the server tree is tracked by PID while it
// runs and stopped process by process (see process-tree.mjs).
const TRACK_MS = 3_000;
const tree = createProcessTree({
  rootPid: child.pid,
  startedAt: Date.now() - 2_000,
  isRootRunning: () => child.exitCode === null && child.signalCode === null,
});
const [psCommand, psArgs] = SNAPSHOT_COMMAND;

let tracker = null;
if (isWindows) {
  const [watchCmd, watchArgs] = watchCommand(TRACK_MS);
  tracker = spawn(watchCmd, watchArgs, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let pending = '';
  tracker.stdout.setEncoding('utf8');
  tracker.stdout.on('data', (chunk) => {
    const { snapshots, rest } = takeSnapshots(pending + chunk);
    pending = rest;
    for (const { takenAt, rows } of snapshots) tree.absorb(rows, takenAt);
  });
  tracker.on('error', () => {});
}

function stopWindowsTree() {
  // Repeat: a process spawned while we kill shows up in the next snapshot
  for (let pass = 0; pass < 4; pass++) {
    const takenAt = Date.now();
    const rows = parseSnapshot(
      execFileSync(psCommand, psArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }),
    );
    tree.absorb(rows, takenAt);
    const targets = tree.targets(rows);
    if (!targets.length) break;
    const [killCmd, killArgs] = killCommand(targets);
    try {
      execFileSync(killCmd, killArgs, { stdio: 'ignore', windowsHide: true });
    } catch {
      // the next pass retries anything still running
    }
  }
}

// child.kill() only stops the top process (the launcher here) and can leave the
// appium-mcp node process running, so stop the whole tree.
// SIGTERM only asks: wait briefly for the group to go, then force anything still there.
async function stopPosixGroup() {
  process.kill(-child.pid, 'SIGTERM');
  const deadline = Date.now() + 1_000;
  for (;;) {
    try {
      process.kill(-child.pid, 0); // throws once no process in the group is left
    } catch {
      return;
    }
    if (Date.now() >= deadline) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // gone in the meantime
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function stopServer() {
  try {
    if (isWindows) stopWindowsTree();
    else await stopPosixGroup();
  } catch (err) {
    if (isWindows) console.error(`[soma] could not enumerate server processes, stopping only the launcher: ${err.message}`);
    child.kill();
  }
}

// Never resolves: the process exits once cleanup is done. Callers that continue after
// finish() must await it, or they would run on while the server is being stopped.
let finished = false;
async function finish(code, msg) {
  if (finished) return new Promise(() => {});
  finished = true;
  tracker?.kill();
  clearTimeout(timer);
  (code ? console.error : console.log)(msg);
  if (code && stderr) console.error(`--- server stderr (tail) ---\n${stderr.slice(-4000)}`);
  await stopServer();
  process.exit(code);
}

const timer = setTimeout(() => finish(2, `✘ No tools/list response within ${TIMEOUT_MS} ms`), TIMEOUT_MS);
child.on('exit', (code) => finish(1, `✘ Server exited early with code ${code}`));
// The server runs in its own process group on POSIX, so Ctrl+C no longer reaches it
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => finish(130, `✘ Interrupted (${signal})`));
}

// Once finish() has started, the server is being stopped: send nothing more, and treat a
// broken input pipe as expected. Before that, a broken pipe is a failure.
const send = (msg) => {
  if (!finished) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
};
child.stdin.on('error', (err) => {
  if (!finished) finish(1, `✘ Writing to the server failed: ${err.message}`);
});
const pending = new Map();
const request = (id, method, params = {}) =>
  new Promise((resolve) => {
    pending.set(id, resolve);
    send({ id, method, params });
  });

let buffer = '';
child.stdout.on('data', (chunk) => {
  // A late reply must not resume the handshake while cleanup runs
  if (finished) return;
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // non-protocol output
    }
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const init = await request(1, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'soma-ci', version: '0.0.0' },
});
if (init.error) await finish(1, `✘ initialize failed: ${JSON.stringify(init.error)}`);
const { name, version } = init.result.serverInfo ?? {};
console.log(`Connected to ${name} ${version}`);
send({ method: 'notifications/initialized' });

const list = await request(2, 'tools/list');
if (list.error) await finish(1, `✘ tools/list failed: ${JSON.stringify(list.error)}`);
const tools = new Set(list.result.tools.map((t) => t.name));
console.log(`Server exposes ${tools.size} tools`);

const missing = REQUIRED_TOOLS.filter((t) => !tools.has(t));
if (missing.length) await finish(1, `✘ Missing tools required by SOMA skills: ${missing.join(', ')}`);
console.log(`✔ All ${REQUIRED_TOOLS.length} required tools present`);

// With no remote_server_url configured, the launcher must block every remote server.
const blocked = await request(3, 'tools/call', {
  name: 'appium_session_management',
  arguments: { action: 'create', platform: 'android', remoteServerUrl: 'https://example.com/wd/hub' },
});
const blockedText = JSON.stringify(blocked.result ?? blocked.error ?? {});
if (!/Invalid remoteServerUrl/.test(blockedText)) {
  await finish(1, `✘ Remote server was not blocked without a configured URL: ${blockedText.slice(0, 300)}`);
}
await finish(0, '✔ Remote servers are blocked when no remote URL is configured');
