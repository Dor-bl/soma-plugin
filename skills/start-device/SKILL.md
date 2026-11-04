---
name: start-device
description: Start an Android emulator or iOS simulator and wait until it is fully booted and ready for testing, or diagnose why it crashes or hangs (GPU driver, corrupt snapshot, hypervisor, missing iOS runtime, WebDriverAgent). Use when no device is connected, a tester asks to start or boot an emulator or simulator, an emulator keeps crashing, a simulator hangs on boot, or adb shows a device as offline.
---

# Start a device

Local mode only. Remote Appium server URL configured: `${user_config.remote_server_url}`. If it is empty, or still shows as a literal `${user_config...}` placeholder, it is not set: continue. If it is set, devices come from that server, not this machine: say so and stop. Starting a local emulator or simulator, or running `adb` or `xcrun` here, would not affect the remote session and could act on the wrong device. The one exception: the tester explicitly asks for a local device anyway (for example to use an engine that only reaches local `adb` devices, see `${CLAUDE_PLUGIN_ROOT}/backends/README.md`); then continue, and say the device is local, not on the remote server.

Starting an emulator or simulator changes the tester's machine. If they asked for it directly (for example `/soma:device`), go ahead; if another skill sent you here, get their yes first.

Pick the platform from what the tester said (an AVD name means Android; an iPhone or iPad name, or "simulator", means iOS). If it is unclear, ask. Then follow the matching section.

Physical devices are not started here. For Android, ask the tester to connect it with USB debugging on and accept the prompt, then confirm it shows as `device` in `adb devices`. For a real iPhone or iPad (macOS only), use the "Prepare a real iOS device" operation in `${CLAUDE_PLUGIN_ROOT}/backends/appium.md`.

## Android emulator

### 1. Pick the emulator
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/start-emulator.mjs" --list`.
- A line starting `✘ SETUP:` (exit 3): `adb` or the emulator is missing or broken. Report it and offer the `check-setup` skill; do not continue.
- No AVDs found: say so and point the tester to Android Studio's Device Manager to create one. Do not create one yourself.
- Use the AVD the tester named. Otherwise: if exactly one AVD exists, or exactly one is already running and `--list` names its AVD, use it; if more than one could fit, or a running emulator shows `avd=unknown` while several AVDs exist, ask which.
- Always go on to step 2, even for an emulator that is already running: `device` in adb only means it is reachable, not that Android has finished booting.

### 2. Start it and watch the boot
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/start-emulator.mjs" <avd>`. It starts the emulator detached (it keeps running afterward), or waits on the instance that is already running or still starting, for up to 5 minutes, and ends with a `STATUS:` line.
- `offline` while it waits is normal: the emulator is still booting. Only `sys.boot_completed=1` means it is ready, and the script waits for that.
- `STATUS: BOOTED`: go to step 4.
- `STATUS: TIMEOUT`: the emulator is still running but slow. Run the script again with the same AVD; it waits on the running emulator without starting a new one. If it times out twice, treat it like a crash.
- `STATUS: CRASHED`: go to step 3.
- `STATUS: ALREADY RUNNING` (exit 3): retry flags were given, but the AVD is still running, and flags only apply when the emulator starts. Ask the tester to close that emulator's window, then run the same command again.

### 3. If it crashes
If the log says `Running multiple emulators with the same AVD`, the AVD is already running but was still booting, so the script could not identify it. Run step 2 again in a minute; no retry flags are needed.

Otherwise, report the facts the script printed before suggesting anything: how long it ran, the `OpenGL Renderer` line, any snapshot warnings, and the last log lines. Then try the safe retries, one at a time, asking before each:
1. **Software rendering, cold boot**: `--cold --gpu swiftshader_indirect`. This is the most common fix when the renderer is a real GPU (AMD, Intel or NVIDIA), especially with an older driver. Rendering is slower but fine for QA. The flags only take effect on a fresh start: after a double timeout the hung emulator is still running, so ask the tester to close its window first (the script refuses the flags with `ALREADY RUNNING` otherwise).
2. **Hypervisor check**: `emulator -accel-check`. If acceleration is not usable, the fix is in the BIOS or Windows features, not the AVD. Explain it; do not change system settings.

Never use `-wipe-data`, delete snapshots, edit the AVD's `config.ini` or update SDK packages without the tester's explicit OK. Wiping erases installed apps and data on the emulator.

If a retry works, tell the tester which flags fixed it, and that they can make it permanent in the AVD settings (for example `hw.gpu.mode = swiftshader_indirect` in `config.ini`, or Graphics: Software in Android Studio). Do not make that change yourself.

### 4. Confirm the emulator is ready
Report the serial, AVD name and Android version from the `BOOTED` line. If `run-manual-test`, `generate-test` or `explore-app` is next, the device is ready for it.

## iOS simulator (macOS only)

Simulators run only on a Mac with Xcode. On Windows or Linux, say so plainly and suggest a remote server or device cloud (the `remote_server_url` setting); do not continue. iOS uses the Appium engine; Artemis is Android only. The local-device exception at the top does not apply here: if the remote server setting is set, the next session would go to that server, not to this simulator. Say so and stop; the tester can clear the setting to test locally. The operations named below are in `${CLAUDE_PLUGIN_ROOT}/backends/appium.md`.

### 1. Pick the simulator
Run `xcrun simctl list devices available`. It groups simulators under their iOS version (`-- iOS 18.2 --`) with each one's name, UDID and state; the "Pick a device" operation lists names and UDIDs but not versions.
- An error, or no iOS simulators: check `xcode-select -p` and `xcrun simctl list runtimes`. If Xcode or its command line tools are missing, report it and offer the `check-setup` skill. If no iOS runtime is installed, point the tester to Xcode > Settings > Components (Platforms in older Xcode) to download one; to create a simulator, Window > Devices and Simulators. Do not install runtimes or create simulators yourself.
- Use the simulator the tester named, matching its name and iOS version exactly (several runtimes can each have an "iPhone 16"). Otherwise: if exactly one is already booted, or exactly one exists, use it; if more than one could fit, ask which, showing each one's iOS version. Never guess a UDID. Then select it with the "Pick a device" operation, passing that UDID.

### 2. Boot it and start WebDriverAgent
1. Run `xcrun simctl bootstatus <udid> -b`. It boots the simulator if it is shut down, then waits until iOS has finished booting; on a booted one it returns at once. It runs headless, so the Simulator window may not open; if the tester wants to watch, run `open -a Simulator` too. A first boot after creating a simulator or installing a runtime can take several minutes. If it shows no progress for 5 minutes, stop it and go to "3. If it fails" below.
2. Check whether WDA is already running there: `xcrun simctl spawn <udid> launchctl list` lists `WebDriverAgentRunner`. If it does, a test session may be using it, and preparing restarts WDA on a new port, which breaks that session. List this server's sessions with the "Start / list / close a session" operation and tell the tester what you found (sessions started by other tools do not show there). If you already have its `appium:webDriverAgentUrl` from this conversation and `curl -s -m 3 <webDriverAgentUrl>/status` answers, skip step 3: the simulator is ready, so reuse that URL and go to step 4. Otherwise continue only with the tester's OK.
3. Run the "Prepare an iOS simulator" operation with the UDID. It downloads WebDriverAgent (WDA, the helper app Appium drives iOS through) on first use, caches it, and launches it on the simulator. Keep the `appium:webDriverAgentUrl` it returns: session creation must reuse it, or Appium builds and installs WDA again.

### 3. If it fails
Report the exact error first: which command or tool failed and its last output lines. Then, asking before each:
- **Boot hangs or fails**: `xcrun simctl shutdown <udid>`, then step 2 again. If it still fails, check that the runtime shows as available in `xcrun simctl list runtimes`; an unavailable runtime means re-downloading it in Xcode, which the tester does.
- **WDA download fails** (network, proxy, or GitHub blocked): report it. If the tester can get the prebuilt `WebDriverAgentRunner-Runner.app`, they can set `APPIUM_MCP_WDA_APP_PATH` to its absolute path for appium-mcp and restart Claude; it then skips the download.
- **The session cannot reach WDA** (`ECONNREFUSED` on the WDA URL): WDA has stopped since it was prepared. Run "Prepare an iOS simulator" again and use the new `appium:webDriverAgentUrl`. If it stops again, or does not start, treat it as the next case.
- **WDA does not start, or keeps stopping**: the copy installed on the simulator may be corrupt or built for another Xcode. A forced WDA refresh only replaces the downloaded copy; WDA already on the simulator is not reinstalled. So run "Prepare an iOS simulator" with a forced WDA refresh, then `xcrun simctl install <udid> "<wdaAppPath>"` with the `wdaAppPath` it returned, then "Prepare an iOS simulator" again (without the refresh) and use the new `appium:webDriverAgentUrl` it returns.

Never run `xcrun simctl erase` or `delete`, switch Xcode with `xcode-select -s`, or install Xcode components without the tester's explicit OK. Erasing wipes installed apps and data on the simulator.

### 4. Confirm the simulator is ready
Report the simulator name, iOS version (from step 1) and UDID. If `run-manual-test`, `generate-test` or `explore-app` is next, the simulator is ready: create the session with `appium:udid` set to that UDID and the `appium:webDriverAgentUrl` from step 2. WDA can stop in the meantime, so check that it still answers right before creating the session (Session setup in `${CLAUDE_PLUGIN_ROOT}/backends/appium.md`).
