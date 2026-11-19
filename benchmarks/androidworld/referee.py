"""AndroidWorld referee for one benchmark run: sets up a task, waits, checks it.

Started by scripts/benchmark.mjs (--suite androidworld) with the AndroidWorld
Python environment. One process for the whole run, because some checks compare
against state captured when the task is set up, and the task object holds the
random parameters.

  python referee.py --task ContactsAddContact --seed 1 --dir <run folder> \
      --adb <adb path> [--console-port 5554] [--grpc-port 8554]

  1. connects to the running emulator, goes Home, sets up the task
  2. writes <dir>/goal.json  {"task", "seed", "goal", "complexity"}
  3. waits until <dir>/done exists (the agent under test works meanwhile)
  4. writes <dir>/result.json {"success": 0.0 to 1.0, "error"}, tears the task down

A failure before goal.json exits non-zero with the error on stderr. A check
that raises is reported in result.json as "error", with success 0.
"""
import argparse
import json
import pathlib
import random
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import aw_compat  # noqa: E402,F401  (patches applied at import)
import android_world  # noqa: E402
from android_world import registry  # noqa: E402
from android_world.env import env_launcher  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--task', required=True)
ap.add_argument('--seed', type=int, required=True)
ap.add_argument('--dir', required=True)
ap.add_argument('--adb', required=True)
ap.add_argument('--console-port', type=int, default=5554)
ap.add_argument('--grpc-port', type=int, default=8554)
ap.add_argument('--timeout', type=float, default=3600, help='seconds to wait for done')
ap.add_argument('--commit', required=True,
                help='the AndroidWorld commit the task list was made for')
a = ap.parse_args()


def check_android_world(expected):
  """Refuses an AndroidWorld that is not the pinned commit, or has local edits.

  The task goals and checks come from the installed AndroidWorld, so another
  version (or a modified checkout) would run different tasks under the same
  names. It must be a git checkout installed in editable mode, as the README
  says; anything else cannot be verified and is refused.
  """
  root = pathlib.Path(android_world.__file__).resolve().parent.parent

  def git(*args):
    r = subprocess.run(['git', '-C', str(root), *args], capture_output=True,
                       text=True)
    return r.stdout.strip() if r.returncode == 0 else None

  head = git('rev-parse', 'HEAD')
  if head is None:
    sys.exit(f'AndroidWorld at {root} is not a git checkout, so its version '
             'cannot be checked; install it from a clone with pip install -e')
  if head != expected:
    sys.exit(f'AndroidWorld at {root} is at {head}, the task list needs '
             f'{expected}: git -C "{root}" checkout {expected}')
  edits = git('status', '--porcelain', '--untracked-files=no')
  if edits:
    sys.exit(f'AndroidWorld at {root} has local changes to tracked files, '
             'which can change the tasks: ' + edits.replace('\n', '; '))


check_android_world(a.commit)

out = pathlib.Path(a.dir)
out.mkdir(parents=True, exist_ok=True)


def write(name, data):
  # Written whole, then renamed, so a reader never sees half a file
  tmp = out / (name + '.tmp')
  tmp.write_text(json.dumps(data, indent=2), encoding='utf-8')
  tmp.replace(out / name)


env = env_launcher.load_and_setup_env(
    console_port=a.console_port, emulator_setup=False, adb_path=a.adb,
    grpc_port=a.grpc_port)
try:
  env.reset(go_home=True)
  task_type = registry.TaskRegistry().get_registry(
      registry.TaskRegistry.ANDROID_WORLD_FAMILY)[a.task]
  random.seed(a.seed)
  np.random.seed(a.seed)
  task = task_type(task_type.generate_random_params())
  task.initialize_task(env)
  write('goal.json', {'task': a.task, 'seed': a.seed, 'goal': task.goal,
                      'complexity': task.complexity})

  start = time.time()
  while not (out / 'done').exists() and time.time() - start < a.timeout:
    time.sleep(1)

  error = None
  try:
    success = float(task.is_successful(env))
  except Exception as e:  # reported, never counted as a pass
    success, error = 0.0, repr(e)
  write('result.json', {'task': a.task, 'seed': a.seed, 'success': success,
                        'error': error})
  task.tear_down(env)
finally:
  env.close()
