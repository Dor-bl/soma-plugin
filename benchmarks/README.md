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

Pass or fail is decided from the device state (or the reply, for the read-only task), never from the agent saying it worked. A cheaper run that failed is not a saving, so the table always shows passes next to tokens. Each run starts from a reset state with Settings force-stopped (its data kept) and the Home screen, and the checks compare exact values. A run also counts as a pass only if at least one `appium-mcp` tool call succeeded: with Bash allowed, an agent could change the setting through `adb` directly and skip the UI work being measured. Such runs count as failures and show as `no Appium` in the Passed column.

## Running it

You need Node 22+, the `claude` CLI (logged in), `adb`, and exactly one running Android emulator. The emulator must have **Screen lock set to None**: a PIN or password locks it once the screen sleeps, and every later run then fails at the lock screen. The runner keeps the screen on (`svc power stayon true`) and stops with a message if a lock screen is showing. A credential that is merely unlocked is not "None": the device re-locks if the screen sleeps. Check with `adb shell dumpsys lock_settings | grep CredentialType` (must say `None`) and `adb shell dumpsys user | grep State` (`RUNNING_LOCKED` means a credential is set and not entered); `locksettings get-disabled` throws on any credential-protected device. Pin the image so results can be compared: record the system image and API level next to any numbers you publish. On a high-resolution AVD (1440x3120 at 560 dpi, for example) the screenshot tool's result is too large for the agent to read, so visual checks fall back to page source in both arms; a lower-resolution AVD gives the agent more to work with.

```bash
node scripts/benchmark.mjs --dry-run             # print the prompts and run count, no model calls
node scripts/benchmark.mjs --runs 3              # 3 tasks x 2 arms x 3 runs = 18 runs
node scripts/benchmark.mjs --tasks dark-theme --runs 1 --model <model-id>
node scripts/benchmark.mjs --runs 1 --keep-streams  # also save each run's raw stream-json
```

Install `appium-mcp` first, or the first runs fail with `CONNECT_TIMEOUT` before any tool is available (the install is about 370 MB and takes minutes): `CLAUDE_PLUGIN_DATA=$PWD/.runtime node scripts/mcp-smoke.mjs`. The runner uses `.runtime/` unless `CLAUDE_PLUGIN_DATA` is set, and gives `claude` a 120 s `MCP_TIMEOUT`. A run in which the server never answered a tool call cannot pass, so a missing server shows up as failures marked `no Appium`.

This spends model calls and takes a while. Runs alternate between arms, so drift hits both alike. Results land in `benchmarks/results/<timestamp>.json` (every run, with the reply) and `.md` (the summary table).

With `--keep-streams`, each run's raw `stream-json` is also saved to `benchmarks/results/<timestamp>/<task>-<arm>-<run>.jsonl`, and the run's `stream` field in the JSON names that file (relative to the results folder). Use it to read tool-result errors after the fact, such as a denied read of a saved page-source file. A stream holds every tool result in full (page source, screenshot paths, on-screen text), so it can be large: the folders are git-ignored, and review one before sharing it.

## Reading the table

- **Total tokens** is input + cache reads + cache writes + output over the whole session. Cache reads are most of it in a long session and are billed far below fresh input, so also look at **Cost (USD)**.
- Values are medians over the runs, with the min–max range for tokens. The model is not deterministic; with 3 runs treat differences under about 15% as noise.
- **vs plain** is the median total tokens against the plain arm, per task.
- **Context per turn** is cache reads divided by turns, per run: roughly how much context each turn re-reads. Cost is about this times **Turns**, so the two columns show which of the two a change moved.
- **Bash calls** counts shell tool calls. The plain arm may use Bash as a fallback (sideloading APKs, reading files) that a tester without a shell does not have.
- Skills add prompt text, so any saving has to come from fewer wasted tool calls and less device-server output. The result may be neutral or higher; publish what it shows.

## Results

Baseline, 2026-11-07. Android 13 (API 33) `google_apis` x86_64 system image, Pixel 6 Pro profile (1440x3120, 560 dpi, SwiftShader), emulator 34.2.13; `appium-mcp` 1.97.1; Claude Code CLI 2.1.319, model `claude-sonnet-5-5`; 3 runs per task and arm; 18 of 18 runs passed, every run with successful `appium-mcp` calls. Raw data: [`results/2026-11-07T17-21-43-593Z.json`](results/2026-11-07T17-21-43-593Z.json).

| Task | Arm | Passed | Total tokens (median, range) | vs plain | Output tokens | Tool calls | Cost (USD) | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dark-theme | plain | 3/3 | 574,873 (567,171–973,694) | – | 2,515 | 20 | 0.16 | 125 |
| dark-theme | soma | 3/3 | 1,002,378 (715,532–1,027,696) | 74% | 2,998 | 23 | 0.26 | 77 |
| screen-timeout | plain | 3/3 | 584,996 (561,835–682,874) | – | 2,557 | 20 | 0.17 | 64 |
| screen-timeout | soma | 3/3 | 615,631 (538,001–1,110,528) | 5% | 2,911 | 19 | 0.19 | 70 |
| read-android-version | plain | 3/3 | 381,206 (312,703–381,292) | – | 1,329 | 11 | 0.12 | 96 |
| read-android-version | soma | 3/3 | 376,454 (373,874–617,744) | -1% | 1,880 | 12 | 0.16 | 77 |

Whole run: 31.7 minutes, USD 1.41 for the plain arm and USD 1.87 for the SOMA arm. Reading: two tasks are within the noise band (+5%, -1%); on `dark-theme` SOMA used more tokens (two of three runs near 1.0M against two plain runs near 570k) while finishing faster (77 s against 125 s median). Cost was slightly higher for SOMA on every task, as expected from the added prompt text. Caveats: with 3 runs the ranges overlap heavily, and on this AVD screenshots were unreadable for both arms (see above), so both relied on page source. The very first run (`dark-theme`, plain, 973,694 tokens) also paid for a one-off workaround: the checkout sat in a long temp path, so Appium's push of its UiAutomator2 APKs failed on Windows' 260-character path limit and the agent installed them by hand through `adb`; later runs found them installed. Run the benchmark from a short path (or set `CLAUDE_PLUGIN_DATA` to one) to avoid this. Two runs reported they could not read the saved page-source file and worked from element attributes instead.

### Rerun, 2026-11-13

Same AVD, image, emulator, `appium-mcp` 1.97.1, CLI 2.1.319 and model `claude-sonnet-5-5` as the baseline; 3 runs per task and arm; 18 of 18 runs passed, every run with successful `appium-mcp` calls and no Bash calls. Raw data: [`results/2026-11-13T22-31-52-758Z.json`](results/2026-11-13T22-31-52-758Z.json). Changes since the baseline: the phase 2 skill fixes (#58), `run-manual-test` with the Appium tools inline and no backend file reads (#65), and smaller skill changes that do not touch this path (#70, #73 to #75). #58 also changed the harness for **both** arms: it sets `NO_UI=1` and saves screenshots and page source in the run's folder, so screenshots are now readable. Compare the gap between the arms, not the absolute numbers against the baseline.

| Task | Arm | Passed | Total tokens (median, range) | vs plain | Context per turn | Turns | Output tokens | Tool calls | Bash calls | Cost (USD) | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dark-theme | plain | 3/3 | 900,850 (808,461–1,161,223) | – | 39,723 | 22 | 2,304 | 20 | 0 | 0.21 | 57 |
| dark-theme | soma | 3/3 | 886,469 (832,277–973,691) | -2% | 36,491 | 24 | 2,720 | 22 | 0 | 0.22 | 57 |
| screen-timeout | plain | 3/3 | 598,344 (580,565–678,891) | – | 34,510 | 19 | 1,755 | 16 | 0 | 0.17 | 44 |
| screen-timeout | soma | 3/3 | 816,708 (763,229–876,150) | 36% | 37,298 | 21 | 2,662 | 19 | 0 | 0.21 | 63 |
| read-android-version | plain | 3/3 | 436,621 (396,682–758,081) | – | 42,006 | 10 | 1,184 | 9 | 0 | 0.11 | 65 |
| read-android-version | soma | 3/3 | 588,793 (496,575–590,167) | 35% | 37,748 | 14 | 1,839 | 12 | 0 | 0.16 | 69 |

Per run, averaged over all nine runs of each arm, against the baseline (its context per turn and turns recomputed from its JSON):

| | Baseline plain | Baseline SOMA | Rerun plain | Rerun SOMA |
| --- | --- | --- | --- | --- |
| Cost (USD) | 0.156 | 0.207 (+33%) | 0.179 | 0.198 (+11%) |
| Total tokens | 558k | 709k (+27%) | 702k | 758k (+8%) |
| Turns | 18.7 | 21.7 | 17.8 | 19.4 |
| Context per turn | 28.7k | 31.3k | 38.1k | 37.6k |

Whole run: 24.3 minutes, USD 1.61 for the plain arm and USD 1.78 for the SOMA arm. Reading:

- The SOMA overhead shrank from +33% to +11% in cost and from +27% to +8% in tokens, but mostly because the plain arm got more expensive (0.156 to 0.179 USD per run). The SOMA arm itself is flat (0.207 to 0.198 USD, within noise).
- Why plain grew: with `NO_UI` the screenshots are readable, and the plain arm now looks at them. Over nine runs it read 16 screenshots and fetched page source 10 times, against 7 and 5 for SOMA. Tool results added up to 3.7 MB of text for plain and 0.9 MB for SOMA. The skill's "find the element, screenshot once per visual check" guidance is doing what it should.
- What still costs SOMA: fixed prompt text. In the streams, a SOMA session sits at about 50k tokens of context after setup against about 44k for plain. The `run-manual-test` skill (12.1 KB, up from 9.2 KB at the baseline after #58 and #65) and the command are re-read on every turn, and SOMA runs take 1.6 more turns (one is the explicit session cleanup). On tasks of 10 to 20 turns, that outweighs the savings in device output. Trimming the hot path (#55) is the lever left.
- Per task, `dark-theme` went from +74% to -2%, while `screen-timeout` (+5% to +36%) and `read-android-version` (-1% to +35%) went the other way. With 3 runs and overlapping ranges, read the per-task rows as noise and use the nine-run averages above.
