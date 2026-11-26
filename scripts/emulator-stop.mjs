// Pure helpers for `start-emulator.mjs --stop`: argument parsing and deciding, from what
// adb and the process list report, whether the stopped emulator is really gone.
// Tested in test-emulator-stop.mjs.

export const DEFAULT_STOP_SECONDS = 60;

// args: everything after `--stop`. Returns { name, timeoutMs } or { error }.
// Only `--timeout <seconds>` may follow the name, and it must be a finite number above 0,
// so a stray flag (`--timeout --cold`) or `Infinity` is rejected before anything is stopped.
export function parseStopArgs(args) {
  const [name, ...rest] = args;
  if (!name || name.startsWith('--')) return { error: 'missing AVD name after --stop' };
  if (rest.length === 0) return { name, timeoutMs: DEFAULT_STOP_SECONDS * 1000 };
  if (rest.length !== 2 || rest[0] !== '--timeout') return { error: 'only --timeout <seconds> goes with --stop' };
  const value = rest[1];
  const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return { error: `--timeout needs a number of seconds above 0, not "${value}"` };
  return { name, timeoutMs: seconds * 1000 };
}

// adb: { ok, serials } from `adb devices`; proc: true / false / null (process list unreadable).
// 'stopped' only when both observers were read and neither still shows the emulator;
// 'unknown' when either read failed, so a failed read is never taken as "gone".
export function stopState({ adb, proc, targets }) {
  if (!adb.ok || proc === null) return 'unknown';
  if (proc || adb.serials.some((s) => targets.includes(s))) return 'running';
  return 'stopped';
}
