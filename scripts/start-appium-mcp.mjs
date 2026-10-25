// Starts appium-mcp with a remote-server allowlist pinned to the exact URL
// configured in the plugin settings. The model passes remoteServerUrl as a
// tool argument, so without this any https host could receive the
// device-cloud credentials from the capabilities file.
import { spawn } from 'node:child_process';

const APPIUM_MCP = 'appium-mcp@1.97.1';
const DENY_ALL = '^(?!)$';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`);
}

function allowRegexFor(configured) {
  const value = (configured || '').trim();
  if (!value || value.startsWith('${')) return DENY_ALL;
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`[soma] remote_server_url is not a valid URL; remote sessions are disabled.`);
    return DENY_ALL;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash) {
    console.error('[soma] remote_server_url must be https:// (http:// only for localhost) with no credentials, query or fragment; remote sessions are disabled.');
    return DENY_ALL;
  }
  return `^${escapeRegex(value.replace(/\/+$/, ''))}\\/?$`;
}

const env = {
  ...process.env,
  REMOTE_SERVER_URL_ALLOW_REGEX: allowRegexFor(process.env.SOMA_REMOTE_SERVER_URL),
};
delete env.SOMA_REMOTE_SERVER_URL;

const isWindows = process.platform === 'win32';
// Fixed arguments only, so shell: true on Windows (needed to run npx.cmd) is safe.
const child = spawn(isWindows ? 'npx.cmd' : 'npx', ['-y', APPIUM_MCP], {
  stdio: 'inherit',
  env,
  shell: isWindows,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (err) => {
  console.error(`[soma] failed to start ${APPIUM_MCP}: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    // Drop the forwarding handler so re-raising terminates this process
    // with the same signal instead of being caught and exiting 0.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
