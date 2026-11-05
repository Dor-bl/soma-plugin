---
name: setup-artemis
description: Guide the tester through installing the optional Google Artemis engine for this project only (clone a pinned commit, uv sync, API key, local MCP registration), with their consent for each machine change. Use when check-setup reports Artemis MISSING or the tester asks to install or set up Artemis.
---

# Set up Google Artemis (optional engine)

Artemis is Android only and runs on the tester's machine, so a remote Appium server does not matter here (`${user_config.remote_server_url}` is not used). Read `${CLAUDE_PLUGIN_ROOT}/backends/artemis.md` first: it explains what Artemis changes on a device and why its own installers are not used.

Every step below changes the tester's machine. Explain what a step does and get a yes before running it. Skip steps already done (check first, read-only). Never use `start.bat` / `start.sh`, `artemis init`, `artemis mcp --install` or `uv tool install`: they write config and rules into every AI client on the machine.

## 0. Prerequisites (read-only, report each as OK / MISSING)
- `git --version`, `uv --version` (install guide: `https://docs.astral.sh/uv/`; offer it, do not run a piped installer), `adb version`. `uv` fetches Python 3.12 itself, so no system Python is needed.
- Ask where to clone Artemis (suggest a folder outside the SOMA project, e.g. a `tools` folder next to it) and use that folder as `<artemis>` below. If it already holds an Artemis clone, ask whether to reuse it.

## 1. In the Artemis folder (do all of these before changing folders)
1. Clone: `git clone https://github.com/google/artemis.git <artemis>`. Then pin the tested commit: `git -C <artemis> checkout 351ca8422f7b5b54e80a9c1ce03a222e02415b6b`. Newer commits are untested with SOMA; if the tester wants newer, say so and let them decide.
2. Install: `uv sync --python 3.12` with `<artemis>` as the working directory. It creates `.venv` there; nothing outside the folder changes.
3. Create the config file: copy `.env.example` to `.env` if `.env` does not exist.
4. **The tester adds the LLM API key themselves.** Tell them to open `<artemis>/.env` and fill in one key. Never ask for the key, never open or print `.env`. To check it is set without showing it, run `uv run python -c "import dotenv,os;v=dotenv.dotenv_values('.env');print([k for k in v if k.endswith('_KEY') and v[k]])"` and report only the names of the filled keys.
   - Artemis's default config uses provider `google` for every node, and its Flash mode needs a Gemini model for screen grounding. A non-Gemini key alone makes tasks fail. If the filled key is not `GEMINI_API_KEY` / `GOOGLE_API_KEY`, say so and that the tester must change the provider in Artemis's `config/artemis.jsonc` themselves.
   - Creating an AI Studio key can fail with "Failed to create project"; creating or reusing a Google Cloud project first is the usual workaround.
   - The free Gemini tier is slow and returns 503s and timeouts; tasks may stall (see "Do not trust `running`" in the Artemis backend file).
5. Recommend, and add only if the tester agrees, `ARTEMIS_HELPER_AUTO_INSTALL=false` to `.env` for shared or personal phones: Artemis then does not install its accessibility-service helper app unprompted. The tester can install it later with `uv run artemis helper install`.

## 2. Register for this project only (change to the SOMA project folder once)
1. Print the snippet, without writing anything: `uv run artemis mcp --generate-config claude`, run in `<artemis>` (this is the last command there). It shows `command` (the `.venv` Python), `args` (`-m mcp_server`), `cwd` and `env` with absolute paths.
2. Show the tester the exact registration command and run it only after their yes, from the SOMA project folder: `claude mcp add-json --scope local artemis '<the JSON for the artemis server from the snippet>'`. `--scope local` limits it to this project and this user. On Windows PowerShell, quote the JSON so the inner double quotes survive (single-quoted string, or a here-string).
3. Check it: `claude mcp get artemis`. Undo with `claude mcp remove artemis -s local`.
4. Tell the tester to restart Claude Code. The `mobile_*` tools only appear after a restart.

## 3. Verify (after the restart)
Run the Artemis part of the `check-setup` skill: `mobile_*` tools visible, key set, then `mobile_diagnose` in check-only mode. Report its verdict and fix list. Apply none of its fixes without the tester's yes.

## Output
A checklist of what was done, skipped or still open (for example "key not set yet", "restart pending"), the pinned commit, and the one-line undo for each change. Remind the tester that Artemis sends screenshots and screen text to their LLM provider, so test devices and test accounts only. Do not start a test run here; the consent gate in the Artemis backend file applies before the first task.
