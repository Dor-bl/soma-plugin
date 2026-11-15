// Holds the MCP client's stdin while the launcher waits for a first-start install.
//
// Claude Code ends a session by closing the server's stdin, waiting about 300 ms and then
// killing the launcher's whole process tree (taskkill /T /F on Windows), which can take the
// detached installer with it (#77). Watching stdin lets the launcher exit before that, so
// the installer keeps going and the next session finds the install ready.
//
// Watching means reading, and what is read is no longer in the pipe for appium-mcp. So the
// gate keeps every chunk (the client's initialize request is usually among them) and
// release() hands them to the server first, then pipes the rest of stdin through.
export function holdStdin(stream, onEnd) {
  const chunks = [];
  let ended = false;
  let released = false;
  const onData = (chunk) => chunks.push(chunk);
  const onClose = () => {
    if (ended) return;
    ended = true;
    if (!released) onEnd();
  };
  stream.on('data', onData);
  stream.on('end', onClose);
  stream.on('close', onClose);
  // A broken stdin counts as closed; the error itself must not crash the launcher
  stream.on('error', onClose);
  return {
    // Writes the held chunks to target, then forwards the rest of the stream to it.
    release(target) {
      released = true;
      stream.off('data', onData);
      stream.off('end', onClose);
      stream.off('close', onClose);
      for (const chunk of chunks.splice(0)) target.write(chunk);
      if (ended) target.end();
      else stream.pipe(target);
    },
  };
}
