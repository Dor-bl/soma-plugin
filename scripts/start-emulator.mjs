#!/usr/bin/env node
// Lists Android emulators, or starts one and watches it boot. Used by the start-device skill.
//
//   node start-emulator.mjs --list
//   node start-emulator.mjs <avd> [--cold] [--gpu <mode>] [--timeout <seconds>]
//
// The emulator is started detached and keeps running after this script exits. If the AVD
// is already running (or still starting), the script waits for that instance instead.
// Exit codes: 0 booted, 1 emulator exited before boot (crash), 2 timed out (still running),
// 3 usage/setup error, including startup flags for an AVD that is already running.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
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

// { ok, out }: ok is false if the command is missing, fails or times out
function exec(cmd, args, timeout = 15_000) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim() };
  } catch {
    return { ok: false, out: '' };
  }
}
const run = (cmd, args, timeout) => exec(cmd, args, timeout).out;

function fail(code, msg, usageLine = false) {
  console.error(`✘ ${msg}`);
  if (usageLine) console.error('Usage: node start-emulator.mjs --list | <avd> [--cold] [--gpu <mode>] [--timeout <seconds>]');
  process.exit(code);
}

// Setup checks first, so a missing tool is reported as such rather than as a hang or as
// "no AVDs"
if (!exec(ADB, ['version']).ok) {
  fail(3, `SETUP: adb not found or not working (${ADB}). Install Android SDK platform-tools and set ANDROID_HOME.`);
}
const avdList = exec(EMULATOR, ['-list-avds']);
if (!avdList.ok) {
  fail(3, `SETUP: could not list AVDs with ${EMULATOR}. Install the Android Emulator and set ANDROID_HOME.`);
}
const avds = avdList.out.split(/\r?\n/).map((l) => l.trim())
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

// Emulators adb knows about, as { serial, state, avd }. The AVD name is only readable once
// the device is online.
function adbEmulators() {
  return run(ADB, ['devices']).split(/\r?\n/).slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial]) => serial?.startsWith('emulator-'))
    .map(([serial, state]) => ({ serial, state, avd: state === 'device' ? avdName(serial) : null }));
}

// Whether an emulator process for this AVD is running, from process command lines. This
// works while adb still lists the emulator as offline (or not at all), when its AVD name
// can't be read yet. null if the process list can't be read.
function avdProcessRunning(name) {
  const listing = isWindows
    ? exec('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name like 'emulator%' or Name like 'qemu-system%'\" | ForEach-Object { $_.CommandLine }"])
    : exec('ps', ['-A', '-o', 'args=']);
  if (!listing.ok) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\s)-avd\\s+"?${escaped}"?(\\s|$)`);
  return listing.out.split(/\r?\n/).some((line) => /emulator|qemu-system/i.test(line) && re.test(line));
}

const args = process.argv.slice(2);

if (args[0] === '--list') {
  const running = adbEmulators();
  console.log(`emulator: ${EMULATOR}`);
  console.log(`AVDs: ${avds.length ? avds.join(', ') : '(none found)'}`);
  for (const r of running) console.log(`running: ${r.serial} ${r.state} avd=${r.avd ?? 'unknown (still starting)'}`);
  if (!running.length) console.log('running: (none)');
  process.exit(avds.length ? 0 : 3);
}

const avd = args[0];
if (!avd || avd.startsWith('--')) fail(3, 'missing AVD name', true);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cold = flag('--cold');
const gpu = option('--gpu');
const timeoutMs = (Number(option('--timeout')) || 300) * 1000;

if (!avds.includes(avd)) fail(3, `AVD "${avd}" not found. Run with --list to see available AVDs.`, true);

const start = Date.now();
const elapsed = () => `${Math.round((Date.now() - start) / 1000)}s`;
const known = adbEmulators();
let serial = known.find((r) => r.avd === avd)?.serial ?? null;
// Already running: adb names it, or its process is up while adb can't name it yet
const existing = serial !== null || avdProcessRunning(avd) === true;
let child = null;
let logPath = null;

if (existing) {
  if (cold || gpu) {
    console.log(`STATUS: ALREADY RUNNING: ${avd}${serial ? ` (${serial})` : ''} is already running, and --cold/--gpu only apply when the emulator starts. Close it first, then run again.`);
    process.exit(3);
  }
  console.log(serial ? `already running as ${serial}; waiting for boot only` : `${avd} is already starting; waiting for it to come online`);
} else {
  // Pick the first free console port so the serial is known up front
  const used = new Set(known.map((r) => Number(r.serial.split('-')[1])));
  let port = 5554;
  while (used.has(port)) port += 2;
  serial = `emulator-${port}`;

  const emuArgs = ['-avd', avd, '-port', String(port)];
  if (cold) emuArgs.push('-no-snapshot-load');
  if (gpu) emuArgs.push('-gpu', gpu);
  // A fresh private folder, and 'wx' so an existing file (or link) is never written through
  logPath = join(mkdtempSync(join(tmpdir(), 'soma-emulator-')), `${avd}.log`);
  const log = openSync(logPath, 'wx');
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
  // An instance that was still starting: find its serial once adb can name it
  if (!serial) serial = adbEmulators().find((r) => r.avd === avd)?.serial ?? null;
  const state = (serial && run(ADB, ['-s', serial, 'get-state'], 5_000)) || 'not listed';
  // An emulator we didn't start has no exit event: notice when its process is gone
  if (existing && state !== 'device' && avdProcessRunning(avd) === false) {
    finish(1, `CRASHED: the running ${avd} emulator exited after ${elapsed()}, before boot completed`);
    return;
  }
  const booted = state === 'device' && run(ADB, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 5_000) === '1';
  const now = booted ? 'boot completed' : state;
  if (now !== last) {
    console.log(`[${elapsed()}] ${serial ?? avd}: ${now}`);
    last = now;
  }
  if (booted) {
    const android = run(ADB, ['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], 5_000);
    finish(0, `BOOTED: ${serial} (${avd}, Android ${android}) in ${elapsed()}`);
  }
}, 3_000);

const timer = setTimeout(
  () => finish(2, `TIMEOUT: ${serial ?? avd} not booted after ${timeoutMs / 1000}s (last state: ${last || 'none'}); the emulator is still running`),
  timeoutMs,
);
