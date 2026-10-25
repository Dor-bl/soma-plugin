---
name: triage-failure
description: "Triage a failed Appium test run or UI test: classify as product bug, test/script issue, environment problem or flaky, and suggest next steps. Use when a tester shares a failure log, stack trace, screenshot or says a test failed."
---

# Triage a failed test

## Gather
Ask for whatever is missing, in one message: the error/stack trace, the failing step, platform and OS version, app build, and whether it failed before.

## Classify (pick one, say how confident you are)
- **Product bug**: app behavior contradicts the expected result and reproduces.
- **Test/script issue**: stale locator, wrong wait, wrong assumption about the flow.
- **Environment**: device offline, driver/Appium version mismatch, session timeout, permissions dialog, network.
- **Flaky**: passes and fails without code or build change. Needs repeated runs to confirm.

## Verify before concluding
- If a device or emulator is available, reproduce once and compare to the reported failure.
- To call something flaky, run it at least 3 times and report the pass/fail count. Do not label flaky from a single run.
- Distinguish what was observed from what is suspected.

## Output
Classification, evidence (quote the key log line briefly), most likely cause, and the next action for the tester. If it is a product bug, offer the `bug-report` skill.
