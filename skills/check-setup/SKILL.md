---
name: check-setup
description: Check whether the tester's machine is ready to run mobile tests through appium-mcp (Node, Android SDK/ADB, Xcode, emulators) and explain what is missing. Use for first-time setup or when a session fails to start.
---

# Check local setup

Remote Appium server URL configured: `${user_config.remote_server_url}`. If set, only a reachable server is needed; skip the local toolchain checks and just confirm the URL responds.

## Local checks (run what applies, report each as OK / MISSING / UNKNOWN)
- Node.js available and recent enough to run `npx appium-mcp@latest`
- Android: `adb` on PATH, `ANDROID_HOME`/`ANDROID_SDK_ROOT` set, at least one emulator or device listed by `adb devices`
- iOS (macOS only): Xcode installed, command line tools selected, at least one simulator available
- appium-mcp server visible and connected in the Claude tool list

## Output
A short checklist with the exact command to fix each MISSING item. Do not install anything or change system settings without the tester's explicit confirmation. If the tester is on Windows or Linux and wants iOS, say plainly that local iOS testing needs a Mac and suggest a remote server.
