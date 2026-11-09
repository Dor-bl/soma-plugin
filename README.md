<div align="center">

<img src="assets/logo-wordmark.svg" alt="SOMA - Spear of Mobile Agents" width="480">

*A Claude plugin for mobile QA testers: run manual test cases on real devices, triage failures, and write bug reports.*

[![CI](https://github.com/Dor-bl/soma-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Dor-bl/soma-plugin/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](.claude-plugin/plugin.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Claude Plugin](https://img.shields.io/badge/Claude-plugin-D97757?logo=anthropic&logoColor=white)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Powered by appium-mcp](https://img.shields.io/badge/powered%20by-appium--mcp-662d91?logo=appium&logoColor=white)](https://github.com/appium/appium-mcp)
![Status](https://img.shields.io/badge/status-beta-yellow.svg)

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
| 🧠 Skill | `write-test-case` | Draft a manual test case from a feature, user story or bug report, ready for `run-manual-test` |
| ⚡ Command | `/soma:setup [focus]` | Check your environment is ready and explain how to fix what is missing |
| ⚡ Command | `/soma:setup-artemis [folder]` | Install the optional Artemis engine for this project, asking before each step |
| ⚡ Command | `/soma:device [avd or simulator name]` | Start an emulator or simulator and wait until it is ready |
| ⚡ Command | `/soma:run-test [platform] [steps or path]` | Run a manual test case through Appium |
| ⚡ Command | `/soma:bug [what you saw]` | Draft a bug report |
| ⚡ Command | `/soma:gen-test [framework] [steps or path]` | Generate an automated test from a manual test case |
| ⚡ Command | `/soma:explore [platform] [area]` | Explore an app area and report suspected issues |
| ⚡ Command | `/soma:triage [failure log or path]` | Triage a failed test run and suggest next steps |
| ⚡ Command | `/soma:test-case [feature, story, bug or path]` | Draft a manual test case to run with `/soma:run-test` |

**Under the hood**

- 🔌 `.mcp.json` launches `appium-mcp` through `scripts/start-appium-mcp.mjs`, which installs the version and dependency tree locked in `runtime/package-lock.json` with `npm ci --ignore-scripts` into the plugin's data folder on first start (about 370 MB; local embedded drivers by default)
- 📱 `scripts/start-emulator.mjs`: used by `start-device` to start an emulator detached and watch it boot
- ⚙️ `remote_server_url` setting: leave empty for local, or point it at a remote Appium/WebDriver server or device cloud. Only that exact URL is allowed, and only if it's `https://` (plain `http://` for localhost only) with no embedded credentials. When it's empty, all remote servers are blocked
- 🔑 `capabilities_file` setting (optional): a `capabilities.json` read from disk by `appium-mcp`. Put device-cloud credentials here instead of in the URL or the chat. Only `check-setup` reads it, after you approve the command, to check that it exists and is valid JSON without printing it; the other skills are told never to open it. Claude's file tools could still read it, so keep it out of the project folder and out of version control
- 🗺️ `app_map_dir` setting (optional): a folder where `explore-app` saves the locators it found per app and `run-manual-test` and `generate-test` reuse them to skip repeat lookups; `triage-failure` reads them only as evidence of a changed locator (Appium only). Empty means off. Maps hold element names and locators, never typed or on-screen user data. Format and rules: [`backends/app-map.md`](backends/app-map.md)
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

## 🚀 Install

In Claude Code 2.1.275 or newer:

```text
/plugin install soma --marketplace Dor-bl/soma-plugin
```

Or in two steps: `/plugin marketplace add Dor-bl/soma-plugin`, then `/plugin install soma@soma-plugin`. To pick up a new version later, run `/plugin marketplace update soma-plugin`.

> [!IMPORTANT]
> The first start installs `appium-mcp` and its locked dependencies (about 370 MB) from `registry.npmjs.org`, which can take minutes. Claude Code waits 30 seconds for an MCP server, so `appium-mcp` may show as *failed to connect* at first. The install keeps running in the background: reconnect with `/mcp` once it has finished, or run `/soma:setup` first and let it install the server before your first test.

`/soma:setup` (the `check-setup` skill) checks Node, the SDKs and your devices and explains how to fix what is missing. Add a focus such as `android`, `ios` or `artemis` to check one area.

To try a checkout without installing it, start Claude from the folder *above* the clone (inside it, `.mcp.json` loads as a project server and cannot start):

```bash
claude plugin validate ./soma-plugin
claude --plugin-dir ./soma-plugin
```

## 🏁 Quick start

Once SOMA is installed, try:

```text
/soma:run-test android "Open the app, log in with test user, verify the home screen"
/soma:bug "Checkout button does nothing after adding a coupon"
/soma:triage "Login test failed: NoSuchElementException on #submit after the 4.2 build"
/soma:explore android "checkout with a coupon code"
/soma:test-case "Users can apply one coupon code per order at checkout"
```

## 🔐 What SOMA runs, sends and fetches

- **Fetches** `appium-mcp` and its locked dependencies on first start and after a pin change, into the plugin's data folder: from `registry.npmjs.org`, plus two dependencies the lockfile pins to GitHub commits, so GitHub must be reachable too. Beyond that, downloads happen only in the cases you choose: preparing an iOS simulator downloads WebDriverAgent from GitHub through `appium-mcp` (unless you point it at a WebDriverAgent you already run), and the optional Artemis setup clones Artemis from GitHub and installs its Python dependencies.
- **Runs locally** `node` for the launcher and `appium-mcp`; `adb` and the Android emulator for Android; `xcrun simctl` on macOS for iOS; and the test clients you run yourself for generated scripts. Appium's drivers install their device-side agents (UiAutomator2 server, WebDriverAgent) on the emulator or simulator when a session starts, as any Appium setup does. Skills ask before installing an app or changing anything on your machine.
- **Sends** device commands to local devices, or to the one remote server you configure. SOMA itself opens no other connections and sends no telemetry. What the tools return (on-screen text, page source, screenshots) enters your Claude Code conversation like any tool result, so it reaches the model provider your Claude Code is configured with before the skills' redaction, which applies to reports and chat output. With the optional Artemis engine there is a second recipient: Artemis sends screenshots and screen text, including notifications, to the LLM provider behind its own API key, which need not be the same provider; the skills ask for your consent before each Artemis run. Device-cloud credentials stay in your capabilities file and reach only that server.
- **Reads** on-screen text, page source and screenshots from the device during a test. The skills treat them as untrusted data, never follow instructions found in them, and redact secrets before quoting them in reports.

## ⚠️ Known limitations (v0.2)

> [!WARNING]
> SOMA is in beta. Expect rough edges, and please report them.

- 🧪 Lightly tested on devices: every skill has completed at least one run on an Android 13 emulator through Appium (headless, 2026-11-07), `explore-app` has run once through Artemis, and on iOS only `start-device` and `run-manual-test` have run, on a simulator. Physical devices, remote servers and app maps haven't been run yet.
- 🛡️ Protection against prompt injection from app or device content (e.g. on-screen text telling Claude to run a command) relies on skill instructions, not tool restrictions. Tool-level limits are tracked in issue #8.
- 📌 `appium-mcp` is pinned to an exact version (`1.97.1`), and its whole dependency tree is locked with integrity hashes in `runtime/package-lock.json`. Bump them together, deliberately, after testing. Install scripts are skipped, so packages that need one (e.g. browser driver downloads) are not set up.
- 🌐 The remote URL policy covers the URL you configure only. Redirects and direct-connect endpoints chosen by the server aren't re-checked, so only point SOMA at servers you trust.
- 🔓 SOMA can't add authentication to a self-hosted Appium server. Put it behind an authenticating reverse proxy or VPN; never expose it unauthenticated on a shared network.

## 🧑‍💻 Developing SOMA

To load your checkout as a plugin, use `--plugin-dir` from the folder above the clone (see [Install](#-install)).

To work *inside* the repo, note that Claude Code loads `.mcp.json` as a project server, not as a plugin. `${CLAUDE_PLUGIN_ROOT}` and `${user_config.*}` are not substituted, so `appium-mcp` shows *failed to connect* (`Connection closed`). Plugin users are not affected. To get the device tools, run this from the root folder of the clone, not a subfolder (`$PWD` must be the clone root, and local scope applies only to the folder you run it in). It adds a server with the absolute path to the launcher and overrides the project entry for you only:

```bash
claude mcp add --scope local appium-mcp -- node "$PWD/scripts/start-appium-mcp.mjs"
```

`$PWD` works in bash, zsh and PowerShell. In Windows `cmd`, use `%CD%` instead.

This entry passes no remote URL, so only local devices work, unless `SOMA_REMOTE_SERVER_URL` is exported in your shell (then that one URL is allowed). Do not edit `.mcp.json` to fix the error: its variables are what make the plugin work for users.

The checks CI runs, and the conventions they enforce, are in [`CLAUDE.md`](CLAUDE.md).

## 📄 License

Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
