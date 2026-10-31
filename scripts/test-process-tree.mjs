#!/usr/bin/env node
// Tests the Windows process-tree tracking mcp-smoke.mjs uses for cleanup:
// every server process is found, and nothing outside the tree is ever a kill target.
import { createProcessTree, parseSnapshot, takeSnapshots, killCommand } from './process-tree.mjs';

const T0 = 1_000_000;
const ROOT = 100;
let rootRunning = true;
const make = () => {
  rootRunning = true;
  return createProcessTree({ rootPid: ROOT, startedAt: T0, isRootRunning: () => rootRunning });
};
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
  // 300 starts while its parent 200 is alive and is seen; then 200 exits.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 100);
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20), row(300, 200, T0 + 1_500)], T0 + 3_000);
  const later = [row(ROOT, 1, T0 + 10), row(300, 200, T0 + 1_500)];
  tree.absorb(later, T0 + 6_000);
  check('keeps a child after its parent exits', pids(tree, later), [ROOT, 300]);
}

{
  // 300 started before its parent was last seen alive, but was first seen after the parent exited
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 3_000);
  const later = [row(ROOT, 1, T0 + 10), row(300, 200, T0 + 2_000)];
  tree.absorb(later, T0 + 6_000);
  check('adopts an orphan that provably started while its parent was alive', pids(tree, later), [ROOT, 300]);
}

{
  // Copilot: 200 last seen at +100, exits; PID 200 is reused by an unrelated program that
  // starts child 400 at +2000 and exits, all between snapshots. 400 is ambiguous: left alone.
  const tree = make();
  tree.absorb([row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)], T0 + 100);
  const rows = [row(ROOT, 1, T0 + 10), row(400, 200, T0 + 2_000)];
  tree.absorb(rows, T0 + 3_100);
  check('ignores an orphan started after its parent was last seen', pids(tree, rows), [ROOT]);
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

{
  // Copilot: the launcher exits before the first snapshot and its PID is reused. The root's
  // identity is never taken from a snapshot made after the spawned process exited.
  const tree = make();
  rootRunning = false;
  const rows = [row(ROOT, 1, T0 + 500), row(500, ROOT, T0 + 600)];
  tree.absorb(rows, T0 + 1_000);
  check('does not take the root identity after the root exited', pids(tree, rows), []);
}

{
  const tree = make();
  const rows = [row(300, 200, T0 + 30), row(ROOT, 1, T0 + 10), row(200, ROOT, T0 + 20)];
  tree.absorb(rows, T0 + 100);
  check('orders kill targets parents first', tree.targets(rows).map((r) => r.pid), [ROOT, 200, 300]);
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

{
  // PowerShell flattens a one-element array of arrays, which once made the kill loop treat
  // the creation time as a PID; each target must stay a single "pid:created" string.
  const script = (targets) => killCommand(targets)[1][2];
  check('kill list keeps a single target intact', script([row(17480, 1, 1793307752479)]).includes("@('17480:1793307752479')"), true);
  check('kill list keeps each of several targets intact', script([row(1, 0, 10), row(2, 0, 20)]).includes("@('1:10','2:20')"), true);
  check('kill only after the creation time matches', /-eq \[long\]\$created\) \{ \$p\.Kill\(\)/.test(script([row(1, 0, 10)])), true);
  // The handle must be opened before the check and kept until after the kill
  const one = script([row(1, 0, 10)]);
  check('opens the handle before checking the start time', one.indexOf('$null = $p.Handle') >= 0 && one.indexOf('$null = $p.Handle') < one.indexOf('$p.StartTime'), true);
  check('releases the handle afterwards', /finally \{ if \(\$p\) \{ \$p\.Dispose\(\) \} \}/.test(one), true);
}

if (failed) {
  console.error(`✘ ${failed} process-tree test(s) failed`);
  process.exit(1);
}
console.log('✔ Process-tree tests passed');
