// Windows looks in the current folder before PATH for a bare executable name, and the
// launcher runs in the tester's project folder. Use the system copies by full path.
import { join } from 'node:path';

const windows = process.platform === 'win32';
const system32 = join(process.env.SystemRoot ?? process.env.windir ?? 'C:\Windows', 'System32');

export const POWERSHELL = windows ? join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
export const TASKKILL = windows ? join(system32, 'taskkill.exe') : 'taskkill';
