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

## The README chart

The chart near the top of the main README is drawn from one results file by `scripts/benchmark-chart.mjs`: per-arm means of context per turn, total tokens, cost and wall time, SOMA as a percentage of plain, and every run's pass or fail. To show a new run, set `results` in [`assets/benchmark-chart.json`](../assets/benchmark-chart.json) to its JSON (and `note` to a short reason for any plain failures, or leave it empty), run `node scripts/benchmark-chart.mjs`, and update the README's alt text and link to match. CI fails if the committed SVGs do not match the config. The script refuses a results file with a task short of its runs in either arm, a run with a missing measurement, or more than 56 runs per arm (one tile per run no longer fits). Publish only a run that has its own section here, with 3 or more runs per arm.

## Reading the table

- **Total tokens** is input + cache reads + cache writes + output over the whole session. Cache reads are most of it in a long session and are billed far below fresh input, so also look at **Cost (USD)**.
- A SOMA run hands the test to the `device-runner` subagent, which runs in the background, so its stream has two result events: the hand-off turn, then the rest of the session. Tokens and cost come from the last one's session-wide `modelUsage` and `total_cost_usd`, the reply from the last one, and **Turns** and **Time** are summed over both.
- Values are medians over the runs, with the min–max range for tokens. The model is not deterministic; with 3 runs treat differences under about 15% as noise.
- **vs plain** is the median total tokens against the plain arm, per task.
- **Context per turn** is cache reads divided by turns, per run: roughly how much context each turn re-reads. Cost is about this times **Turns**, so the two columns show which of the two a change moved.
- **Bash calls** counts shell tool calls. The plain arm may use Bash as a fallback (sideloading APKs, reading files) that a tester without a shell does not have.
- Skills add prompt text, so any saving has to come from fewer wasted tool calls and less device-server output. The result may be neutral or higher; publish what it shows.

## AndroidWorld suite

The Settings tasks are short enough that both arms pass every run, so they compare cost but not success. `--suite androidworld` runs harder tasks in real apps instead, taken from [AndroidWorld](https://github.com/google-research/android_world) (Google Research, Apache-2.0): it sets each task up with random parameters (a contact name, an expense amount, an event time), and its own check reads the app's database or files afterwards to decide pass or fail. The same two arms and the same "no Appium, no pass" rule apply.

The tasks are in [`androidworld/tasks.json`](androidworld/tasks.json), with the AndroidWorld commit they were picked from. All sixteen are checked from app data, not from what is on screen, so a run that closes the app at the end is judged the same as one that leaves it open. The first ten were picked for a first look; the last six are harder (complexity 3.4 to 7.8, two of them across two apps, one reading recipes from an image):

| Task | App | Complexity |
| --- | --- | --- |
| `SystemWifiTurnOff` | Settings | 1 |
| `MarkorCreateFolder` | Markor | 1 |
| `ContactsAddContact` | Contacts | 1.2 |
| `ExpenseAddSingle` | Pro Expense | 1.2 |
| `SimpleCalendarDeleteOneEvent` | Simple Calendar Pro | 1.2 |
| `MarkorCreateNote` | Markor | 1.6 |
| `TurnOffWifiAndTurnOnBluetooth` | Settings | 2 |
| `RecipeAddSingleRecipe` | Broccoli | 2.4 |
| `SimpleCalendarAddOneEvent` | Simple Calendar Pro | 3.4 |
| `ExpenseAddMultiple` | Pro Expense | 6 |
| `SimpleCalendarAddRepeatingEvent` | Simple Calendar Pro | 3.4 |
| `RecipeDeleteMultipleRecipesWithConstraint` | Broccoli | 4 |
| `VlcCreateTwoPlaylists` | VLC | 4.8 |
| `ExpenseAddMultipleFromMarkor` | Pro Expense, Markor | 6 |
| `RecipeAddMultipleRecipesFromImage` | Broccoli, Simple Gallery Pro | 6 |
| `MarkorMergeNotes` | Markor | 7.8 |

Complexity is AndroidWorld's own estimate; it sets a step budget of ten steps per point for its agents. This harness has no step budget, only `--timeout-min`.

How a run works: [`androidworld/referee.py`](androidworld/referee.py) connects to the emulator, sets the task up and writes its goal; the harness sends that goal as the task text to the arm; when the session ends, the referee runs AndroidWorld's check and writes the result. Both arms of a run get the same task: the first arm's referee generates the parameters (seeded with the run number) and saves them, and the other arm's referee loads them, because some tasks put the clock into their parameters (`MarkorCreateFolder` names its folder after the current time), so a seed alone does not repeat them. Each run gets new parameters. The referee waits ten minutes longer than `--timeout-min`; if the session has not ended by then, the run is recorded as not checked, never checked mid-run. The referee's folder is outside the session's workspace, so the agent cannot end the wait early. A task that cannot be set up stops the benchmark, and a check that raises an error is recorded in `checkError` and not counted as a pass. The results JSON records the suite, the AndroidWorld commit, and each run's seed, complexity and goal, so the arms' goals can be compared.

### Setting it up

AndroidWorld changes the emulator: it installs about 20 apps and sets the clock to October 2023 on every task. Use an emulator kept for it, never your everyday one. The harness refuses to run the suite on an emulator without AndroidWorld's accessibility forwarder.

1. Clone AndroidWorld at the commit in `androidworld/tasks.json`, and install it into a Python 3.11+ virtual environment as its README says (`pip install -r requirements.txt`, then `pip install -e .`). The referee checks the installed copy before every task and refuses another commit, local changes to tracked files, or an install it cannot trace to a git checkout: the goals and checks come from that code, so a different copy would run different tasks under the same names.
2. Create an AVD: Pixel 6, API 33 (Android 13) `google_apis` x86_64, with at least 4 GB RAM and an 8 GB data partition (the default 800 MB is too small for the apps). Set Screen lock to None, as above.
3. Start it with the gRPC port AndroidWorld talks to: `emulator -avd <name> -no-snapshot -grpc 8554`. On a machine whose GPU driver crashes the emulator, add `-gpu swiftshader_indirect`.
4. Once per emulator, install the apps: `<venv python> benchmarks/androidworld/setup_device.py --adb <full path to adb>`. It downloads the APKs from AndroidWorld's storage bucket and takes several minutes.
5. Open each app in the task list once and get past its first-run and permission screens, so neither arm meets them first. The prompt also tells both arms they may allow or dismiss such a screen.

AndroidWorld's Retro Music tasks build MP3 files during setup and need `ffmpeg` on the path (`pydub` calls it); none is in the list, so the suite runs without it.

[`androidworld/aw_compat.py`](androidworld/aw_compat.py) applies three workarounds whenever the referee or the setup runs. On Windows with Python 3.11, `android_env` cannot install the accessibility forwarder, because `adb` cannot open the temporary APK file; this is fixed upstream in [google-deepmind/android_env#449](https://github.com/google-deepmind/android_env/pull/449), and Python 3.12 is reported to avoid it (not tested here). On a software-rendered emulator, AndroidWorld's 30-second `adb install` limit is too short for its larger APKs, and one timeout stops the whole setup; the limit is raised to 300 seconds. And `android_env` downloads the accessibility forwarder APK every time a referee starts, so each run depended on the network and a transient error there (WinError 10055 on Windows) stopped the benchmark; it is downloaded once, with retries, and kept in `~/.cache/soma-androidworld/`.

### Running the suite

```bash
node scripts/benchmark.mjs --suite androidworld --dry-run
node scripts/benchmark.mjs --suite androidworld --aw-python <venv python> --runs 3
```

`ANDROID_WORLD_PYTHON` can stand in for `--aw-python`. Everything else is as for the Settings suite: one emulator, the warmed `appium-mcp` install, the same output files.

Reading it: the goal is a single sentence such as "Create a new contact for Ali Wang. Their number is +16790377420.", not a list of steps, while `run-manual-test` is written for test cases with steps. A SOMA failure on a vague goal says something about that fit, not only about the device work. Report passes per task and complexity next to the token columns.

### First look: one run per task, 2026-11-19

Pixel 6 AVD (1080x2400, 420 dpi), Android 13 (API 33) `google_apis` x86_64, SwiftShader, emulator 34.2.13; AndroidWorld at the commit in `tasks.json`; `appium-mcp` 1.97.1, CLI 2.1.319, model `claude-sonnet-5-5`; one run per task and arm (seed 1). Raw data: [`results/2026-11-19T08-33-16-863Z.json`](results/2026-11-19T08-33-16-863Z.json) (`SystemWifiTurnOff`) and [`results/2026-11-19T08-39-04-300Z.json`](results/2026-11-19T08-39-04-300Z.json) (the other nine); the run was split when the checkout it ran from changed under it. In every SOMA run, all Appium calls came from `device-runner`. The **Time** column here stopped after AndroidWorld's check and the cleanup, before the clock fix in #98, so it is not comparable with later runs. Parameters were not yet shared between the arms: `MarkorCreateFolder` gave each arm a different folder name (the same kind of task, not the identical one); the other nine tasks take theirs from the seed alone.

| Task | Arm | Passed | Total tokens (median, range) | vs plain | Context per turn | Turns | Output tokens | Tool calls | Bash calls | Cost (USD) | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SystemWifiTurnOff | plain | 1/1 | 744,435 (744,435–744,435) | – | 44,330 | 16 | 1,930 | 15 | 0 | 0.22 | 108 |
| SystemWifiTurnOff | soma | 1/1 | 375,850 (375,850–375,850) | -50% | 18,714 | 18 | 3,289 | 18 | 0 | 0.18 | 91 |
| MarkorCreateFolder | plain | 1/1 | 856,971 (856,971–856,971) | – | 45,810 | 18 | 1,864 | 17 | 0 | 0.22 | 67 |
| MarkorCreateFolder | soma | 1/1 | 547,043 (547,043–547,043) | -36% | 24,189 | 21 | 3,740 | 22 | 0 | 0.20 | 76 |
| ContactsAddContact | plain | 1/1 | 1,319,578 (1,319,578–1,319,578) | – | 42,793 | 30 | 3,832 | 29 | 0 | 0.29 | 108 |
| ContactsAddContact | soma | 1/1 | 642,691 (642,691–642,691) | -51% | 24,888 | 24 | 4,452 | 27 | 0 | 0.23 | 95 |
| ExpenseAddSingle | plain | 1/1 | 1,048,685 (1,048,685–1,048,685) | – | 38,607 | 26 | 2,945 | 25 | 0 | 0.30 | 85 |
| ExpenseAddSingle | soma | 1/1 | 908,763 (908,763–908,763) | -13% | 29,517 | 29 | 5,248 | 33 | 0 | 0.29 | 103 |
| SimpleCalendarDeleteOneEvent | plain | 1/1 | 1,431,842 (1,431,842–1,431,842) | – | 55,353 | 25 | 2,457 | 24 | 0 | 0.35 | 76 |
| SimpleCalendarDeleteOneEvent | soma | 1/1 | 1,035,222 (1,035,222–1,035,222) | -28% | 21,158 | 46 | 9,068 | 46 | 0 | 0.35 | 144 |
| MarkorCreateNote | plain | 1/1 | 1,277,814 (1,277,814–1,277,814) | – | 44,226 | 28 | 2,992 | 27 | 0 | 0.30 | 84 |
| MarkorCreateNote | soma | 1/1 | 954,846 (954,846–954,846) | -25% | 30,001 | 30 | 5,963 | 34 | 0 | 0.30 | 112 |
| TurnOffWifiAndTurnOnBluetooth | plain | 1/1 | 2,071,522 (2,071,522–2,071,522) | – | 50,618 | 40 | 5,473 | 39 | 0 | 0.42 | 170 |
| TurnOffWifiAndTurnOnBluetooth | soma | 1/1 | 1,142,609 (1,142,609–1,142,609) | -45% | 31,039 | 35 | 5,599 | 36 | 0 | 0.32 | 124 |
| RecipeAddSingleRecipe | plain | 1/1 | 1,544,801 (1,544,801–1,544,801) | – | 32,653 | 46 | 4,621 | 45 | 0 | 0.35 | 211 |
| RecipeAddSingleRecipe | soma | 1/1 | 528,950 (528,950–528,950) | -66% | 20,806 | 23 | 5,791 | 31 | 0 | 0.25 | 118 |
| SimpleCalendarAddOneEvent | plain | 1/1 | 3,793,981 (3,793,981–3,793,981) | – | 58,877 | 63 | 6,272 | 62 | 0 | 0.75 | 160 |
| SimpleCalendarAddOneEvent | soma | 1/1 | 1,702,729 (1,702,729–1,702,729) | -55% | 33,070 | 49 | 8,425 | 58 | 0 | 0.46 | 140 |
| ExpenseAddMultiple | plain | 1/1 | 1,838,120 (1,838,120–1,838,120) | – | 30,391 | 59 | 6,618 | 58 | 1 | 0.40 | 132 |
| ExpenseAddMultiple | soma | 1/1 | 1,286,450 (1,286,450–1,286,450) | -30% | 33,092 | 37 | 8,490 | 62 | 0 | 0.37 | 138 |

| Ten tasks, one run each | Plain | SOMA |
| --- | --- | --- |
| Passed | 10/10 | 10/10 |
| Mean total tokens per run | 1.59M | 0.91M (-43%) |
| Cost (USD, all ten runs) | 3.60 | 2.96 (-18%) |

Reading: both arms passed every task, so these ten do not separate the arms on success either. SOMA used fewer tokens on every task (-13% to -66%) and cost less on eight of ten (the other two within 3%); unlike the Settings tasks, the saving shows in cost too, because these sessions run longer, so the plain session re-reads more device output per turn (its context per turn grows to 30k to 59k, while `device-runner` stays at 19k to 33k). One run each is a first look, not a result: rerun with `--runs 3` before quoting a number, and add harder tasks (complexity 3 and up, several apps) to test whether either arm passes more often. The plain arm made one Bash call (`ExpenseAddMultiple`) and still made its change through Appium.

### Harder tasks: one run per task, 2026-11-19

Same setup as the first look, after the parameter-sharing and reseeding fixes: both arms got the identical goal on every task. Raw data: [`results/2026-11-19T14-54-52-785Z.json`](results/2026-11-19T14-54-52-785Z.json). 55.7 minutes; USD 5.47 for the plain arm, USD 0.90 for the SOMA arm.

| Task | Arm | Passed | Total tokens (median, range) | vs plain | Context per turn | Turns | Output tokens | Tool calls | Bash calls | Cost (USD) | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SimpleCalendarAddRepeatingEvent | plain | 1/1 | 5,720,527 (5,720,527–5,720,527) | – | 65,943 | 85 | 7,838 | 84 | 0 | 1.07 | 386 |
| SimpleCalendarAddRepeatingEvent | soma | 0/1 | 225,004 (225,004–225,004) | -96% | 23,783 | 8 | 2,049 | 4 | 0 | 0.15 | 90 |
| RecipeDeleteMultipleRecipesWithConstraint | plain | 1/1 | 11,146,939 (11,146,939–11,146,939) | – | 64,167 | 172 | 21,293 | 171 | 0 | 1.67 | 679 |
| RecipeDeleteMultipleRecipesWithConstraint | soma | 0/1 | 223,527 (223,527–223,527) | -98% | 23,637 | 8 | 2,054 | 4 | 0 | 0.15 | 92 |
| VlcCreateTwoPlaylists | plain | 1/1 | 4,848,021 (4,848,021–4,848,021) | – | 49,864 | 96 | 11,070 | 95 | 0 | 0.79 | 463 |
| VlcCreateTwoPlaylists | soma | 0/1 | 224,792 (224,792–224,792) | -95% | 23,761 | 8 | 2,053 | 4 | 0 | 0.15 | 93 |
| ExpenseAddMultipleFromMarkor | plain | 0/1 | 3,265,469 (3,265,469–3,265,469) | – | 41,619 | 77 | 9,094 | 76 | 0 | 0.62 | 260 |
| ExpenseAddMultipleFromMarkor | soma | 0/1 | 223,921 (223,921–223,921) | -93% | 23,675 | 8 | 2,108 | 4 | 0 | 0.15 | 95 |
| RecipeAddMultipleRecipesFromImage | plain | 1/1 | 5,102,425 (5,102,425–5,102,425) | – | 38,635 | 130 | 15,040 | 129 | 0 | 0.91 | 465 |
| RecipeAddMultipleRecipesFromImage | soma | 0/1 | 224,696 (224,696–224,696) | -96% | 23,716 | 8 | 2,271 | 4 | 0 | 0.15 | 95 |
| MarkorMergeNotes | plain | 0/1 | 2,151,799 (2,151,799–2,151,799) | – | 45,886 | 46 | 6,504 | 45 | 5 | 0.41 | 514 |
| MarkorMergeNotes | soma | 0/1 | 224,037 (224,037–224,037) | -90% | 23,692 | 8 | 2,126 | 4 | 0 | 0.15 | 113 |

Reading: **this run does not compare the arms on the device work**, because the SOMA arm never got a session. Every SOMA run stopped at the first step: `appium_session_management` failed with "The instrumentation process cannot be initialized within 30000ms timeout", and `device-runner` reported BLOCKED without retrying, as `run-manual-test` tells it to (a session error needs the tester's decision, and `claude -p` has no tester to ask). The plain arm hit the same error on its first try in five of the six tasks, then created the session again with a longer `appium:uiautomator2ServerLaunchTimeout`, and went on. These setups keep the software-rendered emulator busy (AndroidWorld writes databases, images and videos right before the session), so UiAutomator2 takes longer than its 30-second default to start. The first look's lighter setups did not hit it.

What the run does show:

- A SOMA weakness on slow devices: the plain session recovers from a slow UiAutomator2 start by itself, SOMA stops and asks. With a tester present that costs one reply; unattended it fails the run. A default launch timeout for emulators, or one automatic retry with a longer one, would close it.
- The plain arm passed 4 of 6, using 2.2M to 11.1M tokens and USD 0.41 to 1.67 per task. Both failures were wrong claims that AndroidWorld's check caught: on `ExpenseAddMultipleFromMarkor` it reported logging the two reimbursable transactions, and on `MarkorMergeNotes` it reported a saved, read-back note. The blank lines it put between the notes are what the check expects. By its reply, though, it saved the note as `bH6xnAbn.txt`, while the check looks for a file named exactly `bH6xnAbn`. That is the likely cause, but the device state was not kept, so it is not confirmed.
- Rerun these six once the SOMA arm can start a session on this emulator.

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
| Context per turn (mean of each run's cache reads / turns) | 28.8k | 30.3k | 38.1k | 37.7k |

Whole run: 24.3 minutes, USD 1.61 for the plain arm and USD 1.78 for the SOMA arm. Reading:

- The SOMA overhead shrank from +33% to +11% in cost and from +27% to +8% in tokens, but mostly because the plain arm got more expensive (0.156 to 0.179 USD per run). The SOMA arm itself is flat (0.207 to 0.198 USD, within noise).
- Why plain grew: with `NO_UI` the screenshots are readable, and the plain arm now looks at them. Over nine runs it read 16 screenshots and fetched page source 10 times, against 7 and 5 for SOMA. Tool results added up to 3.7 MB of text for plain and 0.9 MB for SOMA. The skill's "find the element, screenshot once per visual check" guidance is doing what it should.
- What still costs SOMA: fixed prompt text. In the streams, a SOMA session sits at about 50k tokens of context after setup against about 44k for plain. The `run-manual-test` skill (12.1 KB, up from 9.2 KB at the baseline after #58 and #65) and the command are re-read on every turn, and SOMA runs take 1.6 more turns (one is the explicit session cleanup). On tasks of 10 to 20 turns, that outweighs the savings in device output. Trimming the hot path (#55) is the lever left.
- Per task, `dark-theme` went from +74% to -2%, while `screen-timeout` (+5% to +36%) and `read-android-version` (-1% to +35%) went the other way. `dark-theme` and `read-android-version` have overlapping ranges between the arms, so with 3 runs read those as noise. `screen-timeout` does not overlap (plain 580,565–678,891, SOMA 763,229–876,150): SOMA used more tokens on every run of it, which the nine-run average hides. Three runs are too few to call that settled; rerun with more runs before acting on it.

### Rerun after device-runner, 2026-11-19

Same AVD, image, emulator, `appium-mcp` 1.97.1, CLI 2.1.319 and model `claude-sonnet-5-5` as the earlier runs; 3 runs per task and arm; 17 of 18 runs passed, every run with successful `appium-mcp` calls and no Bash calls. Raw data: [`results/2026-11-19T08-03-16-114Z.json`](results/2026-11-19T08-03-16-114Z.json).

The change since the 2026-11-13 rerun is the `device-runner` subagent (#83): `run-manual-test` now hands the confirmed run to it, and it works in the background in its own context. Measuring it needed three harness fixes, so compare the arms within this run, not the absolute numbers against earlier ones:

- A SOMA stream has two result events (the hand-off, then the session's end), and only the first was read (#95).
- `device-runner` lists its tools under the plugin's server name (`mcp__plugin_soma_appium-mcp__*`), and the harness loaded the server as `appium-mcp`, so the agent had no tools, returned BLOCKED, and the main session ran the test itself. A first attempt at this rerun measured that fallback and was discarded. Both arms now load the server as `plugin_soma_appium-mcp`; in all nine SOMA runs every Appium call came from `device-runner`, none from the main session.
- The agent's turns are not in `num_turns`, and its working time is in no result event. **Turns** now adds the agent's turns, and **Time** is each run's wall-clock time in both arms. In this run the clock stopped only after the harness's cleanup and device check, the same work in both arms; later runs stop it when the session ends.

| Task | Arm | Passed | Total tokens (median, range) | vs plain | Context per turn | Turns | Output tokens | Tool calls | Bash calls | Cost (USD) | Time (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dark-theme | plain | 2/3 | 909,968 (878,751–1,158,764) | – | 38,394 | 26 | 2,677 | 23 | 0 | 0.24 | 73 |
| dark-theme | soma | 3/3 | 395,626 (384,741–412,807) | -57% | 18,994 | 19 | 3,649 | 18 | 0 | 0.16 | 81 |
| screen-timeout | plain | 3/3 | 640,736 (538,113–643,508) | – | 35,761 | 17 | 1,827 | 15 | 0 | 0.17 | 62 |
| screen-timeout | soma | 3/3 | 444,461 (410,122–489,349) | -31% | 19,041 | 21 | 3,912 | 21 | 0 | 0.19 | 82 |
| read-android-version | plain | 3/3 | 452,882 (395,784–485,478) | – | 42,301 | 10 | 1,251 | 9 | 0 | 0.12 | 78 |
| read-android-version | soma | 3/3 | 359,484 (355,292–418,610) | -21% | 19,543 | 17 | 2,870 | 15 | 0 | 0.15 | 95 |

Per run, averaged over all nine runs of each arm:

| | Plain | SOMA |
| --- | --- | --- |
| Total tokens | 678k | 408k (-40%) |
| Cache reads | 652k | 374k (-43%) |
| Cache writes | 24.4k | 30.0k (+23%) |
| Output tokens | 1.9k | 3.5k (+85%) |
| Cost (USD) | 0.182 | 0.176 (-3%) |
| Wall time (s) | 76 | 86 |

Whole run: 24.3 minutes, USD 1.64 for the plain arm and USD 1.58 for the SOMA arm. Reading:

- SOMA now uses fewer tokens than plain on every task, and the ranges do not overlap on `dark-theme` or `screen-timeout`. The device work happens in `device-runner`'s own context of about 19k tokens per turn, against about 38k in the plain session, which carries every screenshot and page source to the end.
- Cost is about even. Cache reads are the bulk of the tokens and the cheapest kind; SOMA pays for a second context's cache writes and for more output (the per-step report and its summary), which are priced higher. Fewer tokens is not lower cost here.
- SOMA takes about 10 s longer per run, the hand-off and the report back.
- The one failure is the plain arm's third `dark-theme` run, as in the discarded attempt: it replied that dark theme was on ("the screen is dark in the final screenshot"), while `cmd uimode night` said it was off. The device check caught a wrong claim.
