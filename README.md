<div align="center">

# 🔱 SOMA

### Spear of Mobile Automation

*A Claude plugin for mobile QA testers: run manual test cases on real devices, triage failures, and write bug reports.*

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](.claude-plugin/plugin.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Claude Plugin](https://img.shields.io/badge/Claude-plugin-D97757?logo=anthropic&logoColor=white)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Powered by appium-mcp](https://img.shields.io/badge/powered%20by-appium--mcp-662d91?logo=appium&logoColor=white)](https://github.com/appium/appium-mcp)
![Status](https://img.shields.io/badge/status-experimental-orange.svg)

![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-000000?logo=apple&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)

</div>

---

## ✨ Overview

SOMA wraps the official [`appium-mcp`](https://github.com/appium/appium-mcp) server and adds test-focused **skills** and **slash commands** on top of it, so you can drive Android and iOS devices with plain language.

## 📦 What's inside

| Type | Name | Description |
|------|------|-------------|
| 🧠 Skill | `check-setup` | Verify your local environment (Node, SDKs, devices) is ready |
| 🧠 Skill | `run-manual-test` | Execute a manual test case step by step on a device |
| 🧠 Skill | `triage-failure` | Investigate a failed step and pinpoint the likely cause |
| 🧠 Skill | `bug-report` | Draft a structured bug report from a failure or observation |
| ⚡ Command | `/soma:run-test [platform] [steps or path]` | Run a manual test case through Appium |
| ⚡ Command | `/soma:bug [what you saw]` | Draft a bug report |

**Under the hood**

- 🔌 `.mcp.json` launches `appium-mcp` via `npx` (local embedded drivers by default)
- ⚙️ `remote_server_url` setting: leave empty for local, or point it at a remote Appium/WebDriver server or device cloud

## 🛠️ Requirements (local mode)

| Platform | Needs |
|----------|-------|
| All | [Node.js](https://nodejs.org/) 22 or newer (required by `appium-mcp`) |
| 🤖 Android | Android SDK, `adb`, an emulator or physical device |
| 🍎 iOS | macOS with Xcode and a simulator *(iOS isn't available locally on Windows/Linux)* |

## 🚀 Quick start

```bash
# Validate the plugin
claude plugin validate ./soma

# Launch Claude with SOMA loaded
claude --plugin-dir ./soma
```

> [!TIP]
> Run the `check-setup` skill first to make sure your environment is ready.

Then try:

```text
/soma:run-test android "Open the app, log in with test user, verify the home screen"
/soma:bug "Checkout button does nothing after adding a coupon"
```

## ⚠️ Known limitations (v0.1)

> [!WARNING]
> SOMA is an early scaffold. Expect rough edges.

- 🧪 Skills are untested against real devices.
- 📌 `appium-mcp` is pulled with `@latest`; pin a version once you have a known-good one.
- 🌐 The remote URL is read by the skills and passed to the session tool; it isn't enforced at the server level.
- 🔓 No authentication is applied to a shared remote server.

## 📄 License

Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
