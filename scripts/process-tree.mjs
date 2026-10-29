// Tracks a process tree by PID on Windows, where there are no process groups to signal.
// Used by mcp-smoke.mjs to stop every process the server started.
//
// Each tracked PID is stored with { created, lastSeen } (ms). PIDs stay tracked after the
// process exits, so a process whose parent already exited is still found. Identity is
// checked by creation time, because Windows reuses PIDs: a recorded PID now held by
// another process is neither killed nor used to adopt that process's children.

// One "pid ppid createdMs" line per process. Only the needed properties are fetched,
// which makes the query several times cheaper.
const SNAPSHOT =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object { ' +
  '$c = if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; ' +
  '"$($_.ProcessId) $($_.ParentProcessId) $c" }';

// A single snapshot, for cleanup
export const SNAPSHOT_COMMAND = ['powershell', ['-NoProfile', '-Command', SNAPSHOT]];

// A long-running PowerShell that prints a snapshot every `intervalMs`: a "T <ms>" line
// with the time it was taken, the process lines, then an END line. Starting PowerShell
// costs far more CPU than the query, and that CPU competes with the npm install of
// appium-mcp on small CI runners.
export const watchCommand = (intervalMs) => [
  'powershell',
  ['-NoProfile', '-Command', `while ($true) { 'T ' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); ${SNAPSHOT}; 'END'; Start-Sleep -Milliseconds ${intervalMs} }`],
];

export function parseSnapshot(text) {
  return text.split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter(([pid]) => pid)
    .map(([pid, ppid, created]) => ({ pid, ppid, created }));
}

// Splits watch output into complete snapshots ({ takenAt, rows }) and the unfinished rest
export function takeSnapshots(buffer) {
  const snapshots = [];
  let m;
  while ((m = buffer.match(/^T (\d+)\r?\n([\s\S]*?)^END\r?$/m))) {
    snapshots.push({ takenAt: Number(m[1]), rows: parseSnapshot(m[2]) });
    buffer = buffer.slice(m.index + m[0].length).replace(/^\r?\n/, '');
  }
  return { snapshots, rest: buffer };
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
