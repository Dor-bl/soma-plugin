// Tracks a process tree by PID on Windows, where there are no process groups to signal.
// Used by mcp-smoke.mjs to stop every process the server started.
//
// Each tracked PID is stored with { created, lastSeen } (ms). PIDs stay tracked after the
// process exits, so a process whose parent already exited is still found. Identity is
// checked by creation time, because Windows reuses PIDs: a recorded PID now held by
// another process is neither killed nor used to adopt that process's children.

// Rows of { pid, ppid, created } from the PowerShell snapshot below
export const SNAPSHOT_COMMAND = [
  'powershell',
  [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | ForEach-Object { ' +
      '$c = if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; ' +
      '"$($_.ProcessId) $($_.ParentProcessId) $c" }',
  ],
];

export function parseSnapshot(text) {
  return text.split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter(([pid]) => pid)
    .map(([pid, ppid, created]) => ({ pid, ppid, created }));
}

// rootPid: the process we spawned. startedAt: nothing created before this is ours.
// orphanGraceMs: a process whose parent is gone is only adopted if it started no later
// than this long after the parent was last seen alive, so a reused-then-exited PID can't
// lend its identity to processes started later.
export function createProcessTree({ rootPid, startedAt, orphanGraceMs }) {
  const tree = new Map([[rootPid, { created: null, lastSeen: Date.now() }]]);

  // True if `row` is the same process that was recorded under its PID
  const isTracked = (row) => tree.get(row.pid)?.created === row.created;

  // Record the root's current descendants. `takenAt` is when the snapshot was taken.
  function absorb(rows, takenAt) {
    const byPid = new Map(rows.map((r) => [r.pid, r]));
    const root = tree.get(rootPid);
    const rootRow = byPid.get(rootPid);
    if (root.created === null && rootRow && rootRow.created >= startedAt) root.created = rootRow.created;
    for (const row of rows) if (isTracked(row)) tree.get(row.pid).lastSeen = takenAt;

    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (tree.has(row.pid) || row.created < startedAt) continue;
        const parent = tree.get(row.ppid);
        if (!parent || parent.created === null || row.created < parent.created) continue;
        const parentRow = byPid.get(row.ppid);
        // Parent PID alive: it must still be the process we recorded, not a reuse.
        // Parent gone: the child must have started while that parent was alive.
        const ok = parentRow ? isTracked(parentRow) : row.created <= parent.lastSeen + orphanGraceMs;
        if (!ok) continue;
        tree.set(row.pid, { created: row.created, lastSeen: takenAt });
        grew = true;
      }
    }
  }

  // The rows in a snapshot that are tracked processes, i.e. safe to kill
  const targets = (rows) => rows.filter(isTracked);

  return { absorb, targets, isTracked, size: () => tree.size };
}
