# Token benchmark

Does SOMA change how many tokens a mobile QA task costs, compared with plain Claude Code driving the same `appium-mcp` server? This folder holds the tasks and the method; `scripts/benchmark.mjs` runs them.

## What is compared

| Arm | Setup | Prompt |
| --- | --- | --- |
| `plain` | `appium-mcp` only, loaded from this repo's pinned launcher | the task as a bare prompt |
| `soma` | the same `appium-mcp`, plus the SOMA plugin (`--plugin-dir`) | `/soma:run-test android <task>` |

Both arms use `--strict-mcp-config`, so no other MCP server adds tool definitions to either side, and both allow the same tools. The only difference is what SOMA ships on top of the server: skills and commands. The tester's confirmation is given in the prompt in both arms, because `claude -p` cannot answer the skill's confirmation question.

## Target app

The stock Android **Settings** app (`com.android.settings`): nothing to build, sign or host, and it is on every emulator. The tasks are in [`tasks.json`](tasks.json):

| Task | What it does | Checked with |
| --- | --- | --- |
| `dark-theme` | Display, Dark theme on | `adb shell cmd uimode night` |
| `screen-timeout` | Display, Screen timeout 1 minute | `adb shell settings get system screen_off_timeout` |
| `read-android-version` | About phone, report the Android version | the reply contains `ro.build.version.release` |

Pass or fail is decided from the device state (or the reply, for the read-only task), never from the agent saying it worked. A cheaper run that failed is not a saving, so the table always shows passes next to tokens. Each run starts from a reset state and the Home screen.

## Running it

You need Node 22+, the `claude` CLI (logged in), `adb`, and exactly one running Android emulator. Pin the image so results can be compared: record the system image and API level next to any numbers you publish.

```bash
node scripts/benchmark.mjs --dry-run             # print the prompts and run count, no model calls
node scripts/benchmark.mjs --runs 3              # 3 tasks x 2 arms x 3 runs = 18 runs
node scripts/benchmark.mjs --tasks dark-theme --runs 1 --model <model-id>
```

Install `appium-mcp` first, or the first runs fail with `CONNECT_TIMEOUT` before any tool is available (the install is about 370 MB and takes minutes): `CLAUDE_PLUGIN_DATA=$PWD/.runtime node scripts/mcp-smoke.mjs`. The runner uses `.runtime/` unless `CLAUDE_PLUGIN_DATA` is set, and gives `claude` a 120 s `MCP_TIMEOUT`. A run that reports a missing server shows as failed with 0–1 tool calls.

This spends model calls and takes a while. Runs alternate between arms, so drift hits both alike. Results land in `benchmarks/results/<timestamp>.json` (every run, with the reply) and `.md` (the summary table).

## Reading the table

- **Total tokens** is input + cache reads + cache writes + output over the whole session. Cache reads are most of it in a long session and are billed far below fresh input, so also look at **Cost (USD)**.
- Values are medians over the runs, with the min–max range for tokens. The model is not deterministic; with 3 runs treat differences under about 15% as noise.
- **vs plain** is the median total tokens against the plain arm, per task.
- Skills add prompt text, so any saving has to come from fewer wasted tool calls and less device-server output. The result may be neutral or higher; publish what it shows.

## Results

None committed yet. After a run, copy the summary table here with the emulator image, API level, `appium-mcp` version, model and date.
