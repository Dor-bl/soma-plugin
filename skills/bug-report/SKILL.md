---
name: bug-report
description: Write a clear, reproducible mobile bug report from a failed test, observation or screenshot. Use when a tester wants to file or draft a bug.
---

# Write a bug report

## Collect (ask only for what is missing)
App name and build/version, platform and OS version, device or emulator model, environment (staging/prod), account type used, exact steps, expected vs actual, frequency, screenshots or logs.

## Template
**Title**: short, specific: what breaks, where.
**Environment**: app build, platform/OS, device, environment.
**Preconditions**: account state, data, settings.
**Steps to reproduce**: numbered, each a single action.
**Expected result**
**Actual result**
**Frequency**: e.g. 3/3 runs. Only state a number that was actually observed.
**Evidence**: screenshot and log references.
**Severity (suggested)**: crash/data loss, blocks a core flow, workaround exists, cosmetic. Mark it as a suggestion for the team to confirm.

## Rules
- Do not speculate about root cause in the report body. Put hypotheses in a separate "Notes" line labeled as unverified.
- Keep steps minimal: remove anything not needed to reproduce.
- Do not file or send the report anywhere unless the tester asks. Output the text for them to review.
