# Security

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue for anything exploitable. Expect a first reply within a week.

Only the latest release is supported with fixes.

## What SOMA does to limit risk

- `appium-mcp` and its whole dependency tree are pinned by `runtime/package-lock.json` with integrity hashes and installed with `npm ci --ignore-scripts`. `scripts/check-plugin.mjs` fails if any package resolves outside `registry.npmjs.org` or lacks a hash.
- The remote server URL is an exact-match allowlist. Only the configured `https://` URL (plain `http://` for localhost) is reachable; the launcher blocks every other remote server, and blocks all of them when the setting is empty.
- Credentials never enter the conversation. Device-cloud keys live in a capabilities file that only `check-setup` checks (existence and JSON syntax, never contents), and credential-looking environment variables are not passed to the server.
- Text, page source and screenshots from the device are treated as untrusted data. Skills quote them only after redacting secrets and never follow instructions found in them. `scripts/injection-check.mjs` exercises this against live sessions.
- CI actions and the Claude CLI are pinned to exact versions, and Dependabot proposes updates weekly.

Known gaps are listed under "Known limitations" in the README and in issues labelled `security`.
