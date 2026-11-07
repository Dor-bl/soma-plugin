// Starts appium-mcp with a remote-server allowlist pinned to the exact URL
// configured in the plugin settings (see allowlist.mjs).
//
// appium-mcp and its whole dependency tree are pinned by runtime/package-lock.json.
// On first start, and whenever the lockfile changes, they are installed with
// `npm ci --ignore-scripts` into the plugin's data folder, so a changed or
// compromised transitive release cannot be picked up silently.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowRegexFor } from './allowlist.mjs';
import { childEnv } from './child-env.mjs';
import { POWERSHELL, TASKKILL } from './system-tools.mjs';

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

// Launchers of different plugin versions share dataDir, and each removes installs of
// other lockfiles that no running launcher uses. There is no lock (a crashed holder
// could leave it stale); instead claiming and removing follow a handshake:
// - A launcher claims an install by writing its in-use marker into it, waiting while
//   a live launcher is deciding whether to remove it (a `<install>.doom-<pid>` file),
//   then checking the install is still complete. A doom file is deleted only once its
//   PID is shown to be reused (the process started after the file was written).
// - Removal creates its doom file first, skips the install if it has a live marker,
//   renames it to a trash name, and checks the markers again. A marker written in
//   between belongs to a launcher that is waiting on the doom file, so the install
//   is renamed back.
// Either the claiming launcher sees the doom file, or removal sees its marker.
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const inUseMarker = join(installDir, `.in-use-${process.pid}`);
const installLog = `${installDir}.install.log`;
mkdirSync(dataDir, { recursive: true });

// Installer mode (see runInstaller): install, move the result into place, and exit
if (process.argv[2] === '--install') {
  const staging = await install();
  try {
    renameSync(staging, installDir);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    // Another launcher finished the same install first: use that one. Otherwise (e.g.
    // EPERM/EBUSY from an antivirus scan on Windows) a retry would repeat the whole npm ci.
    if (!existsSync(entry)) {
      log(`could not move the new install into ${installDir}: ${err.message}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

// The marker also keeps the install while this server runs: the server loads some
// modules only when a tool first needs them.
let claimed = false;
for (let attempt = 0; !claimed && attempt < 5; attempt++) {
  claimed = await claimInstall();
  // A failed claim on a complete install means removal raced it: just claim again
  if (claimed || existsSync(entry)) continue;
  await runInstaller();
}
if (!claimed) {
  log(`could not set up ${APPIUM_MCP} in ${installDir}; it was not started`);
  process.exit(1);
}
process.on('exit', () => removeQuietly(inUseMarker));

// After the server has started (below), so deleting old installs does not delay it
setTimeout(() => {
  try {
    removeStaleInstalls();
  } catch (err) {
    log(`skipped cleaning up old installs: ${err.message}`);
  }
}, 0);

async function claimInstall() {
  try {
    writeFileSync(inUseMarker, '');
  } catch {
    return false; // not installed (yet)
  }
  // Wait as long as a remover runs: its doom file stops counting once it exits
  let checkAfter = Date.now() + 60_000;
  let warned = false;
  let doomFiles;
  while ((doomFiles = liveDoomFiles(installDir)).length) {
    if (Date.now() > checkAfter) {
      // A remover holds its doom file for milliseconds. One held this long belongs to a
      // paused remover (keep waiting) or to one that was killed and whose PID was
      // reused: that process started after the doom file was written.
      for (const f of doomFiles.filter(isReusedPid)) {
        log(`removing ${f}: left by a launcher that was killed while removing an install`);
        removeQuietly(join(dataDir, f));
      }
      if (!warned && liveDoomFiles(installDir).length) {
        log(`still waiting for another launcher to finish removing or keeping ${basename(installDir)}`);
        warned = true;
      }
      checkAfter = Date.now() + 60_000;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  // Both, in this folder: removal may have moved our marker into trash while a fresh
  // copy of the same install took its place, and that copy does not carry our claim
  if (existsSync(inUseMarker) && existsSync(entry)) return true;
  removeQuietly(inUseMarker);
  return false;
}

function liveDoomFiles(dir) {
  const prefix = `${basename(dir)}.doom-`;
  return readdirSync(dataDir).filter((f) => f.startsWith(prefix) && isRunning(doomPid(f)));
}

function doomPid(name) {
  return Number(name.slice(name.lastIndexOf('.doom-') + 6));
}

// True only when the doom file's PID now belongs to a process that started after the
// file was written. If either time can't be read, the file is kept (startup waits).
function isReusedPid(name) {
  let written;
  try {
    written = statSync(join(dataDir, name)).mtimeMs;
  } catch {
    return false; // already gone
  }
  return startedAt(doomPid(name)) > written;
}

// Start time of a process in ms since the epoch, or NaN if it can't be read. ps prints
// whole seconds (rounded down), so a remover is never taken for a reused PID.
function startedAt(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return NaN;
  const run = process.platform === 'win32'
    ? spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o')`], { encoding: 'utf8', windowsHide: true })
    : spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  return Date.parse(run.stdout?.trim() ?? '');
}

// Runs the install in a detached copy of this script and waits for it. Claude Code gives
// an MCP server 30 s to start and then stops it, while a cold install takes minutes; the
// detached installer keeps going, so a reconnect (/mcp) or the next session finds the
// install ready instead of starting over. A launcher that finds an installer already
// running waits for that one.
async function runInstaller() {
  let pid = liveInstaller();
  if (pid) {
    log(`waiting for another launcher's install of ${APPIUM_MCP} to finish`);
  } else {
    log(`installing ${APPIUM_MCP} from the lockfile into ${installDir} (first start can take several minutes; if Claude Code reports that the server failed to connect, reconnect with /mcp once it has finished)`);
    const out = openSync(installLog, 'w');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--install'], {
      detached: true, stdio: ['ignore', out, out], windowsHide: true,
    });
    closeSync(out);
    child.unref();
    pid = child.pid;
  }
  while (!existsSync(entry) && isRunning(pid)) await new Promise((r) => setTimeout(r, 500));
  if (!existsSync(entry)) {
    log(`the install of ${APPIUM_MCP} failed; its output:\n${readFileSafe(installLog).slice(-3000)}`);
    process.exit(1);
  }
  removeQuietly(installLog);
}

// PID of a running installer for this lockfile (its staging folder is named after it), or 0
function liveInstaller() {
  const prefix = `${basename(installDir)}.tmp-`;
  const pid = readdirSync(dataDir).filter((f) => f.startsWith(prefix)).map((f) => Number(f.slice(prefix.length))).find(isRunning);
  return pid ?? 0;
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
    const exited = await Promise.race([done.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]);
    // Still running: force it, so npm does not keep writing into the folder removed below
    if (!exited) {
      killTree(npm.pid, isWindows, 'SIGKILL');
      await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
    }
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

// taskkill /F already forces on Windows; signal applies to POSIX
function killTree(pid, isWindows, signal = 'SIGTERM') {
  if (!pid) return;
  try {
    if (isWindows) spawnSync(TASKKILL, ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-pid, signal);
  } catch {
    // already gone
  }
}

// Best effort: removes installs of other lockfiles (about 370 MB each) that no running
// launcher uses, staging folders of installs that were killed, and leftovers of
// removals that were interrupted. A failure here must not stop the server, e.g. on
// Windows when a file is still held open.
function removeStaleInstalls() {
  // Markers of launchers that were force-killed (no exit handler ran)
  for (const f of readdirSync(installDir)) {
    if (/^\.in-use-\d+$/.test(f) && !isRunning(Number(f.slice(8)))) removeQuietly(join(installDir, f));
  }
  for (const name of readdirSync(dataDir)) {
    const dir = join(dataDir, name);
    // Only its own launcher and npm use a staging folder
    const staging = /^appium-mcp-[0-9a-f]{16}\.tmp-(\d+)$/.exec(name);
    const leftover = /^appium-mcp-[0-9a-f]{16}(?:\.tmp-\d+)?\.(?:trash|doom)-(\d+)$/.exec(name);
    if (staging) {
      if (!isRunning(Number(staging[1])) && !isRunning(Number(readFileSafe(join(dir, '.npm-pid'))))) removeDir(dir);
    } else if (leftover) {
      if (!isRunning(Number(leftover[1]))) removeDir(dir);
    } else if (/^appium-mcp-[0-9a-f]{16}\.install\.log$/.test(name) && dir !== installLog) {
      removeQuietly(dir);
    } else if (/^appium-mcp-[0-9a-f]{16}$/.test(name) && dir !== installDir) {
      retire(dir);
    }
  }
}

// The removal side of the handshake described at the top
function retire(dir) {
  const doom = `${dir}.doom-${process.pid}`;
  try {
    writeFileSync(doom, '', { flag: 'wx' });
  } catch {
    return;
  }
  let trash;
  try {
    if (inUse(dir)) return;
    renameSync(dir, `${dir}.trash-${process.pid}`);
    trash = `${dir}.trash-${process.pid}`;
    if (inUse(trash)) {
      try {
        renameSync(trash, dir);
        trash = undefined;
      } catch {
        // A fresh copy of the same install already took its place; that launcher uses it
      }
    }
  } catch (err) {
    // ENOENT: another launcher removed it first
    if (err.code !== 'ENOENT') log(`could not remove the old install ${basename(dir)}: ${err.message}`);
  } finally {
    removeQuietly(doom);
  }
  if (trash) removeDir(trash);
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
  ...childEnv(process.env),
  REMOTE_SERVER_URL_ALLOW_REGEX: allowRegexFor(process.env.SOMA_REMOTE_SERVER_URL),
};
delete env.SOMA_REMOTE_SERVER_URL;
delete env.SOMA_DATA_DIR;

// Run the entry point with this same node, so no shell is involved on any platform.
const child = spawn(process.execPath, [entry], { stdio: 'inherit', env });

// Mark the install with the server's own PID too. If this launcher is force-killed
// (SIGKILL runs no handlers), the server keeps running, and this marker keeps a
// launcher of another plugin version from removing the install under it.
const serverMarker = child.pid ? join(installDir, `.in-use-${child.pid}`) : null;
if (serverMarker) {
  try {
    writeFileSync(serverMarker, '');
  } catch (err) {
    log(`could not mark the install as in use by the server: ${err.message}`);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (err) => {
  log(`failed to start ${APPIUM_MCP}: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (serverMarker) removeQuietly(serverMarker);
  if (signal) {
    // Drop the forwarding handler so re-raising terminates this process
    // with the same signal instead of being caught and exiting 0.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
