# CLAUDE.md

SOMA is a Claude Code plugin for mobile QA, built on the official [`appium-mcp`](https://github.com/appium/appium-mcp) server. There is no application code: the product is the prompts in `skills/*/SKILL.md` and `commands/*.md`. This file is for working on the plugin; it is not shipped to plugin users.

## Layout

- `.claude-plugin/plugin.json`: manifest, version, listing fields (`homepage`, `repository`, `author`) and `userConfig` (`remote_server_url`, `capabilities_file`, `app_map_dir`)
- `.claude-plugin/marketplace.json`: the single-plugin marketplace users add with `/plugin marketplace add Dor-bl/soma-plugin`; its entry points at `./` and carries no version (`plugin.json` does). `.claude-plugin/icon.png` is the listing icon, rendered from `assets/logo-icon.svg`
- `LICENSE`, `NOTICE`, `CHANGELOG.md`, `SECURITY.md`: publishing files; add a changelog entry under "Unreleased" with every user-visible change
- `.mcp.json`: starts `scripts/start-appium-mcp.mjs`, which installs `appium-mcp` from `runtime/package-lock.json` (`npm ci --ignore-scripts`, into `${CLAUDE_PLUGIN_DATA}`) and runs it with a remote-URL allowlist
- `runtime/`: `package.json` pinning `appium-mcp`, and the committed lockfile for its whole dependency tree
- `skills/<name>/SKILL.md`: one skill per folder
- `commands/*.md`: slash commands (`/soma:<file>`), each a one-line hand-off to a skill
- `backends/`: one file per device engine (Appium default, optional Google Artemis). Skills say *what* to do; these files say *which tools* do it. Selection rules are in `backends/README.md`
- `scripts/`: the launcher (`start-appium-mcp.mjs`, `allowlist.mjs`), the emulator starter (`start-emulator.mjs`), CI checks (`check-plugin.mjs`, `mcp-smoke.mjs`, with its Windows cleanup in `process-tree.mjs`) and their unit tests (`test-*.mjs`)
- `benchmarks/`: tasks and method for the token benchmark (plain Claude Code vs SOMA on the Android Settings app); `scripts/benchmark.mjs` runs it, `benchmark-stats.mjs` holds the tested parsing and summary

## Checks (same as CI)

```bash
claude plugin validate --profile directory .   # also the plugin directory's submission checks
node scripts/check-plugin.mjs        # frontmatter, userConfig, version badge, command hand-offs, publishing files
node scripts/test-allowlist.mjs       # remote-server allowlist
node scripts/test-process-tree.mjs    # Windows process-tree cleanup
node scripts/test-child-env.mjs       # credential-looking env vars stay out of appium-mcp
node scripts/test-triage-command.mjs  # /soma:triage command contract
node scripts/test-injection-match.mjs # injection-check reply and shell matching
node scripts/test-benchmark-stats.mjs # benchmark run parsing and summary
npx markdownlint-cli2 "**/*.md"
node scripts/mcp-smoke.mjs           # first run installs ~370 MB; SMOKE_TIMEOUT_MS overrides, CLAUDE_PLUGIN_DATA sets the install folder
```

CI also runs a link check (lychee) on all Markdown, so links must resolve.

Not in CI: `node scripts/injection-check.mjs` runs live Claude Code sessions (needs the `claude` CLI, logged in, and uses model calls) to check that `run-test`, `gen-test` and `bug` ignore and flag instructions hidden in a test-case file. Run it after changing `commands/` or a skill's untrusted-content rules. `node scripts/benchmark.mjs` is also live-only (emulator, `adb`, model calls); see `benchmarks/README.md`. It fails only on what the session did (canary created, blocked tools used, files written); its checks on the reply's wording only warn, so read any reply it prints with a ⚠.

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
- Every `${user_config.<key>}` used in a skill must be declared in `plugin.json`, and every declared key must be used.
- The README version badge must match `plugin.json` `version`. Bump both together, and add the release to `CHANGELOG.md`.
- `marketplace.json` must list `plugin.json`'s `name` with `source: "./"` and no `version`; `plugin.json` must carry `author.name`, `homepage` and `repository` (the GitHub URL); the README must contain the one-line install command and the `soma@soma-plugin` install id; `LICENSE`, `NOTICE`, `CHANGELOG.md`, `SECURITY.md` and `.claude-plugin/icon.png` must exist.
- Every `appium-mcp@<version>` in the README and skills must match the version pinned in `runtime/package.json`, and so must the lockfile. To bump: edit `runtime/package.json`, run `npm install --package-lock-only --ignore-scripts` in `runtime/`, review the lockfile diff, then update the docs.

## Writing skills

- Skills drive the device through an engine's MCP tools: `appium-mcp` by default, or the optional Google Artemis server (`mobile_*` tools). Skills say what to do; tool names and engine-specific rules live in `backends/`. Do not reimplement what the server already does.
- If a skill starts relying on a new `appium-mcp` tool, add it to `REQUIRED_TOOLS` in `scripts/mcp-smoke.mjs` so upstream removals are caught.
- Session setup reads `${user_config.remote_server_url}`: empty or a literal `${user_config...}` placeholder means local mode (no `remoteServerUrl`), set means pass exactly that value as `remoteServerUrl`. Every skill that creates a session with Appium (`run-manual-test`, `triage-failure`, `generate-test`, `explore-app`) must carry the same remote-URL, `autoGrantPermissions` and `noReset` rules.
- Anything that runs local tools (`adb`, `appium`, test clients) must say whether it applies to remote sessions too. Local `adb` can hit the wrong device when the server is remote.
- Skills that quote screenshots, logs or page source back to the tester (`bug-report`, `run-manual-test`, `explore-app`, `triage-failure`) carry the same "Sensitive data (redaction)" section; `check-plugin.mjs` checks that the section is word-for-word the same in all four (`REDACTION_SYNC`), so change it in every one at once. `write-test-case` has its own variant for stories and tickets and is only checked for presence.
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
- Artemis (first live run, #18): a task can report `running` while paused on an LLM billing or overload error, with an empty trace; a Flash tap aimed at one row opened the next one while the screen was still settling. Poll status, and compare each step's overlay with the resulting screen.
