import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { holdStdin } from './stdin-gate.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const collect = (stream) => {
  let text = '';
  let ended = false;
  stream.on('data', (d) => (text += d));
  stream.on('end', () => (ended = true));
  return { text: () => text, ended: () => ended };
};

// Stdin closed while waiting: onEnd runs once
{
  const stdin = new PassThrough();
  let calls = 0;
  holdStdin(stdin, () => calls++);
  stdin.write('{"method":"initialize"}\n');
  stdin.end();
  await tick();
  stdin.destroy();
  await tick();
  assert.equal(calls, 1);
  console.log('✔ closing stdin during the wait calls onEnd once');
}

// A stdin error counts as closed and does not throw
{
  const stdin = new PassThrough();
  let calls = 0;
  holdStdin(stdin, () => calls++);
  stdin.destroy(new Error('EPIPE'));
  await tick();
  assert.equal(calls, 1);
  console.log('✔ a stdin error counts as closed');
}

// Release: held chunks first, in order, then the rest; end passes through; onEnd not called
{
  const stdin = new PassThrough();
  const server = new PassThrough();
  const out = collect(server);
  let calls = 0;
  const gate = holdStdin(stdin, () => calls++);
  stdin.write('one\n');
  stdin.write('two\n');
  await tick();
  gate.release(server);
  stdin.write('three\n');
  stdin.end();
  await tick();
  await tick();
  assert.equal(out.text(), 'one\ntwo\nthree\n');
  assert.equal(out.ended(), true);
  assert.equal(calls, 0);
  console.log('✔ release replays held input, forwards the rest and the end, without calling onEnd');
}

// Release after stdin already ended (onEnd chose not to exit): replay, then end the target
{
  const stdin = new PassThrough();
  const server = new PassThrough();
  const out = collect(server);
  const gate = holdStdin(stdin, () => {});
  stdin.end('last\n');
  await tick();
  gate.release(server);
  await tick();
  assert.equal(out.text(), 'last\n');
  assert.equal(out.ended(), true);
  console.log('✔ release after the end replays the input and ends the target');
}
