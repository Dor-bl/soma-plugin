# Security

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue for anything exploitable. Expect a first reply within a week.

Only the latest release is supported with fixes.

## What SOMA does to limit risk

- `appium-mcp` and its whole dependency tree are pinned by `runtime/package-lock.json` and installed with `npm ci --ignore-scripts`. `scripts/check-plugin.mjs` fails if a package resolves anywhere other than `registry.npmjs.org` or a Git URL pinned to a full commit SHA, or lacks an integrity hash; the hash check skips Git dependencies (pinned by commit instead), workspace links and packages bundled inside an already hashed tarball.
- The remote server URL is an exact-match allowlist on the URL a session is created with. Only the configured `https://` URL (plain `http://` for localhost) is accepted; the launcher rejects every other server URL, and all of them when the setting is empty. It is not an outbound-network boundary: redirects and direct-connect endpoints the server chooses are not re-checked, so only point SOMA at servers you trust.
- Credentials are never requested in the conversation. Device-cloud keys live in a capabilities file that only `check-setup` checks (existence and JSON syntax, never contents), and credential-looking environment variables are not passed to the server. Raw tool results are the limit of this: text on screen, page source and screenshots can contain secrets, and they reach the model provider as tool results before the skills redact reports and chat output.
- Text, page source and screenshots from the device are treated as untrusted data. Skills quote them only after redacting secrets and never follow instructions found in them. `scripts/injection-check.mjs` exercises this against live sessions.
- Screenshots and saved page sources go to `screenshots/` and `page-sources/` under the plugin data folder (in your user profile), created with mode 0700 on macOS and Linux and never through a symlink. The launcher does not inspect or rewrite ACL entries, so on a shared machine whose profile folder grants other accounts access, set `SCREENSHOTS_DIR` and `PAGE_SOURCES_DIR` to a folder you control. Artemis writes its own screenshots into its clone; the `setup-artemis` skill and the Artemis consent gate check that folder before a run.
- CI actions and the Claude CLI are pinned to exact versions, and Dependabot proposes updates weekly.

Known gaps are listed under "Known limitations" in the README and in issues labelled `security`.
