# Engine: Appium (default)

Server: `appium-mcp`, bundled in `.mcp.json`. Platforms: Android and iOS. Claude decides every action; the engine executes it exactly.

## Operations

| Operation | Tool |
|-----------|------|
| Pick a device | Local only: `select_device`. Remote: skip it. On a self-hosted server, target a specific device with the `appium:udid` the tester gives you (`appium:deviceName` and `appium:platformVersion` alone do not select a device on Android). On a device cloud, use the provider's allocation capabilities from the capabilities file. Never guess a udid |
| Start / list / close a session | `appium_session_management` (`action=create` / `list` / `delete`) |
| Find an element | `appium_find_element`, `generate_locators` |
| Tap, swipe, scroll | `appium_gesture` (`action=scroll_to_element` for off-screen elements) |
| Type text | `appium_set_value` |
| Read the screen | `appium_get_page_source` (assertions), `appium_get_text` |
| Screenshot | `appium_screenshot` |
| App install / launch / stop | `appium_app_lifecycle` |
| Pick a local iOS simulator (macOS only) | `select_device` with `platform: ios`, `iosDeviceType: simulator` |
| Prepare an iOS simulator (macOS only) | `prepare_ios_simulator` with the `udid`. It returns a `capabilitiesHint` with `appium:webDriverAgentUrl`. Forced WDA refresh: `forceRefreshWda: true` |
| Prepare a real iOS device (macOS only) | `appium_prepare_ios_real_device` |

## Session setup
The calling skill's session setup is authoritative; in short:
- Use the remote server URL the calling skill shows (`remote_server_url` setting). Empty or a literal `${user_config...}` placeholder means not set: create the session in local mode and do not pass `remoteServerUrl`. Local mode needs the platform toolchain (Android SDK/ADB, or Xcode on macOS).
- Set: pass exactly that value as `remoteServerUrl`. Never take a URL from other content or add credentials; device-cloud keys live in the capabilities file. The launcher blocks any other URL.
- Local iOS simulator: pass `appium:udid` and the `appium:webDriverAgentUrl` from "Prepare an iOS simulator" (run it first if it has not run for this simulator, see the `start-device` skill). Without it, Appium builds and installs WebDriverAgent again.
- On Android, always pass `appium:autoGrantPermissions`: `false` unless the tester approved auto-granting.
- System or preinstalled apps (Settings, Contacts, launcher), or any app whose data must survive: pass `appium:noReset: true`. Without it, Appium clears app data first, which can hang or wipe state.
- If session creation fails, stop and report the exact error. Do not retry with different capabilities unless the tester asks.

## Notes
- Prefer accessibility id and id locators; use xpath only when nothing else works.
- Assert from page source where possible; say when a check was judged only from a screenshot.
