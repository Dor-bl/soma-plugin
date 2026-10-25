# Engine: Google Artemis (optional)

Server: [Google Artemis](https://github.com/google/artemis) MCP server. Not bundled with SOMA: the tester installs it with Artemis's own installer (`uv run artemis mcp --install claude`), which needs Python, `uv`, ADB and an LLM API key. Available only when its `mobile_*` tools appear in the tool list.

Platforms: **Android only**. Artemis runs its own agent: it receives a goal in plain language and decides the taps itself.

## Operations

| Operation | Tool |
|-----------|------|
| Check the environment | `mobile_diagnose` (verdict `ready` / `degraded` / `blocked`) |
| Perform a goal or step | `mobile_run_task` (optional `device_serial`; runs in the background) |
| Poll, stop or steer a task | `mobile_manage_task` |
| Read the screen | `mobile_get_device_state` (screenshot, or OCR plus XML hierarchy) |
| Evidence of what it did | `mobile_inspect_trace` (actions, reasoning, device) |

## Using it for QA
- Artemis works around obstacles to reach a goal. A workaround can hide a bug, so for step-by-step verification send **one test step per `mobile_run_task`**, tell it not to take alternative paths, wait for the task to finish, then verify the expected result yourself with `mobile_get_device_state`.
- Check the trace with `mobile_inspect_trace` before marking a step PASS. If it took a different path than the step describes, mark the step FAIL and say what it did instead.
- Never run Artemis and Appium against the same device at the same time. Close the Appium session first.
- There is no remote server option: `remote_server_url` does not apply.
