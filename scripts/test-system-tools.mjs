import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { systemRootFrom } from './system-tools.mjs';

// Only a drive-qualified folder counts. Drive-relative ("C:Windows") and root-relative
// ("\Windows", "/Windows") values must never win, even over a valid windir.
assert.equal(systemRootFrom({ SystemRoot: 'D:\\Windows', windir: 'C:\\Windows' }), 'D:\\Windows');
assert.equal(systemRootFrom({ SystemRoot: 'C:Windows', windir: 'E:\\WIN' }), 'E:\\WIN');
assert.equal(systemRootFrom({ SystemRoot: '\\Windows', windir: 'C:\\Windows' }), 'C:\\Windows');
assert.equal(systemRootFrom({ SystemRoot: '/Windows', windir: 'C:/Windows' }), 'C:/Windows');
assert.equal(systemRootFrom({ SystemRoot: '\\Windows', windir: '/Windows' }), 'C:\\Windows');
assert.equal(systemRootFrom({}), 'C:\\Windows');

// With no usable system folder in the environment, the tools must still be absolute paths
delete process.env.SystemRoot;
delete process.env.windir;
const { POWERSHELL, TASKKILL } = await import('./system-tools.mjs?unset');
if (process.platform === 'win32') {
  for (const tool of [POWERSHELL, TASKKILL]) {
    assert.ok(isAbsolute(tool) && /^[A-Za-z]:[\\/]/.test(tool), tool);
  }
} else {
  assert.deepEqual([POWERSHELL, TASKKILL], ['powershell', 'taskkill']);
}
console.log('✔ system tool paths are drive-qualified on Windows');
