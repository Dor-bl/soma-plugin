# Device engines

SOMA's skills describe *what* to do on a device. The files here describe *how* each engine does it.

| Engine | File | Platforms | Bundled |
|--------|------|-----------|---------|
| Appium (default) | [appium.md](appium.md) | Android, iOS | Yes, via `.mcp.json` |
| Google Artemis | [artemis.md](artemis.md) | Android | No, install separately |

## Choosing the engine
1. Use Appium unless the tester asks for another engine, or the skill says otherwise.
2. Use Artemis only if its `mobile_*` tools are available. If the tester asks for it and they are not, say so and point to `check-setup`.
3. Use one engine per run. Never drive the same device with two engines at once.
4. Name the engine used in every report.

## Adding an engine
Add a `<engine>.md` with the same sections (Operations, Session setup or usage notes, platforms) and a row in the table above. Skills should not need edits beyond any engine-specific restriction.
