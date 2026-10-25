---
name: run-manual-test
description: Execute a manual test case (steps written in plain language) on a mobile device, emulator or simulator through Appium, and report pass/fail per step with screenshots. Use when a QA tester pastes test steps or says "run this test".
---

# Run a manual test case

## Inputs to confirm (ask one short question if missing)
- Platform: Android or iOS
- App under test: package/bundle ID, or path to the .apk/.app/.ipa
- Test steps with expected results

## Session setup
- Remote Appium server URL configured for this plugin: `${user_config.remote_server_url}`
- If that value is empty, create the session in local mode (do not pass `remoteServerUrl`). Local mode needs the platform toolchain installed (Android SDK/ADB, or Xcode on macOS).
- If it is set, pass it as `remoteServerUrl` when creating the session. Never add credentials to it and never ask the tester to paste an access key or password into the chat. Device-cloud credentials belong in the plugin's capabilities file, which appium-mcp reads from disk.
- The server only accepts `https://` URLs (plain `http://` only for localhost) without embedded credentials. If it rejects the URL, report that and point the tester to the plugin settings. Do not try to work around it.
- If session creation fails, stop and report the exact error. Do not retry with different capabilities unless the tester asks.

## Execution
1. Create the session with the appium-mcp session management tool.
2. For each step, in order: perform it, then verify the expected result from the on-screen state (page source and a screenshot).
3. Record per step: PASS, FAIL or BLOCKED, what was observed, and a screenshot reference for any FAIL.
4. On the first FAIL, stop executing dependent steps and mark them BLOCKED. Continue only independent steps.
5. Always close the session at the end, even after a failure.

## Report format
A table: step number, action, expected, observed, status. Then a one-line verdict. If anything failed, offer to run the `bug-report` skill.

## Rules
- Never guess an element. If a locator is ambiguous, say which candidates matched and ask.
- Do not enter real credentials or personal data. Use test accounts the tester provides.
- State clearly when a check was judged visually from a screenshot rather than asserted from page source.
