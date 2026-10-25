---
name: explore-app
description: Exploratory testing of a mobile app area without written steps (e.g. "poke around checkout and tell me what looks wrong"). Reports suspected issues with evidence. Uses Google Artemis on Android when it is installed, otherwise Appium. Use when a tester asks to explore, smoke-check or look for problems in a flow.
---

# Explore an app area

## Inputs to confirm (ask one short question if missing)
- Platform and app under test
- The area or goal to explore (e.g. "checkout with a coupon"), and anything off limits (real payments, deleting data, sending messages)
- Test account to use, if login is needed

## Engine
- Android with Artemis's `mobile_*` tools available: use Artemis (`${CLAUDE_PLUGIN_ROOT}/backends/artemis.md`). Give it the goal in small chunks (one screen or sub-flow per `mobile_run_task`) so findings can be traced to a step.
- Otherwise use Appium (`${CLAUDE_PLUGIN_ROOT}/backends/appium.md`) and drive the exploration yourself.
- Remote Appium server URL configured for this plugin: `${user_config.remote_server_url}` (Appium only; empty means local mode).

## Exploration
1. Start the session. If it fails, stop and report the exact error.
2. Walk the area: main path first, then edge cases (empty fields, back navigation, rotation, invalid input, repeated taps).
3. For anything suspicious, capture a screenshot and the steps that led there (for Artemis, the trace from `mobile_inspect_trace`).
4. Stay inside the agreed area and limits. Stop and ask before anything irreversible.
5. Close the session at the end.

## Report format
The engine used, what was covered, then a list of findings: what happened, steps to get there, evidence, and whether it reproduced on a second try. Mark each finding as observed or suspected. Offer `bug-report` for confirmed findings and `run-manual-test` to turn a finding into a repeatable check.

## Rules
- Do not enter real credentials, personal data or payment details.
- A finding is not a confirmed bug until it reproduces. Say how many times it was tried.
