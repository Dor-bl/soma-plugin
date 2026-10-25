# SOMA (Spear of Mobile Automation)

A Claude plugin for mobile QA testers. It wraps the official [`appium-mcp`](https://github.com/appium/appium-mcp) server and adds test-focused skills and commands.

## What's inside
- `.mcp.json`: launches `appium-mcp` via `npx` (local embedded drivers by default)
- Skills: `run-manual-test`, `triage-failure`, `bug-report`, `check-setup`
- Commands: `/soma:run-test`, `/soma:bug`
- Setting `remote_server_url`: leave empty for local; set it to use a remote Appium/WebDriver server

## Local mode requirements
- Node.js 22 or newer (required by `appium-mcp`)
- Android: Android SDK, `adb`, an emulator or device
- iOS: macOS with Xcode and a simulator (no iOS locally on Windows/Linux)

## Try it
```bash
claude plugin validate ./soma
claude --plugin-dir ./soma
```
Then run the `check-setup` skill first.

## Known limitations (v0.1)
- Skills are untested against real devices.
- `appium-mcp` is pulled with `@latest`; pin a version once you have a known-good one.
- The remote URL is read by the skills and passed to the session tool; it is not enforced at the server level.
- No authentication is applied to a shared remote server.
