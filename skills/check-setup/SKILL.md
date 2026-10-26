---
name: check-setup
description: Check whether the tester's machine is ready to run mobile tests through appium-mcp (Node, Android SDK/ADB, Xcode, emulators), plus the optional Google Artemis engine, and explain what is missing. Use for first-time setup or when a session fails to start.
---

# Check local setup

Remote Appium server URL configured: `${user_config.remote_server_url}`. If set, only a reachable server is needed: skip the local checks and just confirm the URL responds. Still run the test client checks below, since generated scripts run on the tester's machine even when the server is remote.

## Local checks (run what applies, report each as OK / MISSING / UNKNOWN)
- Node.js 22 or newer (`node --version`). `appium-mcp` requires `>=22`; older versions crash on startup and the server shows as disconnected. Fix: install Node 22 LTS (e.g. `winget install OpenJS.NodeJS.LTS` on Windows, or via nvm), then restart Claude.
- Android: `adb` on PATH, `ANDROID_HOME`/`ANDROID_SDK_ROOT` set, at least one emulator or device listed by `adb devices`. If an emulator crashes on start (e.g. exit code 139), suggest relaunching it with `-gpu swiftshader_indirect`. Hardware GPU rendering often fails on older graphics cards.
- Local Appium 2 server for running generated scripts (only if the tester runs `generate-test` scripts): `appium --version`, with the needed driver installed (`appium driver list --installed`, e.g. uiautomator2 or xcuitest)
- iOS (macOS only): Xcode installed, command line tools selected, at least one simulator available
- appium-mcp server visible and connected in the Claude tool list. If it is not, offer a manual startup diagnostic:
  - Ask the tester first. `npx -y appium-mcp@latest` downloads and installs the package and its dependencies if they are not cached.
  - Run it with a time limit (about 60 seconds), capture stderr, and stop the process when the limit is reached.
  - Exited with an error before the limit: MISSING. Quote the key error line.
  - Still running at the limit with no error: the server starts (a healthy stdio server waits for input and never exits on its own). The problem is likely Claude's MCP config or a needed restart.
  - Still running but stderr shows it is still downloading: UNKNOWN. Run it again once the install has finished.

## Test client checks (local or remote server; only if the tester runs or plans to run `generate-test` scripts)
Check that the client actually loads its entry point, not just that it is listed as installed. A package can show as installed with its files missing.
- Python: `python -c "from appium import webdriver"`. A bare `import appium` can pass on an empty `appium/` folder, because Python treats it as a namespace package. Fix: `pip install --force-reinstall Appium-Python-Client`, or use a virtualenv.
- Node: `node -e "require('webdriverio')"`, run from the test project.
- Java: the `io.appium:java-client` dependency resolves in the project build.

## Optional engine: Google Artemis
Only if the tester uses or asks about Artemis (see `${CLAUDE_PLUGIN_ROOT}/backends/artemis.md`):
- `mobile_*` tools visible in the Claude tool list. If not, report MISSING and point to Artemis's installer (`uv run artemis mcp --install claude`). Do not run it without the tester's confirmation.
- If visible, call `mobile_diagnose` and report its verdict (`ready` / `degraded` / `blocked`) with its fix list.
- Artemis is Android only and needs its own LLM API key.

## Output
A short checklist with the exact command to fix each MISSING item. Do not install anything or change system settings without the tester's explicit confirmation. If the tester is on Windows or Linux and wants iOS, say plainly that local iOS testing needs a Mac and suggest a remote server.
