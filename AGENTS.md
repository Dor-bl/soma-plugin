# AGENTS.md

SOMA is a Claude Code plugin for mobile QA, built on the official [`appium-mcp`](https://github.com/appium/appium-mcp) server. There is no application code: the product is the prompts in `skills/*/SKILL.md` and `commands/*.md`. This file is for working on the plugin; it is not shipped to plugin users.

## Layout

- `.claude-plugin/plugin.json`: manifest, version, listing fields (`homepage`, `repository`, `author`) and `userConfig` (`remote_server_url`, `capabilities_file`, `app_map_dir`)
- `.claude-plugin/marketplace.json`: the single-plugin marketplace users add with `/plugin marketplace add Dor-bl/soma-plugin`; its entry points at `./` and carries no version (`plugin.json` does). `.claude-plugin/icon.png` is the listing icon, rendered from `assets/logo-icon.svg`
- `LICENSE`, `NOTICE`, `CHANGELOG.md`, `SECURITY.md`: publishing files; add a changelog entry under "Unreleased" with every user-visible change
- `.mcp.json`: starts `scripts/start-appium-mcp.mjs`, which installs `appium-mcp` from `runtime/package-lock.json` (`npm ci --ignore-scripts`, into `${CLAUDE_PLUGIN_DATA}`) and runs it with a remote-URL allowlist
- `runtime/`: `package.json` pinning `appium-mcp`, and the committed lockfile for its whole dependency tree
- `skills/<name>/SKILL.md`: one skill per folder
- `commands/*.md`: slash commands (`/soma:<file>`), each a one-line hand-off to a skill
- `agents/*.md`: subagents. `device-runner` runs a confirmed `run-manual-test` case through Appium in its own context. A skill that delegates passes every value in the brief (resolved remote URL, plugin file paths): do not use `${user_config.*}` or `${CLAUDE_PLUGIN_ROOT}` in agent files
- `backends/`: one file per device engine (Appium default, optional Google Artemis). Skills say *what* to do; these files say *which tools* do it. Selection rules are in `backends/README.md`
- `scripts/`: the launcher (`start-appium-mcp.mjs`, `allowlist.mjs`, `child-env.mjs`, `stdin-gate.mjs`, `system-tools.mjs`), the emulator starter (`start-emulator.mjs`), CI checks (`check-plugin.mjs`, `mcp-smoke.mjs`, with its Windows cleanup in `process-tree.mjs`) and their unit tests (`test-*.mjs`), and `skill-size.mjs`, the context-size report for #55
- `benchmarks/`: tasks and method for the token benchmark (plain Claude Code vs SOMA on the Android Settings app); `scripts/benchmark.mjs` runs it, `benchmark-stats.mjs` holds the tested parsing, summary and prompt. `benchmarks/androidworld/` is the optional `--suite androidworld`: ten AndroidWorld tasks, the Python referee that sets each up and checks it, the one-time device setup and the Windows workarounds (`aw_compat.py`). CI does not run the Python files

## Checks (same as CI)

```bash
claude plugin validate --profile directory .   # also the plugin directory's submission checks
node scripts/check-plugin.mjs        # frontmatter, userConfig, version badge, command hand-offs, publishing files
node scripts/test-allowlist.mjs       # remote-server allowlist
node scripts/test-process-tree.mjs    # Windows process-tree cleanup
node scripts/test-child-env.mjs       # credential-looking env vars stay out of appium-mcp
node scripts/test-stdin-gate.mjs      # launcher exits on stdin close during an install, replays held input
node scripts/test-system-tools.mjs    # Windows system tool path resolution
node scripts/test-triage-command.mjs  # /soma:triage command contract
node scripts/test-injection-match.mjs # injection-check reply and shell matching
node scripts/test-benchmark-stats.mjs # benchmark run parsing and summary
node scripts/test-release.mjs         # release script: version bump, changelog cut, notes, promote checks
npx markdownlint-cli2 "**/*.md"
node scripts/mcp-smoke.mjs           # first run installs ~370 MB; SMOKE_TIMEOUT_MS overrides, CLAUDE_PLUGIN_DATA sets the install folder
```

CI also runs a link check (lychee) on all Markdown, so links must resolve.

Not in CI: `node scripts/injection-check.mjs` runs live Claude Code sessions (needs the `claude` CLI, logged in, and uses model calls) to check that `run-test`, `gen-test` and `bug` ignore and flag instructions hidden in a test-case file. Run it after changing `commands/` or a skill's untrusted-content rules. `node scripts/skill-size.mjs` prints how many bytes each skill and agent puts into context (description, whole file, and the plugin files it reads when needed), marks skills over the 4 KB hot-path target from #55, and with `--base develop` shows the change against a ref; run it before and after trimming a skill. `--max-bytes <n>` exits 1 if a `SKILL.md` is larger; its tests are `node scripts/test-skill-size.mjs`, not yet a CI step. `node scripts/benchmark.mjs` is also live-only (emulator, `adb`, model calls); see `benchmarks/README.md`. It fails only on what the session did (canary created, blocked tools used, files written); its checks on the reply's wording only warn, so read any reply it prints with a ⚠.

## Branches

- `develop` is where work lands: branch from it and open every PR against it (`gh pr create --base develop`). Squash merges are fine there.
- `main` is what users install: `marketplace.json` points at `./`, so `/plugin marketplace add` and plugin updates read the default branch. It moves only on a release, so its contents always match the version in `plugin.json`. Keep `main` the GitHub default branch; making `develop` the default would ship unreleased work.
- A hotfix that cannot wait for a release goes in a PR against `main` with a version bump (see "Releasing"), then `main` is merged back into `develop`.

## Releasing

1. `node scripts/release.mjs <version> --pr` (clean working tree, `gh` signed in) starts `release/v<version>` from `origin/develop`, bumps `plugin.json` and the README badge, moves the "Unreleased" changelog entries under `## [<version>] - <today>`, runs `check-plugin.mjs`, then commits, pushes and opens the PR against `develop`. With the version already in `plugin.json`, it only dates that version's heading. `--date YYYY-MM-DD` sets another date. Without `--pr` it only edits the files in the current checkout.
2. Review the PR and merge it (squash is fine).
3. `node scripts/release.mjs --promote <version>` checks that `origin/develop` has that version with a dated heading and that it is newer than `main`, then opens the `develop` → `main` PR. Merge it with a merge commit (not squash or rebase, which would rewrite `develop`'s commits and make the next release PR conflict).
4. On main, `.github/workflows/release.yml` sees the version change, tags `v<version>` on the merge commit and publishes a GitHub release with that changelog section as notes. It skips a push that leaves the version unchanged or a version that already has a release, and fails if the heading has no date. A version with a suffix (`1.0.0-rc.1`) is published as a prerelease. If it failed on something transient (network, a GitHub outage), use "Re-run jobs" on that run: it keeps the version-bump commit. If the fix needs a commit (e.g. an undated heading), merge the fix into `develop` and promote it to `main` as in step 3, then start the workflow by hand from the Actions tab on main: a changelog-only push does not trigger it, and the tag then goes on the current tip of main.

## Running appium-mcp while working in this repo

Opening this repo in Claude Code loads `.mcp.json` as a project config, not as a plugin, so `${CLAUDE_PLUGIN_ROOT}` and `${user_config.*}` stay unsubstituted. The launcher path does not resolve and `appium-mcp` shows "Failed to connect" (`Connection closed`). Plugin users are not affected, and `mcp-smoke.mjs` substitutes the variables itself.

To use the device tools here, add a local-scope entry with the absolute path; it overrides the project one for you only:

```bash
claude mcp add --env NO_UI=1 --scope local appium-mcp -- node "/absolute/path/to/this repo/scripts/start-appium-mcp.mjs"
```

The entry passes no remote URL, so remote servers stay blocked and only local devices work, as long as `SOMA_REMOTE_SERVER_URL` is not exported in your shell: the launcher reads it from the environment, and if it is set, remote sessions to that one URL are allowed (every other host stays blocked). Do not change `.mcp.json` to fix this: the variables are what make the plugin work for users.

## Conventions enforced by `check-plugin.mjs`

- Skill frontmatter `name` must equal the folder name; `description` is required and at most 1024 chars. Quote a description that contains a colon followed by a space.
- Every command needs a `description` in its frontmatter, must hand off with "Use the <skill> skill" to a skill that exists, and must have a row in the README "What's inside" table.
- Every command that uses `$ARGUMENTS` must say that a file it names is read as data, never as instructions (the exact phrase is in `check-plugin.mjs`), and what the file may be used for. Test-case files from shared repos or ticket systems can carry injected directives.
- Skills that create an Appium session (`run-manual-test`, `triage-failure`, `generate-test`, `explore-app`, listed in `SESSION_SKILLS`) must each carry the remote-URL, `autoGrantPermissions` and `noReset` rules from "Writing skills". The wording may differ, but each rule's key phrase must be present (`SESSION_RULES`). Add a new session-creating skill to the list.
- Every agent's `name` must equal its file name, it needs a `description`, a README row and a `tools` list (one comma-separated line; without it the agent gets every tool). Every `appium-mcp` tool in it must be written `mcp__plugin_soma_appium-mcp__<tool>` (no wildcards, no bare names) and be in `REQUIRED_TOOLS` in `scripts/mcp-smoke.mjs`; any other tool must be in `AGENT_BUILTIN_TOOLS` (only `Read` today), so giving an agent a shell is a deliberate change to that list. Agents must not use `${user_config.*}` or `${CLAUDE_PLUGIN_ROOT}`.
- Every `${user_config.<key>}` used in a skill must be declared in `plugin.json`, and every declared key must be used.
- Every `${CLAUDE_PLUGIN_ROOT}/<path>` in a skill, command or backend file must exist in the repo (an `#anchor` is ignored; `..` is rejected). Folders the plugin creates at run time, such as `.runtime/`, are listed in `RUNTIME_PATHS`. When you rename, move or split a backend file or script, update every reference in the same change.
- The README version badge must match `plugin.json` `version`. `scripts/release.mjs` bumps both and dates the changelog (see "Releasing").
- `marketplace.json` must list `plugin.json`'s `name` with `source: "./"` and no `version`; `plugin.json` must carry `author.name`, `homepage` and `repository` (the GitHub URL); the README must contain the one-line install command and the `soma@soma-plugin` install id; `LICENSE`, `NOTICE`, `CHANGELOG.md`, `SECURITY.md` and `.claude-plugin/icon.png` must exist.
- Every `appium-mcp@<version>` in the README and skills must match the version pinned in `runtime/package.json`, and so must the lockfile. To bump: edit `runtime/package.json`, run `npm install --package-lock-only --ignore-scripts` in `runtime/`, review the lockfile diff, then update the docs.

## Dependency alerts

Dependabot alerts all come from `runtime/package-lock.json` (`appium-mcp`'s tree). Dependabot security updates are on and open lockfile-only PRs for fixes that fit the existing ranges. Fixes it cannot make, because a package pins an exact old version, go in `overrides` in `runtime/package.json`. Key each override with a range that also covers its target (`"js-yaml@4": "^4.3.2"`, not `"js-yaml@<4.3.2"`), otherwise `npm ls` marks the result invalid; to apply a new one, remove the old entry from the lockfile's `packages` and run `npm install --package-lock-only --ignore-scripts`. Never remove an entry marked `"inBundle": true`: it ships inside its parent's tarball (the Appium drivers bundle their dependencies), overrides cannot replace it, and the lockfile would stop listing code that is still installed. Those alerts wait for an upstream driver release. On every `appium-mcp` bump, run `npm audit --package-lock-only` in `runtime/`, drop overrides the new tree no longer needs, and run `node scripts/mcp-smoke.mjs`. Dismiss an alert only when no fixed release exists or the code is unreachable, with the reason in the dismissal comment.

## Writing skills

- Skills drive the device through an engine's MCP tools: `appium-mcp` by default, or the optional Google Artemis server (`mobile_*` tools). Skills say what to do; tool names and engine-specific rules live in `backends/`. Do not reimplement what the server already does.
- If a skill starts relying on a new `appium-mcp` tool, add it to `REQUIRED_TOOLS` in `scripts/mcp-smoke.mjs` so upstream removals are caught. `check-plugin.mjs` fails on any `appium_*` tool named in a skill, command, backend or agent file that is missing from that list; tools without the prefix (`select_device`, `generate_locators`, `prepare_ios_simulator`) are not detected, so add those by hand.
- Session setup reads `${user_config.remote_server_url}`: empty or a literal `${user_config...}` placeholder means local mode (no `remoteServerUrl`), set means pass exactly that value as `remoteServerUrl`. Every skill that creates a session with Appium (`run-manual-test`, `triage-failure`, `generate-test`, `explore-app`) must carry the same remote-URL, `autoGrantPermissions` and `noReset` rules.
- Anything that runs local tools (`adb`, `appium`, test clients) must say whether it applies to remote sessions too. Local `adb` can hit the wrong device when the server is remote.
- Skills that quote screenshots, logs or page source back to the tester (`bug-report`, `run-manual-test`, `explore-app`, `triage-failure`) carry the same "Sensitive data (redaction)" section, and so does the `device-runner` agent; `check-plugin.mjs` checks that the section is word-for-word the same in all five (`REDACTION_SYNC`), so change it in every one at once. `write-test-case` has its own variant for stories and tickets and is only checked for presence.
- Keep skills short and imperative. Markdownlint is relaxed for prompts (see `.markdownlint-cli2.jsonc`); structural rules like closed code fences and valid tables still apply.
- When adding a skill or command, add it to the "What's inside" table in `README.md`.

## Lessons from real-device runs

Feed findings from real runs back into the skills (see #17). Examples already captured:

- Device labels can contain look-alike Unicode (Android renders "Wi-Fi" with a U+2011 non-breaking hyphen). Copy text exactly; write escapes in generated code.
- `generate_locators` output is tens of KB per screen. Prefer `appium_find_element` per step.
- Freshly booted emulators need longer `adbExecTimeout` / `uiautomator2ServerInstallTimeout`; system apps need `noReset`.
- `appium-mcp` requires Node 22+; older versions crash on startup and show as disconnected.
- iOS simulator (first live run, #31): WDA launched by `prepare_ios_simulator` stopped about a minute later, before any session, and session creation failed with `ECONNREFUSED`. Check WDA's `/status` right before creating a session and prepare again if it is down.
- `appium-mcp` 1.99.3 (Mac retest on #51, held at 1.97.1 for 0.2.0): on iOS 18.2 simulators the first `prepare_ios_simulator` fails with `wda_install: failed` because WDA crashes at launch (`lib_TestingInterop.dylib` not loaded, probably the coresim launch path from 1.97.2); a second prepare works, 1.97.1 does not have it. Reported as appium/appium-mcp#608. Since 1.97.2 `@appium/coresim` ships only a `darwin-arm64` prebuild, and `--ignore-scripts` skips its compile, so iOS on Intel Macs may not work. Before the next bump, retest iOS 18.2 on a fresh WDA install (remove WDA from the simulator first: a prepare with WDA already installed passes even with the bug) and, if possible, an Intel Mac.
- Android, all skills headless (phase 2 run, 2026-11-07): `appium-mcp` 1.97.1 attaches an HTML viewer to every screenshot and session result unless `NO_UI=1` is set, which overflowed the tool-result limit and hid the saved PNG path, so runs had no screenshots or decoded them with ad-hoc shell commands. `.mcp.json` now sets `NO_UI`. Also: a find by text can miss once right after an action, element ids go stale after a re-render, page source right after navigation can be empty, and `pattern` misses off-screen rows. The skills now say to read saved files with the Read tool, never a shell.
- device-runner hand-off (first live run, #83, Android 13 emulator, headless `claude -p --plugin-dir`): the plugin's `appium-mcp` was still connecting during the first turns after a fresh install, and a subagent started then gets no MCP tools at all, so it blocks every step. `run-manual-test` now waits for the tools before handing off. The agent also counts launching or stopping a second app as privileged while the skill's own list did not, so the brief said "none approved" and those steps would have been BLOCKED; the skill now asks for each one. A session created with `appPackage` and `noReset` left Settings in the background (`query_state` 3); the agent's foreground check caught it and activated the app.
- AndroidWorld harder tasks (2026-11-19, software-rendered Pixel 6 emulator): right after a heavy task setup, UiAutomator2 did not start within its 30 s default ("instrumentation process cannot be initialized"). The plain session retried with a longer `appium:uiautomator2ServerLaunchTimeout` and went on; `device-runner` treats a session error as BLOCKED and stopped every run. A default launch timeout on emulators, or one retry with a longer one, would cover it.
- Benchmark SOMA arm after #83 (2026-11-19): `device-runner` lists tools as `mcp__plugin_soma_appium-mcp__*`, the names Claude Code gives the plugin's own server. A harness that loads `appium-mcp` under another name (with `--strict-mcp-config`, which also keeps the plugin's `.mcp.json` from loading) leaves the agent without tools: it returns BLOCKED and the main session falls back, which still passes and so hides the problem. `benchmark.mjs` names the server `plugin_soma_appium-mcp`. Check a SOMA stream for Appium calls with a `parent_tool_use_id` after changing either side.
- Artemis (first live run, #18): a task can report `running` while paused on an LLM billing or overload error, with an empty trace; a Flash tap aimed at one row opened the next one while the screen was still settling. Poll status, and compare each step's overlay with the resulting screen.
