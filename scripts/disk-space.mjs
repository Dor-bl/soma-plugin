// Free disk space where the launcher installs appium-mcp, checked by check-setup before
// the first start (about 370 MB, plus room for npm to unpack and the staging copy).
//
// Usage: node scripts/disk-space.mjs [data folder]
// The data folder is ${CLAUDE_PLUGIN_DATA}; empty or a literal placeholder means the
// plugin's own .runtime/ folder, as in start-appium-mcp.mjs. The folder may not exist yet,
// so the nearest existing parent is measured. Prints one line: OK, WARN or LOW. Exits 1
// only on LOW (not enough room and the pinned appium-mcp is not installed yet).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEEDED_BYTES = 1024 ** 3; // 1 GiB: 370 MB install, staging and npm's unpacking

export function installFolder(configured) {
  return configured && !configured.includes('${') ? resolve(configured) : fileURLToPath(new URL('../.runtime/', import.meta.url));
}

// The nearest folder that exists, starting at `dir`
export function existingAncestor(dir, exists = existsSync) {
  let current = resolve(dir);
  while (!exists(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

const gib = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

// { level: 'OK' | 'WARN' | 'LOW', line }
export function verdict(freeBytes, installed, where, needed = NEEDED_BYTES) {
  if (freeBytes >= needed) return { level: 'OK', line: `OK: ${gib(freeBytes)} free on ${where}.` };
  if (installed) {
    return { level: 'WARN', line: `WARN: only ${gib(freeBytes)} free on ${where}. appium-mcp is installed, but the next SOMA update that changes its pin installs it again and needs about ${gib(needed)}.` };
  }
  return { level: 'LOW', line: `LOW: only ${gib(freeBytes)} free on ${where}; the first start installs appium-mcp there and needs about ${gib(needed)}. Free up space, or set SOMA's data folder on another disk, before the first start.` };
}

// Is the appium-mcp pinned by runtime/package-lock.json already installed in dataDir?
export function isInstalled(dataDir, runtimeDir = fileURLToPath(new URL('../runtime/', import.meta.url))) {
  const lockfile = readFileSync(join(runtimeDir, 'package-lock.json'));
  const lockHash = createHash('sha256').update(lockfile).digest('hex').slice(0, 16);
  return existsSync(join(dataDir, `appium-mcp-${lockHash}`, 'node_modules', 'appium-mcp', 'package.json'));
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const dataDir = installFolder(process.argv[2]);
  const where = existingAncestor(dataDir);
  let free;
  try {
    const stats = statfsSync(where);
    free = stats.bavail * stats.bsize;
  } catch (err) {
    console.log(`UNKNOWN: could not read free space on ${where} (${err.code ?? err.message}).`);
    process.exit(0);
  }
  const { level, line } = verdict(free, isInstalled(dataDir), where);
  console.log(line);
  process.exit(level === 'LOW' ? 1 : 0);
}
