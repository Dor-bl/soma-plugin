"""One-time AndroidWorld setup of the running emulator: installs its apps and sets
their permissions, with the workarounds in aw_compat.py. Takes several minutes;
it downloads the APKs from AndroidWorld's storage bucket.

  python setup_device.py --adb <adb path> [--console-port 5554] [--grpc-port 8554]
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import aw_compat  # noqa: E402,F401  (patches applied at import)
from android_world.env import env_launcher  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--adb', required=True)
ap.add_argument('--console-port', type=int, default=5554)
ap.add_argument('--grpc-port', type=int, default=8554)
a = ap.parse_args()

env = env_launcher.load_and_setup_env(
    console_port=a.console_port, emulator_setup=True, adb_path=a.adb,
    grpc_port=a.grpc_port)
env.close()
print('SETUP DONE')
