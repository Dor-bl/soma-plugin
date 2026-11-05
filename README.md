<div align="center">

<img src="assets/logo-wordmark.svg" alt="SOMA - Spear of Mobile Agents" width="480">

*A Claude plugin for mobile QA testers: run manual test cases on real devices, triage failures, and write bug reports.*

[![CI](https://github.com/Dor-bl/soma-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/Dor-bl/soma-mobile/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](.claude-plugin/plugin.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Claude Plugin](https://img.shields.io/badge/Claude-plugin-D97757?logo=anthropic&logoColor=white)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Powered by appium-mcp](https://img.shields.io/badge/powered%20by-appium--mcp-662d91?logo=appium&logoColor=white)](https://github.com/appium/appium-mcp)
![Status](https://img.shields.io/badge/status-experimental-orange.svg)

![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-000000?logo=apple&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
[![Engine: Appium](https://img.shields.io/badge/engine-Appium%20(default)-662d91?logo=appium&logoColor=white)](backends/appium.md)
[![Engine: Google Artemis](https://img.shields.io/badge/engine-Google%20Artemis%20(optional)-4285F4?logo=google&logoColor=white)](backends/artemis.md)

</div>

---

## ✨ Overview

SOMA wraps the official [`appium-mcp`](https://github.com/appium/appium-mcp) server and adds test-focused **skills** and **slash commands** on top of it, so you can drive Android and iOS devices with plain language.

**No code required.** Manual QA can use SOMA as is: describe a test case in plain language, watch it run on a device, and get a bug report when something fails. Generating automated tests (`/soma:gen-test`) is optional.

## 📦 What's inside

| Type | Name | Description |
|------|------|-------------|
| 🧠 Skill | `check-setup` | Verify your local environment (Node, SDKs, devices) is ready |
| 🧠 Skill | `setup-artemis` | Install the optional Google Artemis engine for this project only, step by step |
| 🧠 Skill | `start-device` | Start an Android emulator or iOS simulator, wait for a full boot, and diagnose crashes |
| 🧠 Skill | `run-manual-test` | Execute a manual test case step by step on a device |
| 🧠 Skill | `triage-failure` | Investigate a failed step and pinpoint the likely cause |
| 🧠 Skill | `bug-report` | Draft a structured bug report from a failure or observation |
| 🧠 Skill | `generate-test` | Turn a manual test case into an automated Appium test script |
| 🧠 Skill | `explore-app` | Exploratory testing of an app area; reports suspected issues with evidence |
| ⚡ Command | `/soma:setup [focus]` | Check your environment is ready and explain how to fix what is missing |
| ⚡ Command | `/soma:setup-artemis [folder]` | Install the optional Artemis engine for this project, asking before each step |
| ⚡ Command | `/soma:device [avd or simulator name]` | Start an emulator or simulator and wait until it is ready |
| ⚡ Command | `/soma:run-test [platform] [steps or path]` | Run a manual test case through Appium |
| ⚡ Command | `/soma:bug [what you saw]` | Draft a bug report |
| ⚡ Command | `/soma:gen-test [framework] [steps or path]` | Generate an automated test from a manual test case |
| ⚡ Command | `/soma:explore [platform] [area]` | Explore an app area and report suspected issues |
| ⚡ Command | `/soma:triage [failure log or path]` | Triage a failed test run and suggest next steps |

**Under the hood**

- 🔌 `.mcp.json` launches `appium-mcp` through `scripts/start-appium-mcp.mjs`, which installs the version and dependency tree locked in `runtime/package-lock.json` with `npm ci --ignore-scripts` into the plugin's data folder on first start (about 370 MB; local embedded drivers by default)
- 📱 `scripts/start-emulator.mjs`: used by `start-device` to start an emulator detached and watch it boot
- ⚙️ `remote_server_url` setting: leave empty for local, or point it at a remote Appium/WebDriver server or device cloud. Only that exact URL is allowed, and only if it's `https://` (plain `http://` for localhost only) with no embedded credentials. When it's empty, all remote servers are blocked
- 🔑 `capabilities_file` setting (optional): a `capabilities.json` read from disk by `appium-mcp`. Put device-cloud credentials here instead of in the URL or the chat. Only `check-setup` reads it, after you approve the command, to check that it exists and is valid JSON without printing it; the other skills are told never to open it. Claude's file tools could still read it, so keep it out of the project folder and out of version control
- 🧩 Engines: skills describe *what* to do; [`backends/`](backends/README.md) describes *how* each engine does it

## 🧩 Engines

| Engine | Platforms | Setup | Used for |
|--------|-----------|-------|----------|
| [Appium](backends/appium.md) *(default)* | Android, iOS | Bundled | Everything |
| [Google Artemis](backends/artemis.md) *(optional)* | Android | Install separately and register for this project only ([avoid the global installer](backends/artemis.md#install)); needs its own LLM API key | `explore-app` by default when installed; `run-manual-test` and `triage-failure` when you ask for it |

Without Artemis installed, SOMA behaves exactly as before. Artemis is an autonomous agent: SOMA runs it one test step at a time and checks its trace, so it can't route around a bug and report a pass.

> [!NOTE]
> SOMA's version pin and remote-URL allowlist cover `appium-mcp` only. Artemis is installed and updated outside SOMA, and its own agent and LLM key are yours to manage.

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
> Run `/soma:setup` (the `check-setup` skill) first to make sure your environment is ready. Add a focus such as `android`, `ios` or `artemis` to check one area.

Then try:

```text
/soma:run-test android "Open the app, log in with test user, verify the home screen"
/soma:bug "Checkout button does nothing after adding a coupon"
/soma:triage "Login test failed: NoSuchElementException on #submit after the 4.2 build"
/soma:explore android "checkout with a coupon code"
```

## ⚠️ Known limitations (v0.1)

> [!WARNING]
> SOMA is an early scaffold. Expect rough edges.

- 🧪 Only lightly tested on devices: `generate-test` has passed one end-to-end run through Appium on an Android 11 emulator, and `explore-app` has run once through Artemis on an Android 13 emulator. The other skills and iOS haven't been run on a device yet.
- 🛡️ Protection against prompt injection from app or device content (e.g. on-screen text telling Claude to run a command) relies on skill instructions, not tool restrictions. Tool-level limits are tracked in issue #8.
- 📌 `appium-mcp` is pinned to an exact version (`1.97.1`), and its whole dependency tree is locked with integrity hashes in `runtime/package-lock.json`. Bump them together, deliberately, after testing. Install scripts are skipped, so packages that need one (e.g. browser driver downloads) are not set up.
- 🌐 The remote URL policy covers the URL you configure only. Redirects and direct-connect endpoints chosen by the server aren't re-checked, so only point SOMA at servers you trust.
- 🔓 SOMA can't add authentication to a self-hosted Appium server. Put it behind an authenticating reverse proxy or VPN; never expose it unauthenticated on a shared network.

## 📄 License

Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
