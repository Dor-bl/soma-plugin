// Starts appium-mcp with a remote-server allowlist pinned to the exact URL
// configured in the plugin settings (see allowlist.mjs).
//
// appium-mcp and its whole dependency tree are pinned by runtime/package-lock.json.
// On first start, and whenever the lockfile changes, they are installed with
// `npm ci --ignore-scripts` into the plugin's data folder, so a changed or
// compromised transitive release cannot be picked up silently.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowRegexFor } from './allowlist.mjs';

const runtimeDir = fileURLToPath(new URL('../runtime/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(runtimeDir, 'package.json'), 'utf8'));
const APPIUM_MCP = `appium-mcp@${manifest.dependencies['appium-mcp']}`;
const lockfile = readFileSync(join(runtimeDir, 'package-lock.json'));
const lockHash = createHash('sha256').update(lockfile).digest('hex').slice(0, 16);
const binPath = JSON.parse(lockfile).packages['node_modules/appium-mcp'].bin['appium-mcp'];

// stdout carries the MCP protocol, so every message from here goes to stderr.
const log = (msg) => console.error(`[soma] ${msg}`);

// SOMA_DATA_DIR is ${CLAUDE_PLUGIN_DATA} from .mcp.json; it survives plugin updates.
// Unset, or left as a literal placeholder: fall back to a folder in the plugin itself.
const configured = process.env.SOMA_DATA_DIR;
const dataDir = configured && !configured.includes('${') ? configured : fileURLToPath(new URL('../.runtime/', import.meta.url));
const installDir = join(dataDir, `appium-mcp-${lockHash}`);
const entry = join(installDir, 'node_modules', 'appium-mcp', binPath);

if (!existsSync(entry)) install();

function install() {
  log(`installing ${APPIUM_MCP} from the lockfile into ${installDir} (first start can take several minutes)`);
  const staging = `${installDir}.tmp-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  copyFileSync(join(runtimeDir, 'package.json'), join(staging, 'package.json'));
  copyFileSync(join(runtimeDir, 'package-lock.json'), join(staging, 'package-lock.json'));
  const isWindows = process.platform === 'win32';
  // Fixed arguments only, so shell: true on Windows (needed to run npm.cmd) is safe.
  const result = spawnSync(
    isWindows ? 'npm.cmd' : 'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--no-update-notifier', '--omit=dev'],
    { cwd: staging, stdio: ['ignore', process.stderr, process.stderr], shell: isWindows },
  );
  if (result.status !== 0 || !existsSync(join(staging, 'node_modules', 'appium-mcp', binPath))) {
    rmSync(staging, { recursive: true, force: true });
    log(`npm ci failed (${result.error?.message ?? `exit code ${result.status}`}); ${APPIUM_MCP} was not started`);
    process.exit(1);
  }
  try {
    renameSync(staging, installDir);
  } catch (err) {
    // Another launcher finished the same install first; use that one.
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(entry)) {
      log(`could not move the install into place: ${err.message}`);
      process.exit(1);
    }
  }
  // Best effort: drop installs of older lockfiles (about 370 MB each), and staging
  // folders left by installs that were killed. A staging folder whose launcher is
  // still running is left alone. A failure here must not stop the new server, e.g.
  // on Windows while another session still runs an old install.
  for (const name of readdirSync(dataDir)) {
    const stale = /^appium-mcp-[0-9a-f]{16}$/.test(name)
      ? join(dataDir, name) !== installDir
      : /^appium-mcp-[0-9a-f]{16}\.tmp-(\d+)$/.test(name) && !isRunning(Number(name.split('.tmp-')[1]));
    if (!stale) continue;
    try {
      rmSync(join(dataDir, name), { recursive: true, force: true });
    } catch (err) {
      log(`could not remove the old install ${name}: ${err.message}`);
    }
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

const env = {
  ...process.env,
  REMOTE_SERVER_URL_ALLOW_REGEX: allowRegexFor(process.env.SOMA_REMOTE_SERVER_URL),
};
delete env.SOMA_REMOTE_SERVER_URL;
delete env.SOMA_DATA_DIR;

// Run the entry point with this same node, so no shell is involved on any platform.
const child = spawn(process.execPath, [entry], { stdio: 'inherit', env });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (err) => {
  log(`failed to start ${APPIUM_MCP}: ${err.message}`);
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
