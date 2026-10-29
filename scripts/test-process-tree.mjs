#!/usr/bin/env node
// Tests the Windows process-tree tracking mcp-smoke.mjs uses for cleanup:
// every server process is found, and nothing outside the tree is ever a kill target.
import { createProcessTree, parseSnapshot, takeSnapshots } from './process-tree.mjs';

const T0 = 1_000_000;
const ROOT = 100;
const make = () => createProcessTree({ rootPid: ROOT, startedAt: T0, orphanGraceMs: 5_000 });
const row = (pid, ppid, created) => ({ pid, ppid, created });
const pids = (tree, rows) => tree.targets(rows).map((r) => r.pid).sort((a, b) => a - b);

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : `: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

{
  const tree = make();
  const rows = [row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20), row(300, 200, T0 + 30), row(999, 1, T0 + 40)];
  tree.absorb(rows, T0 + 100);
  check('finds the whole tree, not unrelated processes', pids(tree, rows), [ROOT, 200, 300]);
}

{
  // The intermediate parent (200) is killed between snapshots; its child (300) survives.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 100);
  const later = [row(ROOT, 1, T0 + 10), row(300, 200, T0 + 1_500)];
  tree.absorb(later, T0 + 3_000);
  check('adopts an orphan whose parent exited after being seen', pids(tree, later), [ROOT, 300]);
}

{
  // Greptile P1: tracked 200 exits, Windows reuses PID 200 for an unrelated program,
  // which starts its own child 400. Neither may be adopted or killed.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 100);
  const reused = [row(ROOT, 1, T0 + 10), row(200, 50, T0 + 60_000), row(400, 200, T0 + 61_000)];
  tree.absorb(reused, T0 + 62_000);
  check('ignores a reused parent PID and its children', pids(tree, reused), [ROOT]);
}

{
  // The reused process has exited too, leaving its child orphaned with ppid 200.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 100);
  const orphaned = [row(ROOT, 1, T0 + 10), row(400, 200, T0 + 61_000)];
  tree.absorb(orphaned, T0 + 62_000);
  check('ignores an orphan born long after its parent PID was last seen', pids(tree, orphaned), [ROOT]);
}

{
  const tree = make();
  const rows = [row(ROOT, 1, T0 + 10), row(200, ROOT, T0 - 5_000)];
  tree.absorb(rows, T0 + 100);
  check('ignores a process created before the server started', pids(tree, rows), [ROOT]);
}

{
  // The root's own PID is reused by an unrelated program after the root exits.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10)], T0 + 100);
  const rows = [row(ROOT, 1, T0 + 90_000)];
  tree.absorb(rows, T0 + 91_000);
  check('never kills a reused root PID', pids(tree, rows), []);
}

check(
  'parses the PowerShell snapshot',
  parseSnapshot(' 4 0 0\r\n100 1 1761700000000\r\n\r\n'),
  [row(4, 0, 0), row(100, 1, 1761700000000)],
);

{
  // Watch output arrives in arbitrary chunks; only complete snapshots are returned
  const first = takeSnapshots('T 500\r\n100 1 10\r\n200 100 20\r\nEND\r\nT 900\r\n100 1 10\r\n');
  check('splits complete snapshots from chunked watch output', first.snapshots, [
    { takenAt: 500, rows: [row(100, 1, 10), row(200, 100, 20)] },
  ]);
  const second = takeSnapshots(first.rest + '300 200 30\r\nEND\r\n');
  check('completes a snapshot from the next chunk', second.snapshots, [
    { takenAt: 900, rows: [row(100, 1, 10), row(300, 200, 30)] },
  ]);
  check('leaves nothing pending after a complete snapshot', second.rest, '');
}

if (failed) {
  console.error(`✘ ${failed} process-tree test(s) failed`);
  process.exit(1);
}
console.log('✔ Process-tree tests passed');
