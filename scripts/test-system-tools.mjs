import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

// With no usable system folder in the environment, the Windows tools must still be absolute
// paths, never drive-relative ones such as "C:Windows\System32\taskkill.exe"
delete process.env.SystemRoot;
delete process.env.windir;
const { POWERSHELL, TASKKILL } = await import('./system-tools.mjs');
if (process.platform === 'win32') {
  for (const tool of [POWERSHELL, TASKKILL]) {
    assert.ok(isAbsolute(tool) && /^[A-Za-z]:[\\/]/.test(tool), tool);
  }
} else {
  assert.deepEqual([POWERSHELL, TASKKILL], ['powershell', 'taskkill']);
}
console.log('✔ system tool paths are absolute on Windows');
