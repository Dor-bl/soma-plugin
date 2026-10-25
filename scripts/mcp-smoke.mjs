#!/usr/bin/env node
// Starts appium-mcp exactly as .mcp.json does, performs the MCP handshake over
// stdio and checks that the tools the SOMA skills rely on are still exposed.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REQUIRED_TOOLS = [
  'select_device',
  'appium_session_management',
  'appium_find_element',
  'appium_gesture',
  'appium_get_page_source',
  'appium_screenshot',
];
// Includes the npx download of appium-mcp, which is slow on a cold cache.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 480_000);

const config = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
const { command, args = [] } = config.mcpServers['appium-mcp'];
console.log(`Starting: ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
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
finish(0, `✔ All ${REQUIRED_TOOLS.length} required tools present`);
