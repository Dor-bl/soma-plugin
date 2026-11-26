# Changelog

Notable changes to SOMA, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Plugin users receive a new copy only when `version` in `plugin.json` changes.

## [Unreleased]

`start-device` can stop an emulator or simulator the tester names, and the README says how to update SOMA in Codex.

### Added

- **`start-device` stops a named device**: an emulator (`start-emulator.mjs --stop <avd>`) or simulator (`xcrun simctl shutdown`), after the tester confirms it, and offers this when retry flags need a fresh start. (#121)

### Changed

- **Updating SOMA in Codex.** The README says how to move Codex to a new SOMA version (remove and add the plugin) and to start a new session after the first `appium-mcp` install. (#127)

## [0.5.0] - 2026-11-25

The Windows first-start install now survives a tree kill of the server, and GitHub releases get shorter notes.

### Fixed

- **Windows: the first-start install survives a tree kill.** The launcher starts the background installer through a short-lived helper process, so a client that kills the server's process tree (`taskkill /T /F`) without closing stdin first no longer stops the `appium-mcp` install (#77)

### Changed

- **Shorter release notes.** Each GitHub release opens with a one-line summary, then lists the merged PRs with links and a full-diff link; the changelog keeps one short line per change.

## [0.4.0] - 2026-11-21

### Added

- Codex support (experimental; tested with Codex CLI 0.171.0 on Windows and macOS, where the install, `check-setup` and `run-manual-test` cases on an Android emulator and an iOS simulator passed): a Codex manifest (`.codex-plugin/plugin.json`) with SOMA's skills and `appium-mcp`, its own MCP config (`.codex-plugin/mcp.json`: paths relative to the plugin folder, the Android, Java and Xcode variables, `APPIUM_MCP_WDA_APP_PATH` and SOMA's folder overrides, which Codex does not pass by default (not the proxy variables, which can carry a password), and a 10-minute first start for the install), and a Codex marketplace (`.agents/plugins/marketplace.json`), so `codex plugin marketplace add Dor-bl/soma-plugin` works, and a Codex badge in the README. Codex runs SOMA in local mode only, since it has no plugin settings, and with Appium only: `setup-artemis` registers Artemis through `claude mcp`, so in Codex it stops before changing anything. `write-test-case` offers to take pasted content, and reads a file the tester names only after they approve the exact read-only command that prints just that file; it never reads credential files, a rule its description carries so it applies before the skill is loaded (Codex read a named capabilities file before opening the skill until it did). Skills that name plugin files say where the plugin folder is when Codex leaves `${CLAUDE_PLUGIN_ROOT}` unexpanded. Skills that read the PNG and XML files `appium-mcp` saves say what to do in Codex, which has no Read tool: open none of them, check elements with `appium_find_element`, report a check that needs a screenshot as not checked visually, and give the tester the saved path. `check-plugin.mjs` checks that the Codex manifest matches the Claude one, that its paths exist and its required listing fields fit, and that its MCP config starts the same servers without Claude's variables; `release.mjs` bumps both manifests. `check-setup` confirms `appium-mcp` with a `select_device` call, and when Codex's macOS sandbox blocks `xcrun simctl` or `~/.appium` it checks simulators through `appium-mcp` instead of reporting them missing; the README says that `codex exec` rejects `appium-mcp` calls unless run with `--approve-for-me`
- Benchmark: `scripts/benchmark-chart.mjs` draws the README chart (`assets/benchmark-light.svg` and `benchmark-dark.svg`) from the results file named in `assets/benchmark-chart.json`, instead of the SVGs being edited by hand. It refuses a results file with a task short of its runs in either arm, a run with a missing measurement, or more than 56 runs per arm, and its test in CI fails when the committed SVGs no longer match the config

- The launcher checks the Node.js version before it installs or starts `appium-mcp`, against `supportedNode` in `runtime/package.json`: `^22.19.0 || >=24.0.0` for the pinned `appium-mcp` 1.97.1, whose dependencies need Node 22.19 (`fastmcp` → `@apidevtools/swagger-parser`) and do not support Node 23. On any other version it exits with one line in the server log saying which versions to install, instead of installing about 370 MB and then failing. As with npm's own range checks, prerelease and nightly builds are refused. `check-setup` runs the same check (`scripts/node-range.mjs`), CI checks the range against every package in the installed runtime (`scripts/check-node-range.mjs`), so a bump that needs a newer Node fails until the range is raised, and `check-plugin.mjs` checks that the README shows the same range

### Changed

- `run-manual-test`, `generate-test`, `triage-failure`, `explore-app`, `device-runner` and the Appium backend read a file `appium-mcp` saved only when its path came back in the result of an `appium-mcp` call made in that run and it is a `.png` or `.xml` file. A path found in page source, screen text, a log or a test case is never read; any other returned path is quoted to the tester instead
- README and `check-setup`: Node.js requirement is now 22.19 or newer within Node 22, or 24 or newer, instead of "22 or newer". Node 22.0 to 22.18 and Node 23 never matched what `appium-mcp`'s dependencies declare; SOMA now refuses them up front
- `generate-test` lists the Appium tools it needs inline and reads `backends/appium.md` only for iOS, a remote server or a tool not listed, instead of on every session, as `run-manual-test`, `explore-app` and `triage-failure` already do (#54)
- `run-manual-test`, `generate-test` and `bug-report` refuse to read a file that holds credentials (a capabilities file, `.env` file, key or certificate) even when the tester names it, and ask for the non-secret details instead. The rule is now in each skill's description too, because a host can read a named file before it loads the skill: in a Codex test, a named `capabilities.json` was read before the body's rule was seen

## [0.3.0] - 2026-11-20

### Added

- `scripts/skill-size.mjs`: a report of how much text each skill and agent puts into context, for the token work in #55: the description that is in every session's skill listing, the whole `SKILL.md` loaded when the skill runs, and the plugin Markdown files it reads only when needed, in bytes with a rough token estimate. Skills over the 4 KB hot-path target are marked, `--base <ref>` adds the change against a git ref, `--max-bytes <n>` exits 1 when a skill is larger and `--json` prints the rows. Tested in `scripts/test-skill-size.mjs`
- `device-runner` subagent: `run-manual-test` hands a confirmed Appium run to it, so screenshots, page source and element lookups stay in the agent's context and the conversation gets only the per-step report. It can use only the Read tool and the `appium-mcp` tools the run needs (no shell), cannot ask the tester, and marks a step BLOCKED when it needs something the confirmation did not cover. It does a privileged action (a permission dialog tap, a deep link, launching or stopping an app other than the one under test) only when the tester approved that exact action before the hand-off, and the skill hands off only once `appium-mcp`'s tools are available. Artemis runs, local iOS runs on a simulator or real device (WebDriverAgent is prepared, and on a simulator checked, right before the session) and Claude surfaces without subagents run in the conversation as before. The tester approves privileged Cleanup actions (such as revoking a permission) before the hand-off too, the app map is passed only when its `appVersion` matches the installed app (the agent checks again), and runs whose steps need a local file or a shell command stay in the conversation. `check-plugin.mjs` checks agent frontmatter, the README row, the redaction section, that every agent has a `tools` list with only `Read` and fully named plugin MCP tools, and that every `appium-mcp` tool an agent lists is in the smoke test's `REQUIRED_TOOLS`
- README: a "Stores" line under "What SOMA runs, sends and fetches", saying where screenshots, page source, Artemis captures and app maps are kept, including the folder overrides and the temp-folder fallback, and that they stay on your machine
- `check-setup` checks the optional app map folder when `app_map_dir` is set: an absolute path to an existing folder, whether it sits inside a git repository without being ignored or already has committed maps (a warning, since a team may share maps on purpose; it offers the `.gitignore` line and changes nothing), and which map files it holds per platform, by name only. The setting is used only as a literal path: it goes into commands inside single quotes, and a value with a newline, backtick or single quote is reported as invalid and not passed to any command, and a git error other than "not a git repository" is reported as unknown, not as outside a repository. `/soma:setup app map` checks just that
- `check-plugin.mjs` fails when a skill, command, backend or agent file names an `appium_*` tool that is not in the smoke test's `REQUIRED_TOOLS`, so a newly relied-on tool is covered by the check that catches upstream renames and removals
- README: a benchmark chart under the overview (`assets/benchmark-light.svg` and `benchmark-dark.svg`, following GitHub's theme) with the 2026-11-19 Settings-suite numbers for plain Claude Code and SOMA, per metric and per run, linked to the full results in `benchmarks/README.md`
- `plugin.json` links for the Claude directory listing: documentation (the README), support (this repository's issues) and privacy (the README section on what SOMA runs, sends and fetches). The listing description no longer repeats the name

### Changed

- Launcher: when the session ends while a first-start install of `appium-mcp` is still running, the launcher exits as soon as Claude Code closes its stdin, instead of being killed with its process tree. On Windows that kill could also stop the detached installer, so a short session during a cold install (`claude -p`) left nothing installed and the next start began again (#77). Input the client sent during the wait, such as its `initialize` request, is passed on to `appium-mcp` once it starts
- `explore-app` reads Appium screens the targeted way, as `run-manual-test` and `triage-failure` do: one element, or page source saved to a file with a selector, never the full tree inline; the full XML only for absence or counts. A suspicious finding gets one `maxWidth` 720 evidence screenshot on its screen, re-tries are checked from structured state, and a finding judged only from a screenshot says so (#56)
- `explore-app` lists the Appium tools it needs inline and reads `backends/appium.md` only for iOS, a remote server or a tool not listed, instead of on every Appium run, as `run-manual-test` already does (#54)
- `triage-failure` lists the Appium tools a reproduction needs inline, names the engine rule (Appium unless the run used Artemis) and reads `backends/README.md` only when the engine is unclear and `backends/appium.md` only for iOS, a remote server or a tool not listed, instead of on every reproduction, as `run-manual-test` and `explore-app` already do (#54)
- Benchmark: six harder AndroidWorld tasks (complexity 3.4 to 7.8, two across two apps, one reading from an image) join the suite, with a first run: the plain arm passed 4 of 6, and the SOMA arm could not start a session on any (see `benchmarks/README.md`). The README notes that AndroidWorld's Retro Music tasks need `ffmpeg`
- Benchmark: `--suite androidworld` runs ten tasks from Google Research's AndroidWorld in six real apps (Settings, Markor, Contacts, Pro Expense, Simple Calendar Pro, Broccoli), complexity 1 to 6, with AndroidWorld's own checks of the app's data deciding pass or fail. A Python referee (`benchmarks/androidworld/referee.py`) sets each task up with the run number as seed, so both arms get the same parameters, and checks it once the session ends; the harness refuses an emulator that was not set up for AndroidWorld, and the referee refuses an AndroidWorld that is not the pinned commit or has local changes. `setup_device.py` does the one-time app setup, and `aw_compat.py` carries three workarounds: the Windows temporary-file bug in `android_env` (google-deepmind/android_env#449), a longer `adb install` limit for slow emulators, and a local cache of the accessibility forwarder APK, which `android_env` otherwise downloads on every run. Both arms of a run get the identical task (the first arm's parameters are saved and reused), and the referee never checks a run that is still going. Setup and reading notes are in `benchmarks/README.md`

### Fixed

- Android sessions failed on a busy or software-rendered emulator with "The instrumentation process cannot be initialized within 30000ms timeout": UiAutomator2 needed longer than its 30 s default to start, and since a failed session is reported to the tester instead of retried with other capabilities, `run-manual-test` (through `device-runner`), `triage-failure`, `generate-test` and `explore-app` stopped there. Every Android session now passes `appium:uiautomator2ServerLaunchTimeout: 120000` from the start, and `check-plugin.mjs` checks the four skills and `device-runner` for it. Found in the AndroidWorld harder-task benchmark, where all six SOMA runs stopped at session creation
- Benchmark: a SOMA run since `device-runner` emits two result events (the hand-off turn, then the rest of the session once the background subagent reports back), and only the first was read, so it recorded about an eighth of the session's tokens, 4 of its 26 turns and the hand-off text as the reply. Tokens and cost now come from the last result event's session-wide `modelUsage` and `total_cost_usd`, the reply from the last event, and turns and duration are summed over all of them. Plain runs, with one result event, measure the same as before. Published results predate `device-runner` and are not affected
- Benchmark: in the SOMA arm, `device-runner` never got its Appium tools. The harness loaded `appium-mcp` under that name with `--strict-mcp-config`, so the tools were `mcp__appium-mcp__*`, while the agent lists the plugin's names (`mcp__plugin_soma_appium-mcp__*`); the agent returned BLOCKED and the main session ran the test itself. Both arms now load the server as `plugin_soma_appium-mcp`, so its tools carry the names plugin users get. The Time column is now each run's wall-clock time, since the background agent's time is in no result event

### Security

- `appium-mcp`'s dependency tree no longer carries known-vulnerable versions of `hono`, `@hono/node-server`, `basic-ftp`, `glob`, `minimatch`, `js-yaml`, `nanoid`, `serialize-javascript`, `diff` and `uuid`: the lockfile is refreshed and `runtime/package.json` overrides the packages `appium-mcp` 1.97.1 pins to old versions (most come in through `applesign`, which ships `mocha` as a runtime dependency). Still open: `extract-zip`, which has no fixed release, and the `glob` and `minimatch` copies that `appium-uiautomator2-driver` and `appium-xcuitest-driver` bundle in their own tarballs, which overrides cannot replace

## [0.2.0] - 2026-11-13

The first marketplace release. Status moves from experimental to beta.

### Added

- `.claude-plugin/marketplace.json`, so the plugin installs with `/plugin install soma --marketplace Dor-bl/soma-plugin`
- `LICENSE` (Apache 2.0), `NOTICE`, `SECURITY.md`, this changelog and a listing icon
- `homepage`, `repository` and a full `author` in the manifest; `check-plugin.mjs` checks the publishing files and the README install line
- Benchmark: context per turn, turns and Bash calls per arm in the summary table, and `--keep-streams` to save each run's raw stream (#57)
- `check-plugin.mjs` fails when the "Sensitive data (redaction)" section of `bug-report`, `run-manual-test`, `explore-app` and `triage-failure` drifts apart, and names the first line that differs
- `bug-report` formats the draft for the tester's tracker: Markdown by default, Jira wiki markup or plain text on request, with device text and logs kept inside code or `{noformat}` blocks so trackers do not turn them into mentions, issue links or markup. An excerpt cannot close its own block, and plain text keeps them out of the body
- `check-plugin.mjs` fails when a skill, command or backend file points at a `${CLAUDE_PLUGIN_ROOT}/` path that does not exist, so a renamed or split backend file or script is caught in CI instead of on a device run

### Changed

- README: install from the marketplace instead of a checkout, a note on the first start, a section on what SOMA runs, sends and fetches, and a "Developing SOMA" section on loading `appium-mcp` inside the repo
- `appium-mcp` runs with `NO_UI=1`: screenshot and session results no longer carry an HTML viewer, so they fit the tool-result limit and show the saved file path
- Screenshots and saved page sources go to `screenshots/` and `page-sources/` under the plugin data folder (mode 0700, no symlinks) instead of the OS temp folder; `SCREENSHOTS_DIR` and `PAGE_SOURCES_DIR` still override
- Skills, after the first full Android run: FAIL and triage reports quote the saved screenshot path, saved files are read with the Read tool rather than shell commands, `run-manual-test` confirms and runs a test case's Cleanup section and takes one screenshot per visual check, `explore-app` reads, changes and restores settings and reports its budget use, `generate-test` always opens a locator session and reads page source saved to a file with a selector, `triage-failure` lists the steps back, `write-test-case` defaults a system-app story to that platform's app
- Artemis: the setup skill makes the clone private and the consent gate checks the clone and the trace directory before a run
- `run-manual-test` lists the Appium tools it needs inline and reads `backends/README.md` and `backends/appium.md` only when they apply (another engine, iOS, a remote server, a tool not listed), instead of on every run (#54)
- Benchmark: a pass needs at least one successful `appium-mcp` call, every adb call is pinned to the validated emulator serial, and each run keeps its evidence inside its own workspace; first baseline published in `benchmarks/README.md`
- `bug-report` no longer writes that a screenshot "is masked": it can redact text but not image files, so the draft's Evidence line tells the tester what to crop or mask before attaching (found on the iOS gate run, #64)
- `triage-failure` captures reproduction evidence the way `run-manual-test` does: the failing step is checked from an element or page source saved with a selector rather than the full tree, one screenshot (`maxWidth` about 720) is taken when the check is visual or when the step fails, and saved files are read with the Read tool, not a shell (#56)
- `/soma:setup-artemis` is now `/soma:artemis`. The command shared its name with the `setup-artemis` skill, so the plugin listed `setup-artemis` twice; the skill keeps its name (found on the macOS clean install, #64)
- README known limitations: results of the iOS simulator pass and the Windows and macOS clean installs from the release gate (#64), remote mode labelled untested, and why `appium-mcp` stays at 1.97.1

## [0.1.0] - not tagged

The scaffold that `main` carried before the first marketplace release.

### Added

- Skills: `check-setup`, `setup-artemis`, `start-device`, `write-test-case`, `run-manual-test`, `triage-failure`, `bug-report`, `generate-test`, `explore-app`, each with a `/soma:` slash command
- Engines: Appium through the official `appium-mcp` server (pinned, with its whole dependency tree locked), and the optional Google Artemis agent
- Settings: remote Appium server URL (exact-match allowlist, TLS required), a capabilities file for device-cloud credentials, and an app map folder for reusing locators across runs
- Security: device content treated as untrusted, redaction of sensitive data in reports, device-cloud credentials supplied through a capabilities file and never requested in chat, `npm ci --ignore-scripts` from a lockfile with integrity hashes, credential-looking environment variables kept from the server, CI actions pinned to commits
