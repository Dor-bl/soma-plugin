#!/usr/bin/env node
// Starts appium-mcp exactly as .mcp.json does, performs the MCP handshake over
// stdio and checks that the tools the SOMA skills rely on are still exposed,
// and that remote servers are blocked when no remote URL is configured.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
];
// Includes the npx download of appium-mcp, which is slow on a cold cache.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 480_000);

// Substitute variables the way Claude Code does, with every plugin setting
// left at its empty default.
const pluginRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const resolve = (value) =>
  value.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).replace(/\$\{user_config\.\w+\}/g, '');

const config = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
const server = config.mcpServers['appium-mcp'];
const command = resolve(server.command);
const args = (server.args ?? []).map(resolve);
const env = { ...process.env };
for (const [key, value] of Object.entries(server.env ?? {})) env[key] = resolve(value);
console.log(`Starting: ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env,
  // npx is a .cmd shim on Windows and needs a shell; node does not.
  shell: process.platform === 'win32' && command !== 'node',
});
let stderr = '';
child.stderr.on('data', (d) => (stderr += d));

function finish(code, msg) {
  clearTimeout(timer);
  (code ? console.error : console.log)(msg);
  if (code && stderr) console.error(`--- server stderr (tail) ---\n${stderr.slice(-4000)}`);
  child.kill();
  process.exit(code);
}

const timer = setTimeout(() => finish(1, `✘ No tools/list response within ${TIMEOUT_MS} ms`), TIMEOUT_MS);
child.on('exit', (code) => finish(1, `✘ Server exited early with code ${code}`));

const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
const pending = new Map();
const request = (id, method, params = {}) =>
  new Promise((resolve) => {
    pending.set(id, resolve);
    send({ id, method, params });
  });

let buffer = '';
child.stdout.on('data', (chunk) => {
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
if (init.error) finish(1, `✘ initialize failed: ${JSON.stringify(init.error)}`);
const { name, version } = init.result.serverInfo ?? {};
console.log(`Connected to ${name} ${version}`);
send({ method: 'notifications/initialized' });

const list = await request(2, 'tools/list');
if (list.error) finish(1, `✘ tools/list failed: ${JSON.stringify(list.error)}`);
const tools = new Set(list.result.tools.map((t) => t.name));
console.log(`Server exposes ${tools.size} tools`);

const missing = REQUIRED_TOOLS.filter((t) => !tools.has(t));
if (missing.length) finish(1, `✘ Missing tools required by SOMA skills: ${missing.join(', ')}`);
console.log(`✔ All ${REQUIRED_TOOLS.length} required tools present`);

// With no remote_server_url configured, the launcher must block every remote server.
const blocked = await request(3, 'tools/call', {
  name: 'appium_session_management',
  arguments: { action: 'create', platform: 'android', remoteServerUrl: 'https://example.com/wd/hub' },
});
const blockedText = JSON.stringify(blocked.result ?? blocked.error ?? {});
if (!/Invalid remoteServerUrl/.test(blockedText)) {
  finish(1, `✘ Remote server was not blocked without a configured URL: ${blockedText.slice(0, 300)}`);
}
finish(0, '✔ Remote servers are blocked when no remote URL is configured');
