// Starts appium-mcp with a remote-server allowlist pinned to the exact URL
// configured in the plugin settings (see allowlist.mjs).
import { spawn } from 'node:child_process';
import { allowRegexFor } from './allowlist.mjs';

const APPIUM_MCP = 'appium-mcp@1.97.1';

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
