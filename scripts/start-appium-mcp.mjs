// Starts appium-mcp with a remote-server allowlist pinned to the exact URL
// configured in the plugin settings (see allowlist.mjs).
//
// appium-mcp and its whole dependency tree are pinned by runtime/package-lock.json.
// On first start, and whenever the lockfile changes, they are installed with
// `npm ci --ignore-scripts` into the plugin's data folder, so a changed or
// compromised transitive release cannot be picked up silently.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

// Launchers of different plugin versions share dataDir. Checking an install and
// marking it in use, and choosing what to delete, both happen under one lock, so
// cleanup cannot remove an install that another launcher is about to run.
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const lockPath = join(dataDir, '.lock');
const inUseMarker = join(installDir, `.in-use-${process.pid}`);
mkdirSync(dataDir, { recursive: true });

// Mark this install as in use, so a launcher for a newer lockfile (e.g. another
// session after a plugin update) does not delete it while this server runs: the
// server loads some modules only when a tool first needs them.
const claimInstall = () => {
  if (!existsSync(entry)) return false;
  try {
    writeFileSync(inUseMarker, '');
  } catch (err) {
    log(`could not mark the install as in use: ${err.message}`);
  }
  return true;
};

if (!(await withLock(claimInstall))) {
  const staging = await install();
  await withLock(() => {
    try {
      renameSync(staging, installDir);
    } catch {
      // Another launcher finished the same install first; use that one.
      rmSync(staging, { recursive: true, force: true });
    }
    if (!claimInstall()) {
      log(`could not move the install into place at ${installDir}`);
      process.exit(1);
    }
  });
}
process.on('exit', () => removeQuietly(inUseMarker));

try {
  const trash = await withLock(markStaleInstalls);
  for (const dir of trash) removeDir(dir);
} catch (err) {
  log(`skipped cleaning up old installs: ${err.message}`);
}

// Installs into a staging folder and returns its path. Runs npm asynchronously, so a
// signal that arrives during a (minutes-long) cold install stops npm's whole process
// tree and removes the staging folder instead of leaving npm writing to it.
async function install() {
  log(`installing ${APPIUM_MCP} from the lockfile into ${installDir} (first start can take several minutes)`);
  const staging = `${installDir}.tmp-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  copyFileSync(join(runtimeDir, 'package.json'), join(staging, 'package.json'));
  copyFileSync(join(runtimeDir, 'package-lock.json'), join(staging, 'package-lock.json'));
  const isWindows = process.platform === 'win32';
  // Fixed arguments only, so shell: true on Windows (needed to run npm.cmd) is safe.
  // On POSIX, npm gets its own process group so the whole tree can be signalled.
  const npm = spawn(
    isWindows ? 'npm.cmd' : 'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--no-update-notifier', '--omit=dev'],
    { cwd: staging, stdio: ['ignore', 2, 2], shell: isWindows, detached: !isWindows, windowsHide: true },
  );
  const done = new Promise((resolve) => {
    npm.on('error', (err) => resolve({ error: err }));
    npm.on('close', (status) => resolve({ status }));
  });
  // Lets cleanup tell an orphaned npm (launcher force-killed) from an abandoned folder
  if (npm.pid) writeFileSync(join(staging, '.npm-pid'), String(npm.pid));

  let stopping = false;
  const onSignal = async (signal) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} during install: stopping npm`);
    killTree(npm.pid, isWindows);
    await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
    rmSync(staging, { recursive: true, force: true });
    for (const s of SIGNALS) process.removeAllListeners(s);
    process.kill(process.pid, signal);
  };
  for (const s of SIGNALS) process.on(s, onSignal);
  const result = await done;
  // The signal handler cleans up and ends the process
  if (stopping) await new Promise(() => {});
  for (const s of SIGNALS) process.removeListener(s, onSignal);

  if (result.status !== 0 || !existsSync(join(staging, 'node_modules', 'appium-mcp', binPath))) {
    rmSync(staging, { recursive: true, force: true });
    log(`npm ci failed (${result.error?.message ?? `exit code ${result.status}`}); ${APPIUM_MCP} was not started`);
    process.exit(1);
  }
  rmSync(join(staging, '.npm-pid'), { force: true });
  return staging;
}

function killTree(pid, isWindows) {
  if (!pid) return;
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

// Takes an exclusive lock file in dataDir, runs fn, and releases it. A lock held by a
// launcher that no longer runs is taken over. If the lock cannot be had within 60 s,
// fn still runs, so a stuck lock never stops the server from starting.
async function withLock(fn) {
  const deadline = Date.now() + 60_000;
  let held = false;
  while (!held && Date.now() < deadline) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      held = true;
    } catch (err) {
      if (err.code !== 'EEXIST') break;
      const owner = Number(readFileSafe(lockPath));
      if (owner && !isRunning(owner)) removeQuietly(lockPath);
      else await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!held) log('could not take the install lock; continuing without it');
  try {
    return await fn();
  } finally {
    if (held) removeQuietly(lockPath);
  }
}

// Under the lock: renames installs of older lockfiles (about 370 MB each) that no
// running launcher has marked as in use, and staging folders of installs that were
// killed, to trash names, and returns them. They are deleted after the lock is
// released, so a slow delete does not hold up other launchers. Best effort: a failure
// here must not stop the new server, e.g. on Windows when a file is still held open.
function markStaleInstalls() {
  // Markers of launchers that were force-killed (no exit handler ran)
  for (const f of readdirSync(installDir)) {
    if (/^\.in-use-\d+$/.test(f) && !isRunning(Number(f.slice(8)))) removeQuietly(join(installDir, f));
  }
  const trash = [];
  for (const name of readdirSync(dataDir)) {
    const dir = join(dataDir, name);
    const staging = /^appium-mcp-[0-9a-f]{16}\.tmp-(\d+)$/.exec(name);
    const leftover = /^appium-mcp-[0-9a-f]{16}(?:\.tmp-\d+)?\.trash-(\d+)$/.exec(name);
    let stale;
    if (staging) stale = !isRunning(Number(staging[1])) && !isRunning(Number(readFileSafe(join(dir, '.npm-pid'))));
    else if (leftover) stale = !isRunning(Number(leftover[1])); // a delete that was interrupted
    else stale = /^appium-mcp-[0-9a-f]{16}$/.test(name) && dir !== installDir && !inUse(dir);
    if (!stale) continue;
    if (leftover) {
      trash.push(dir);
      continue;
    }
    const target = `${dir}.trash-${process.pid}`;
    try {
      renameSync(dir, target);
      trash.push(target);
    } catch (err) {
      log(`could not remove the old install ${name}: ${err.message}`);
    }
  }
  return trash;
}

function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    log(`could not remove the old install ${dir}: ${err.message}`);
  }
}

function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function removeQuietly(path) {
  try {
    rmSync(path, { force: true });
  } catch (err) {
    log(`could not remove ${path}: ${err.message}`);
  }
}

function inUse(dir) {
  try {
    return readdirSync(dir).some((f) => /^\.in-use-\d+$/.test(f) && isRunning(Number(f.slice(8))));
  } catch {
    return true; // can't tell, so keep it
  }
}

function isRunning(pid) {
  // 0 or a missing PID would signal this process group, not a process
  if (!Number.isInteger(pid) || pid <= 0) return false;
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
