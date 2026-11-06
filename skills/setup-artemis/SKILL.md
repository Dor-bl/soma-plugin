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
1. Clone: `git clone https://github.com/google/artemis.git <artemis>`. Then pin the tested commit: `git -C <artemis> checkout 351ca8422f7b5b54e80a9c1ce03a222e02415b6b`. In a reused clone, first check the commit exists locally (`git -C <artemis> cat-file -e "351ca8422f7b5b54e80a9c1ce03a222e02415b6b^{commit}"`; keep the quotes, PowerShell otherwise mangles `^{commit}`); if it does not, ask the tester before running `git -C <artemis> fetch origin`, then check again and stop if it is still missing. If you reuse an existing clone, first run `git -C <artemis> status --short` (tracked changes only: ignore untracked `.env`, `.venv` and traces) and stop if tracked files are modified, because they change the tested content; let the tester decide. Newer commits are untested with SOMA; if the tester wants newer, say so and let them decide.
2. Install: `uv sync --python 3.12` with `<artemis>` as the working directory. It creates or updates `.venv` in the clone; on a reused clone it makes `.venv` match the lockfile exactly, which can remove packages the tester added by hand. Tell the tester this before asking for approval. It also writes outside the folder: if Python 3.12 is missing, uv downloads a managed interpreter into its user-level Python directory, and downloaded packages go to uv's user-level cache.
3. Create the config file: copy `.env.example` to `.env` if `.env` does not exist.
4. **The tester adds the LLM API key themselves.** Tell them to open `<artemis>/.env` and fill in one key. Never ask for the key, never open or print `.env`. Do not try to check it yourself: Artemis picks its credential from several variables (`GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GCP_API_KEY`) and from the process environment as well as `.env`, and importing its settings can create folders. Ask the tester to confirm they saved a Gemini key (not the template's `your_api_key_here`). Step 3 verifies it with Artemis's own check, which reports only whether the credential works.
   - Artemis's default config uses provider `google` for every node, and its Flash mode needs a Gemini model for screen grounding. At the pinned commit the default and fallback model IDs are Gemini models and the object-detector fallback stays Google, so changing the provider alone does not make another provider's key work. Require a Gemini key. If the tester only has another provider's key, report MISSING and say that SOMA has not tested any other configuration; the tester would have to change models, fallbacks and grounding in `config/artemis.jsonc` themselves.
   - Creating an AI Studio key can fail with "Failed to create project"; creating or reusing a Google Cloud project first is the usual workaround.
   - The free Gemini tier is slow and returns 503s and timeouts; tasks may stall (see "Do not trust `running`" in the Artemis backend file).
5. Recommend, and add only if the tester agrees, `ARTEMIS_HELPER_AUTO_INSTALL=false` to `.env` for shared or personal phones: Artemis then does not install its accessibility-service helper app unprompted. The tester can install it later with `uv run artemis helper install`.

## 2. Register for this project only (change to the SOMA project folder once)
1. Print the snippet, without writing anything: `uv run artemis mcp --generate-config claude`, run in `<artemis>` (this is the last command there). Tell the tester first, and run it only after their yes: loading Artemis's configuration can create its trace, replay and image folders inside the clone. It shows `command` (the `.venv` Python), `args` (`-m mcp_server`), `cwd` and `env` with absolute paths.
2. Show the tester the exact registration command and run it only after their yes, from the SOMA project folder: `claude mcp add-json --scope local artemis '<the JSON for the artemis server from the snippet>'`. `--scope local` limits it to this project and this user. On Windows PowerShell, quote the JSON so the inner double quotes survive (single-quoted string, or a here-string).
3. Check it: `claude mcp get artemis`. Undo with `claude mcp remove artemis -s local`.
4. Tell the tester to restart Claude Code. The `mobile_*` tools only appear after a restart.

## 3. Verify (after the restart)
Run the Artemis part of the `check-setup` skill: `mobile_*` tools visible, then `mobile_diagnose` in check-only mode with `verify_credentials=true` (it tests the key against the provider, so tell the tester first). Report its verdict and fix list. Apply none of its fixes without the tester's yes.

## Output
A checklist of what was done, skipped or still open (for example "key not set yet", "restart pending"), the pinned commit, and the one-line undo for each change. Remind the tester that Artemis sends screenshots and screen text to their LLM provider, so test devices and test accounts only. Do not start a test run here; the consent gate in the Artemis backend file applies before the first task.
