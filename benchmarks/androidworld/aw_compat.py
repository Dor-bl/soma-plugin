"""Workarounds applied at import, for AndroidWorld on Windows and on slow emulators.

1. android_env installs APKs from a blob (the accessibility forwarder, on every env
   start) through a NamedTemporaryFile that adb cannot open on Windows with
   Python 3.11. Fixed upstream in google-deepmind/android_env#449; until a release
   has it, the blob case is replaced here. Other platforms and the filesystem case
   are left to the original method.
2. AndroidWorld's app setup gives `adb install` 30 s, too short for the larger
   APKs (OsmAnd) on a software-rendered emulator; a timeout there stops the
   whole setup. Raised to INSTALL_TIMEOUT_SEC.
"""
import os
import sys
import tempfile

from android_env.components import adb_call_parser
from android_env.proto import adb_pb2
from android_world.env import adb_utils

INSTALL_TIMEOUT_SEC = 300.0

_original_install = adb_call_parser.AdbCallParser._install_apk


def _install_apk(self, request, timeout=None):
  install_apk = request.install_apk
  if sys.platform != 'win32' or install_apk.WhichOneof('location') != 'blob':
    return _original_install(self, request, timeout)
  with tempfile.NamedTemporaryFile(suffix='.apk', delete=False) as f:
    fpath = f.name
    f.write(install_apk.blob.contents)
  try:
    response, _ = self._execute_command(
        ['install', '-r', '-t', '-g', fpath], timeout=timeout)
  finally:
    os.remove(fpath)
  return response


adb_call_parser.AdbCallParser._install_apk = _install_apk


def _install_apk_from_path(apk_location, env):
  if not os.path.exists(apk_location):
    raise ValueError('APK does not exist.')
  response = env.execute_adb_call(
      adb_pb2.AdbRequest(
          install_apk=adb_pb2.AdbRequest.InstallApk(
              filesystem=adb_pb2.AdbRequest.InstallApk.Filesystem(
                  path=apk_location)),
          timeout_sec=INSTALL_TIMEOUT_SEC,
      ))
  if response.status != adb_pb2.AdbResponse.Status.OK:
    raise RuntimeError(f'Failed to install APK {apk_location}: {response}')


adb_utils.install_apk = _install_apk_from_path
