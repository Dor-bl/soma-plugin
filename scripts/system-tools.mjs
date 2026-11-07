// Windows looks in the current folder before PATH for a bare executable name, and the
// launcher runs in the tester's project folder. Use the system copies by full path.
import { isAbsolute, join } from 'node:path';

const windows = process.platform === 'win32';
// An unset or relative SystemRoot must never produce a drive-relative path such as "C:Windows"
const systemRoot = [process.env.SystemRoot, process.env.windir].find((dir) => dir && isAbsolute(dir)) ?? 'C:\\Windows';
const system32 = join(systemRoot, 'System32');

export const POWERSHELL = windows ? join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
export const TASKKILL = windows ? join(system32, 'taskkill.exe') : 'taskkill';
