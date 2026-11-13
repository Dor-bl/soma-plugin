# Changelog

Notable changes to SOMA, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Plugin users receive a new copy only when `version` in `plugin.json` changes.

## [Unreleased]

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

## [0.1.0] - not tagged

The scaffold that `main` carried before the first marketplace release.

### Added

- Skills: `check-setup`, `setup-artemis`, `start-device`, `write-test-case`, `run-manual-test`, `triage-failure`, `bug-report`, `generate-test`, `explore-app`, each with a `/soma:` slash command
- Engines: Appium through the official `appium-mcp` server (pinned, with its whole dependency tree locked), and the optional Google Artemis agent
- Settings: remote Appium server URL (exact-match allowlist, TLS required), a capabilities file for device-cloud credentials, and an app map folder for reusing locators across runs
- Security: device content treated as untrusted, redaction of sensitive data in reports, device-cloud credentials supplied through a capabilities file and never requested in chat, `npm ci --ignore-scripts` from a lockfile with integrity hashes, credential-looking environment variables kept from the server, CI actions pinned to commits
