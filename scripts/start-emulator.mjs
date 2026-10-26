#!/usr/bin/env node
// Lists Android emulators, or starts one and watches it boot. Used by the start-device skill.
//
//   node start-emulator.mjs --list
//   node start-emulator.mjs <avd> [--cold] [--gpu <mode>] [--timeout <seconds>]
//
// The emulator is started detached and keeps running after this script exits.
// Exit codes: 0 booted, 1 emulator exited before boot (crash), 2 timed out (still running), 3 usage/setup error.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

function sdkTool(dir, name) {
  const file = isWindows ? `${name}.exe` : name;
  return sdk && existsSync(join(sdk, dir, file)) ? join(sdk, dir, file) : name;
}
const EMULATOR = sdkTool('emulator', 'emulator');
const ADB = sdkTool('platform-tools', 'adb');

function run(cmd, args, timeout = 15_000) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function usage(msg) {
  if (msg) console.error(`✘ ${msg}`);
  console.error('Usage: node start-emulator.mjs --list | <avd> [--cold] [--gpu <mode>] [--timeout <seconds>]');
  process.exit(3);
}

const listAvds = () => run(EMULATOR, ['-list-avds']).split(/\r?\n/).map((l) => l.trim())
  // The emulator prints INFO/WARNING lines to stdout on some versions
  .filter((l) => l && !/^(INFO|WARNING|ERROR)\b/.test(l) && !l.includes(' '));

// AVD name of a running emulator. Newer emulators require console auth for `adb emu`,
// so read the system property first (ro.boot.* on newer images, ro.kernel.* on older ones).
function avdName(serial) {
  for (const prop of ['ro.boot.qemu.avd_name', 'ro.kernel.qemu.avd_name']) {
    const name = run(ADB, ['-s', serial, 'shell', 'getprop', prop], 5_000);
    if (name) return name;
  }
  return run(ADB, ['-s', serial, 'emu', 'avd', 'name'], 5_000).split(/\r?\n/)[0]?.trim() || null;
}

// Running emulators as { serial, state, avd }
function runningEmulators() {
  return run(ADB, ['devices']).split(/\r?\n/).slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial]) => serial?.startsWith('emulator-'))
    .map(([serial, state]) => ({ serial, state, avd: state === 'device' ? avdName(serial) : null }));
}

const args = process.argv.slice(2);

if (args[0] === '--list') {
  const avds = listAvds();
  const running = runningEmulators();
  console.log(`emulator: ${EMULATOR}`);
  console.log(`AVDs: ${avds.length ? avds.join(', ') : '(none found)'}`);
  for (const r of running) console.log(`running: ${r.serial} ${r.state} avd=${r.avd ?? 'unknown'}`);
  if (!running.length) console.log('running: (none)');
  process.exit(avds.length ? 0 : 3);
}

const avd = args[0];
if (!avd || avd.startsWith('--')) usage('missing AVD name');
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cold = flag('--cold');
const gpu = option('--gpu');
const timeoutMs = (Number(option('--timeout')) || 300) * 1000;

if (!listAvds().includes(avd)) usage(`AVD "${avd}" not found. Run with --list to see available AVDs.`);

const start = Date.now();
const elapsed = () => `${Math.round((Date.now() - start) / 1000)}s`;
const running = runningEmulators();
let serial = running.find((r) => r.avd === avd)?.serial;
let child = null;
let logPath = null;

if (serial) {
  console.log(`already running as ${serial}; waiting for boot only`);
} else {
  // Pick the first free console port so the serial is known up front
  const used = new Set(running.map((r) => Number(r.serial.split('-')[1])));
  let port = 5554;
  while (used.has(port)) port += 2;
  serial = `emulator-${port}`;

  const emuArgs = ['-avd', avd, '-port', String(port)];
  if (cold) emuArgs.push('-no-snapshot-load');
  if (gpu) emuArgs.push('-gpu', gpu);
  logPath = join(tmpdir(), `soma-emulator-${avd}.log`);
  const log = openSync(logPath, 'w');
  console.log(`starting: ${EMULATOR} ${emuArgs.join(' ')}`);
  console.log(`log: ${logPath}`);
  child = spawn(EMULATOR, emuArgs, { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
}

function logFacts() {
  if (!logPath || !existsSync(logPath)) return;
  const lines = readFileSync(logPath, 'utf8').split(/\r?\n/);
  const pick = (re) => lines.filter((l) => re.test(l));
  for (const l of pick(/OpenGL (Vendor|Renderer)=/)) console.log(`  ${l.trim()}`);
  for (const l of pick(/snapshot/i)) console.log(`  ${l.trim()}`);
  console.log('--- emulator log (last 15 lines)');
  console.log(lines.filter(Boolean).slice(-15).join('\n'));
}

function finish(code, status) {
  clearInterval(poll);
  clearTimeout(timer);
  console.log(`STATUS: ${status}`);
  if (code !== 0) logFacts();
  process.exit(code);
}

let last = '';
let exited = false;
child?.on('exit', (code) => {
  exited = true;
  finish(1, `CRASHED: emulator exited after ${elapsed()} with code ${code}, before boot completed`);
});

const poll = setInterval(() => {
  if (exited) return;
  const state = run(ADB, ['-s', serial, 'get-state'], 5_000) || 'not listed';
  const booted = state === 'device' && run(ADB, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 5_000) === '1';
  const now = booted ? 'boot completed' : state;
  if (now !== last) {
    console.log(`[${elapsed()}] ${serial}: ${now}`);
    last = now;
  }
  if (booted) {
    const android = run(ADB, ['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], 5_000);
    finish(0, `BOOTED: ${serial} (${avd}, Android ${android}) in ${elapsed()}`);
  }
}, 3_000);

const timer = setTimeout(
  () => finish(2, `TIMEOUT: ${serial} not booted after ${timeoutMs / 1000}s (last state: ${last || 'none'}); the emulator is still running`),
  timeoutMs,
);
