---
name: generate-test
description: Turn a manual test case into an automated Appium test script (e.g. WebdriverIO JS/TS, Java + TestNG, Python + pytest) with stable locators taken from the live app. Use when a tester says "automate this test", "generate a script" or wants code for a test case that was just run.
---

# Generate an automated test

## Inputs to confirm (ask one short question if missing)
- Test case: a test just run with `run-manual-test` in this conversation (reuse its steps, expected results and observed screens), or steps / a file path the tester provides
- Platform and app under test (same as `run-manual-test`)
- Target framework and language. Check the tester's repo first: `package.json` (webdriverio, @wdio/*), `pom.xml`/`build.gradle` (io.appium java-client, testng), `requirements.txt`/`pyproject.toml` (Appium-Python-Client, pytest), and existing test folders. Only ask if nothing is found or more than one setup exists.

## Session setup
- Remote Appium server URL configured for this plugin: `${user_config.remote_server_url}`
- If that value is empty, create the session in local mode (do not pass `remoteServerUrl`). Local mode needs the platform toolchain installed (Android SDK/ADB, or Xcode on macOS).
- If it is set, pass it as `remoteServerUrl` when creating the session.
- If a session from `run-manual-test` is still active, reuse it (list sessions first) instead of creating a new one.
- Capability defaults to start from:
  - System or preinstalled apps (Settings, Contacts, launcher), or any app whose data must survive: pass `appium:noReset: true`. Without it, Appium clears app data first, which can hang or wipe state.
  - Emulators: pass `appium:adbExecTimeout: 60000` and `appium:uiautomator2ServerInstallTimeout: 90000`. The 20 s defaults often time out on a freshly booted emulator. This applies to local and remote emulators.
  - Local emulators only (no `remoteServerUrl`): if the emulator just booted, wait until it settles before creating the session. Target it explicitly with `adb -s <udid> shell cat /proc/loadavg` and wait for the first value to drop below about 6. Skip this for remote sessions: the device may be on another host, and local `adb` would fail or check an unrelated device.
- If session creation fails, stop and report the exact error. Do not retry with different capabilities unless the tester asks.

## Generation
1. Call `appium_generate_tests` with `steps`: one plain-language string per step, expected result included. It returns a workflow, not finished code: follow it to execute the scenario with the appium-mcp tools.
2. Find each step's element with `appium_find_element`. Call `generate_locators` (optional `sessionId`, defaults to the active session) only on a new screen or when no stable locator is obvious. Its output is large (tens of KB per screen), so pick out the elements you need instead of reading all of it.
3. Pick locators in this order: accessibility id, then id, then platform-native (`-ios predicate string` / `-ios class chain`, `-android uiautomator`). Use xpath only as a last resort and mark it in the code with a comment.
4. Write the test from the interactions actually observed, then adapt it to the repo: test folder and file naming, existing page objects (add locators there instead of inlining), capabilities/config helpers, base classes, assertion and wait styles. Use explicit waits, never fixed sleeps.
5. Close the session at the end if this skill created it.

## Output
Save the file (do not overwrite an existing one without asking), then report: the file path(s) written or changed, the locator used per step, any step that could not be automated and why (e.g. visual-only check, OTP, external app), and the exact command to run it.

## Rules
- Never guess an element. If a locator is ambiguous, say which candidates matched and ask.
- Copy text and content-desc values exactly as the device reports them, never retype them. Labels can contain look-alike Unicode: Android renders "Wi‑Fi" with U+2011 (non-breaking hyphen), and `Wi-Fi` with a normal hyphen does not match. In code, write such characters as escapes (`"Wi\u2011Fi"`) with a short comment.
- Do not hardcode real credentials or personal data. Read test accounts from config or environment variables.
- Do not add new dependencies or change build files without the tester's confirmation.
