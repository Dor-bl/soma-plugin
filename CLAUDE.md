# CLAUDE.md

SOMA is a Claude Code plugin for mobile QA, built on the official [`appium-mcp`](https://github.com/appium/appium-mcp) server. There is no application code: the product is the prompts in `skills/*/SKILL.md` and `commands/*.md`. This file is for working on the plugin; it is not shipped to plugin users.

## Layout

- `.claude-plugin/plugin.json`: manifest, version and `userConfig` (`remote_server_url`)
- `.mcp.json`: starts `appium-mcp` through `scripts/start-appium-mcp.mjs` (pinned version, remote-URL allowlist)
- `skills/<name>/SKILL.md`: one skill per folder
- `commands/*.md`: slash commands (`/soma:<file>`), each a one-line hand-off to a skill
- `backends/`: one file per device engine (Appium default, optional Google Artemis). Skills say *what* to do; these files say *which tools* do it. Selection rules are in `backends/README.md`
- `scripts/`: CI checks (`check-plugin.mjs`, `mcp-smoke.mjs`, with its Windows cleanup in `process-tree.mjs`) and their unit tests (`test-*.mjs`)

## Checks (same as CI)

```bash
claude plugin validate .
node scripts/check-plugin.mjs        # frontmatter, userConfig, version badge
node scripts/test-allowlist.mjs       # remote-server allowlist
node scripts/test-process-tree.mjs    # Windows process-tree cleanup
npx markdownlint-cli2 "**/*.md"
node scripts/mcp-smoke.mjs           # slow on a cold npx cache; SMOKE_TIMEOUT_MS overrides
```

CI also runs a link check (lychee) on all Markdown, so links must resolve.

## Running appium-mcp while working in this repo

Opening this repo in Claude Code loads `.mcp.json` as a project config, not as a plugin, so `${CLAUDE_PLUGIN_ROOT}` and `${user_config.*}` stay unsubstituted. The launcher path does not resolve and `appium-mcp` shows "Failed to connect" (`Connection closed`). Plugin users are not affected, and `mcp-smoke.mjs` substitutes the variables itself.

To use the device tools here, add a local-scope entry with the absolute path; it overrides the project one for you only:

```bash
claude mcp add --scope local appium-mcp -- node "/absolute/path/to/this repo/scripts/start-appium-mcp.mjs"
```

It runs with no remote URL, so remote servers stay blocked and only local devices work. Do not change `.mcp.json` to fix this: the variables are what make the plugin work for users.

## Conventions enforced by `check-plugin.mjs`

- Skill frontmatter `name` must equal the folder name; `description` is required and at most 1024 chars. Quote a description that contains a colon followed by a space.
- Every command needs a `description` in its frontmatter.
- Every `${user_config.<key>}` used in a skill must be declared in `plugin.json`, and every declared key must be used.
- The README version badge must match `plugin.json` `version`. Bump both together.
- Every `appium-mcp@<version>` in the README and skills must match the version pinned in `scripts/start-appium-mcp.mjs`. Bump them together.

## Writing skills

- Skills drive the device through an engine's MCP tools: `appium-mcp` by default, or the optional Google Artemis server (`mobile_*` tools). Skills say what to do; tool names and engine-specific rules live in `backends/`. Do not reimplement what the server already does.
- If a skill starts relying on a new `appium-mcp` tool, add it to `REQUIRED_TOOLS` in `scripts/mcp-smoke.mjs` so upstream removals are caught.
- Session setup reads `${user_config.remote_server_url}`: empty means local mode (no `remoteServerUrl`), set means pass it as `remoteServerUrl`. Keep this wording consistent across skills.
- Anything that runs local tools (`adb`, `appium`, test clients) must say whether it applies to remote sessions too. Local `adb` can hit the wrong device when the server is remote.
- Keep skills short and imperative. Markdownlint is relaxed for prompts (see `.markdownlint-cli2.jsonc`); structural rules like closed code fences and valid tables still apply.
- When adding a skill or command, add it to the "What's inside" table in `README.md`.

## Lessons from real-device runs

Feed findings from real runs back into the skills (see #17). Examples already captured:

- Device labels can contain look-alike Unicode (Android renders "Wi-Fi" with a U+2011 non-breaking hyphen). Copy text exactly; write escapes in generated code.
- `generate_locators` output is tens of KB per screen. Prefer `appium_find_element` per step.
- Freshly booted emulators need longer `adbExecTimeout` / `uiautomator2ServerInstallTimeout`; system apps need `noReset`.
- `appium-mcp` requires Node 22+; older versions crash on startup and show as disconnected.
- Artemis (first live run, #18): a task can report `running` while paused on an LLM billing or overload error, with an empty trace; a Flash tap aimed at one row opened the next one while the screen was still settling. Poll status, and compare each step's overlay with the resulting screen.
