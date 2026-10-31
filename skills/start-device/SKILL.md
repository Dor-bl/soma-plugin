---
name: start-device
description: Start an Android emulator and wait until it is fully booted and ready for testing, or diagnose why it crashes or hangs (GPU driver, corrupt snapshot, hypervisor). Use when no device is connected, a tester asks to start or boot an emulator, an emulator keeps crashing, or adb shows a device as offline.
---

# Start a device

Local mode only. Remote Appium server URL configured: `${user_config.remote_server_url}`. If it is empty, or still shows as a literal `${user_config...}` placeholder, it is not set: continue. If it is set, devices come from that server, not this machine: say so and stop. Starting a local emulator, or running `adb` here, would not affect the remote session and could act on the wrong device. The one exception: the tester explicitly asks for a local device anyway (for example to use an engine that only reaches local `adb` devices, see `${CLAUDE_PLUGIN_ROOT}/backends/README.md`); then continue, and say the emulator is local, not on the remote server.

Starting an emulator changes the tester's machine. If they asked for it directly (for example `/soma:device`), go ahead; if another skill sent you here, get their yes first.

Android emulators only. For a physical device, ask the tester to connect it with USB debugging on and accept the prompt, then confirm it shows as `device` in `adb devices`. For iOS simulators (macOS only, Appium engine), use the "Prepare an iOS simulator" operation in `${CLAUDE_PLUGIN_ROOT}/backends/appium.md`.

## 1. Pick the emulator
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/start-emulator.mjs" --list`.
- A line starting `✘ SETUP:` (exit 3): `adb` or the emulator is missing or broken. Report it and offer the `check-setup` skill; do not continue.
- No AVDs found: say so and point the tester to Android Studio's Device Manager to create one. Do not create one yourself.
- Use the AVD the tester named. Otherwise: if exactly one AVD exists, or exactly one is already running and `--list` names its AVD, use it; if more than one could fit, or a running emulator shows `avd=unknown` while several AVDs exist, ask which.
- Always go on to step 2, even for an emulator that is already running: `device` in adb only means it is reachable, not that Android has finished booting.

## 2. Start it and watch the boot
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/start-emulator.mjs" <avd>`. It starts the emulator detached (it keeps running afterward), or waits on the instance that is already running or still starting, for up to 5 minutes, and ends with a `STATUS:` line.
- `offline` while it waits is normal: the emulator is still booting. Only `sys.boot_completed=1` means it is ready, and the script waits for that.
- `STATUS: BOOTED`: go to step 4.
- `STATUS: TIMEOUT`: the emulator is still running but slow. Run the script again with the same AVD; it waits on the running emulator without starting a new one. If it times out twice, treat it like a crash.
- `STATUS: CRASHED`: go to step 3.
- `STATUS: ALREADY RUNNING` (exit 3): retry flags were given, but the AVD is still running, and flags only apply when the emulator starts. Ask the tester to close that emulator's window, then run the same command again.

## 3. If it crashes
If the log says `Running multiple emulators with the same AVD`, the AVD is already running but was still booting, so the script could not identify it. Run step 2 again in a minute; no retry flags are needed.

Otherwise, report the facts the script printed before suggesting anything: how long it ran, the `OpenGL Renderer` line, any snapshot warnings, and the last log lines. Then try the safe retries, one at a time, asking before each:
1. **Software rendering, cold boot**: `--cold --gpu swiftshader_indirect`. This is the most common fix when the renderer is a real GPU (AMD, Intel or NVIDIA), especially with an older driver. Rendering is slower but fine for QA. The flags only take effect on a fresh start: after a double timeout the hung emulator is still running, so ask the tester to close its window first (the script refuses the flags with `ALREADY RUNNING` otherwise).
2. **Hypervisor check**: `emulator -accel-check`. If acceleration is not usable, the fix is in the BIOS or Windows features, not the AVD. Explain it; do not change system settings.

Never use `-wipe-data`, delete snapshots, edit the AVD's `config.ini` or update SDK packages without the tester's explicit OK. Wiping erases installed apps and data on the emulator.

If a retry works, tell the tester which flags fixed it, and that they can make it permanent in the AVD settings (for example `hw.gpu.mode = swiftshader_indirect` in `config.ini`, or Graphics: Software in Android Studio). Do not make that change yourself.

## 4. Confirm it is ready
Report the serial, AVD name and Android version from the `BOOTED` line. If `run-manual-test`, `generate-test` or `explore-app` is next, the device is ready for it.
