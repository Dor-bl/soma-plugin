# Changelog

Notable changes to SOMA, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Plugin users receive a new copy only when `version` in `plugin.json` changes.

## [Unreleased]

### Added

- `device-runner` subagent: `run-manual-test` hands a confirmed Appium run to it, so screenshots, page source and element lookups stay in the agent's context and the conversation gets only the per-step report. It can use only the Read tool and the `appium-mcp` tools the run needs (no shell), cannot ask the tester, and marks a step BLOCKED when it needs something the confirmation did not cover. It does a privileged action (a permission dialog tap, a deep link, launching or stopping an app other than the one under test) only when the tester approved that exact action before the hand-off, and the skill hands off only once `appium-mcp`'s tools are available. Artemis runs, local iOS runs on a simulator or real device (WebDriverAgent is prepared, and on a simulator checked, right before the session) and Claude surfaces without subagents run in the conversation as before. The tester approves privileged Cleanup actions (such as revoking a permission) before the hand-off too, the app map is passed only when its `appVersion` matches the installed app (the agent checks again), and runs whose steps need a local file or a shell command stay in the conversation. `check-plugin.mjs` checks agent frontmatter, the README row, the redaction section, that every agent has a `tools` list with only `Read` and fully named plugin MCP tools, and that every `appium-mcp` tool an agent lists is in the smoke test's `REQUIRED_TOOLS`
- README: a "Stores" line under "What SOMA runs, sends and fetches", saying where screenshots, page source, Artemis captures and app maps are kept, including the folder overrides and the temp-folder fallback, and that they stay on your machine
- `check-setup` checks the optional app map folder when `app_map_dir` is set: an absolute path to an existing folder, whether it sits inside a git repository without being ignored or already has committed maps (a warning, since a team may share maps on purpose; it offers the `.gitignore` line and changes nothing), and which map files it holds per platform, by name only. The setting is used only as a literal path: it goes into commands inside single quotes, and a value with a newline, backtick or single quote is reported as invalid and not passed to any command, and a git error other than "not a git repository" is reported as unknown, not as outside a repository. `/soma:setup app map` checks just that
- `check-plugin.mjs` fails when a skill, command, backend or agent file names an `appium_*` tool that is not in the smoke test's `REQUIRED_TOOLS`, so a newly relied-on tool is covered by the check that catches upstream renames and removals
- `plugin.json` links for the Claude directory listing: documentation (the README), support (this repository's issues) and privacy (the README section on what SOMA runs, sends and fetches). The listing description no longer repeats the name

### Changed

- Launcher: when the session ends while a first-start install of `appium-mcp` is still running, the launcher exits as soon as Claude Code closes its stdin, instead of being killed with its process tree. On Windows that kill could also stop the detached installer, so a short session during a cold install (`claude -p`) left nothing installed and the next start began again (#77). Input the client sent during the wait, such as its `initialize` request, is passed on to `appium-mcp` once it starts
- `explore-app` reads Appium screens the targeted way, as `run-manual-test` and `triage-failure` do: one element, or page source saved to a file with a selector, never the full tree inline; the full XML only for absence or counts. A suspicious finding gets one `maxWidth` 720 evidence screenshot on its screen, re-tries are checked from structured state, and a finding judged only from a screenshot says so (#56)
- `explore-app` lists the Appium tools it needs inline and reads `backends/appium.md` only for iOS, a remote server or a tool not listed, instead of on every Appium run, as `run-manual-test` already does (#54)
- `triage-failure` lists the Appium tools a reproduction needs inline, names the engine rule (Appium unless the run used Artemis) and reads `backends/README.md` only when the engine is unclear and `backends/appium.md` only for iOS, a remote server or a tool not listed, instead of on every reproduction, as `run-manual-test` and `explore-app` already do (#54)
- Benchmark: `--suite androidworld` runs ten tasks from Google Research's AndroidWorld in six real apps (Settings, Markor, Contacts, Pro Expense, Simple Calendar Pro, Broccoli), complexity 1 to 6, with AndroidWorld's own checks of the app's data deciding pass or fail. A Python referee (`benchmarks/androidworld/referee.py`) sets each task up with the run number as seed, so both arms get the same parameters, and checks it once the session ends; the harness refuses an emulator that was not set up for AndroidWorld. `setup_device.py` does the one-time app setup, and `aw_compat.py` carries two workarounds: the Windows temporary-file bug in `android_env` (google-deepmind/android_env#449) and a longer `adb install` limit for slow emulators. Setup and reading notes are in `benchmarks/README.md`

### Fixed

- Benchmark: a SOMA run since `device-runner` emits two result events (the hand-off turn, then the rest of the session once the background subagent reports back), and only the first was read, so it recorded about an eighth of the session's tokens, 4 of its 26 turns and the hand-off text as the reply. Tokens and cost now come from the last result event's session-wide `modelUsage` and `total_cost_usd`, the reply from the last event, and turns and duration are summed over all of them. Plain runs, with one result event, measure the same as before. Published results predate `device-runner` and are not affected
- Benchmark: in the SOMA arm, `device-runner` never got its Appium tools. The harness loaded `appium-mcp` under that name with `--strict-mcp-config`, so the tools were `mcp__appium-mcp__*`, while the agent lists the plugin's names (`mcp__plugin_soma_appium-mcp__*`); the agent returned BLOCKED and the main session ran the test itself. Both arms now load the server as `plugin_soma_appium-mcp`, so its tools carry the names plugin users get. The Time column is now each run's wall-clock time, since the background agent's time is in no result event

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
