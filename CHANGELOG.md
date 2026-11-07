# Changelog

Notable changes to SOMA, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Plugin users receive a new copy only when `version` in `plugin.json` changes.

## [Unreleased]

### Added

- `.claude-plugin/marketplace.json`, so the plugin installs with `/plugin install soma --marketplace Dor-bl/soma-plugin`
- `LICENSE` (Apache 2.0), `NOTICE`, `SECURITY.md`, this changelog and a listing icon
- `homepage`, `repository` and a full `author` in the manifest; `check-plugin.mjs` checks the publishing files and the README install line

### Changed

- README: install from the marketplace instead of a checkout, a note on the first start, and a section on what SOMA runs, sends and fetches

## [0.1.0] - not tagged

The scaffold that `main` carried before the first marketplace release.

### Added

- Skills: `check-setup`, `setup-artemis`, `start-device`, `write-test-case`, `run-manual-test`, `triage-failure`, `bug-report`, `generate-test`, `explore-app`, each with a `/soma:` slash command
- Engines: Appium through the official `appium-mcp` server (pinned, with its whole dependency tree locked), and the optional Google Artemis agent
- Settings: remote Appium server URL (exact-match allowlist, TLS required), a capabilities file for device-cloud credentials, and an app map folder for reusing locators across runs
- Security: device content treated as untrusted, redaction of sensitive data in reports, device-cloud credentials supplied through a capabilities file and never requested in chat, `npm ci --ignore-scripts` from a lockfile with integrity hashes, credential-looking environment variables kept from the server, CI actions pinned to commits
