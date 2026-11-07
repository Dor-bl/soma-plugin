// Windows looks in the current folder before PATH for a bare executable name, and the
// launcher runs in the tester's project folder. Use the system copies by full path.
import { join } from 'node:path';

const windows = process.platform === 'win32';

// The system folder must carry a drive letter: "C:Windows", "\Windows" and "/Windows" all
// depend on the current drive or folder, which is what this module exists to avoid.
export function systemRootFrom(env) {
  return [env.SystemRoot, env.windir].find((dir) => /^[A-Za-z]:[\\/]/.test(dir ?? '')) ?? 'C:\\Windows';
}

const system32 = join(systemRootFrom(process.env), 'System32');

export const POWERSHELL = windows ? join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
export const TASKKILL = windows ? join(system32, 'taskkill.exe') : 'taskkill';
