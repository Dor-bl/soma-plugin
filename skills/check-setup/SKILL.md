---
name: check-setup
description: Check whether the tester's machine is ready to run mobile tests through appium-mcp (Node, Android SDK/ADB, Xcode, emulators), plus the optional Google Artemis engine, and explain what is missing. Use for first-time setup or when a session fails to start.
---

# Check local setup

Remote Appium server URL configured: `${user_config.remote_server_url}`. If it is empty or still shows as a literal `${user_config...}` placeholder, no remote server is configured. If set, the device-side checks are not needed: confirm the URL responds, and skip the Android, local Appium 2 and iOS checks below. Still run the Node.js, npm and appium-mcp startup checks, since `appium-mcp` itself always runs on the tester's machine (`.mcp.json` starts it locally with Node through `scripts/start-appium-mcp.mjs`, which installs the pinned `appium-mcp` from its lockfile with `npm ci` on first start), and the test client checks, since generated scripts run there too.

Remote URL checks (report each as OK / MISSING):
- Uses `https://`, or `http://` only for `localhost` / `127.0.0.1` / `[::1]`, with no query or fragment. If it breaks these rules, SOMA blocks all remote servers at startup and only the exact configured URL is ever allowed.
- Contains no `user:key@` credentials. If the tester needs device-cloud credentials, tell them to put them in a capabilities file (e.g. `bstack:options`, `sauce:options`, `LT:Options` for TestMu AI, formerly LambdaTest) and set the plugin's capabilities file setting to its path. Never ask them to paste keys into the chat.
- Capabilities file setting: `${user_config.capabilities_file}`. If set, check that it exists and is valid JSON without showing its contents. This command reads a file that holds credentials, so show it to the tester and run it only after their explicit yes: `node -e "try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('OK')}catch(e){console.log(e.code==='ENOENT'?'MISSING: file not found':'INVALID: unreadable or not valid JSON')}" "<path>"` and report only its one-line result. Never open, read or print the file: it can contain credentials. appium-mcp silently ignores a missing or invalid file, which shows up later as a cloud authentication error.
- A self-hosted Appium server must not be reachable unauthenticated from a shared network: anyone who can reach it controls its devices and host. Recommend putting it behind an authenticating reverse proxy or VPN.

## Local checks (run what applies, report each as OK / MISSING / UNKNOWN)
- Node.js 22 or newer (`node --version`). `appium-mcp` requires `>=22`; older versions crash on startup and the server shows as disconnected. Fix: install Node 22 LTS (e.g. `winget install OpenJS.NodeJS.LTS` on Windows, or via nvm), then restart Claude.
- npm 10 or newer (`npm --version`). Node 22 ships npm 10, so an older number means an old npm is in the way. Find out which case it is before suggesting a fix:
  - Windows, and `%APPDATA%\npm\node_modules\npm` exists: a leftover global npm is shadowing Node's own (`npm.cmd` prefers it). Fix: `npm uninstall -g npm`, then check `npm --version` again.
  - Otherwise (macOS/Linux, nvm, or Windows without that folder): the old npm replaced Node's own copy, so uninstalling it would leave no npm at all. Never suggest `npm uninstall -g npm` here. Fix: `npm install -g npm@10`, or reinstall Node 22.
- Android: `adb` on PATH, `ANDROID_HOME`/`ANDROID_SDK_ROOT` set, at least one emulator or device that is ready: listed as `device` by `adb devices` and fully booted (`adb -s <serial> shell getprop sys.boot_completed` prints `1`). `device` alone can come before Android has finished booting, and `offline` right after starting an emulator means it is still booting. If none is ready, or an emulator crashes on start (e.g. exit code 139), offer the `start-device` skill: it boots the emulator and retries with `-gpu swiftshader_indirect`, since hardware GPU rendering often fails on older graphics cards.
- Local Appium 2 server for running generated scripts (only if the tester runs `generate-test` scripts): `appium --version`, with the needed driver installed (`appium driver list --installed`, e.g. uiautomator2 or xcuitest)
- iOS (macOS only): Xcode installed, command line tools selected, at least one simulator available. If none is booted, or one hangs on boot, offer the `start-device` skill.
- appium-mcp server visible and connected in the Claude tool list. If it is not, offer a manual startup diagnostic:
  - Ask the tester first. If `appium-mcp@1.97.1` is not installed yet, the check installs it and its locked dependencies (about 370 MB) with `npm ci --ignore-scripts`.
  - Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-smoke.mjs"` with the environment variables `SMOKE_TIMEOUT_MS=720000` (room for a cold install, which took about 1 minute on a desktop but can take up to about 8 minutes on slow machines such as CI runners; a warm start answers in seconds) and `CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}"`, so it uses the same install as the plugin. If that value still shows as a literal `${CLAUDE_PLUGIN_DATA}` placeholder, do not set `CLAUDE_PLUGIN_DATA`; the check then installs into the plugin folder instead. A cold install can outlast the 10-minute limit on foreground commands, so run it as a background task and wait for it to finish. It is the same check CI runs: it starts the server exactly as `.mcp.json` does, performs a real MCP handshake (`initialize`, then `tools/list`), checks the tools SOMA needs are present and that remote servers are blocked, then stops the server. Do not judge startup from whether the process is still running: a server can sit installing for minutes, or exit at once when its input closes, so only an answered handshake proves it works.
  - Exit 0: the server works. The problem is Claude's MCP config or a needed restart.
  - Exit 1: MISSING. Quote the key error line from the stderr it prints. `Missing tools required by SOMA skills` means an `appium-mcp` release changed its tools, and `Remote server was not blocked` means the remote allowlist failed; report either as a plugin issue, not a setup problem.
  - Exit 2 (no `tools/list` response in time): UNKNOWN. Quote the last stderr lines: if npm was still installing, the network is slow; run it once more, since each attempt starts the install over.
  - `npm ci failed`: quote npm's error line. A network or registry error is an environment problem; an integrity (`EINTEGRITY`) error means a downloaded package did not match the lockfile, so report it as a possible supply-chain issue and do not work around it.
  - `ERR_MODULE_NOT_FOUND` right after a Node upgrade usually means the install was built by the old Node or npm. With the tester's approval, delete the `appium-mcp-*` folders in the folder the launcher installs into, then run the check again so it reinstalls. That folder is the plugin data folder (`${CLAUDE_PLUGIN_DATA}`), or `${CLAUDE_PLUGIN_ROOT}/.runtime/` when that value is empty or still shows as a literal placeholder.

## Test client checks (local or remote server; only if the tester runs or plans to run `generate-test` scripts)
Check that the client actually loads its entry point, not just that it is listed as installed. A package can show as installed with its files missing.
- Python: `python -c "from appium import webdriver"`. A bare `import appium` can pass on an empty `appium/` folder, because Python treats it as a namespace package. Fix: `pip install --force-reinstall Appium-Python-Client`, or use a virtualenv.
- Node: `node -e "require('webdriverio')"`, run from the test project.
- Java: the `io.appium:java-client` dependency resolves in the project build.

## Optional engine: Google Artemis
Only if the tester uses or asks about Artemis (see `${CLAUDE_PLUGIN_ROOT}/backends/artemis.md`):
- `mobile_*` tools visible in the Claude tool list. If not, report MISSING and point to the Install note in `${CLAUDE_PLUGIN_ROOT}/backends/artemis.md`. Do not install or register anything without the tester's confirmation, and never suggest `start.bat`/`start.sh` or `artemis mcp --install`: they write config into every AI client on the machine.
- If `mobile_*` tools are visible but the tester never set an LLM API key, report MISSING and tell them to add one to Artemis's `.env` themselves. Never ask for the key or print the file.
- If visible, call `mobile_diagnose` in check-only mode (no automatic fixes, no AVD launch) and report its verdict (`ready` / `degraded` / `blocked`) with its fix list. Its `Run:` lines and `attempt_fix` install or change things (winget, scripts, the helper app): apply any of them only after the tester's confirmation. If a key looks set but tasks stall, rerun it with `verify_credentials=true`.
- Artemis is Android only and needs its own LLM API key. On first use it installs an accessibility-service helper app on the device; the tester can check it with `uv run artemis helper status`.

## Output
A short checklist with the exact command to fix each MISSING item. Do not install anything or change system settings without the tester's explicit confirmation. If the tester is on Windows or Linux and wants iOS, say plainly that local iOS testing needs a Mac and suggest a remote server.
