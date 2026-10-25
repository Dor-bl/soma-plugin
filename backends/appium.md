# Engine: Appium (default)

Server: `appium-mcp`, bundled in `.mcp.json`. Platforms: Android and iOS. Claude decides every action; the engine executes it exactly.

## Operations

| Operation | Tool |
|-----------|------|
| Pick a device | `select_device` |
| Start / list / close a session | `appium_session_management` (`action=create` / `list` / `delete`) |
| Find an element | `appium_find_element`, `generate_locators` |
| Tap, swipe, scroll | `appium_gesture` (`action=scroll_to_element` for off-screen elements) |
| Type text | `appium_set_value` |
| Read the screen | `appium_get_page_source` (assertions), `appium_get_text` |
| Screenshot | `appium_screenshot` |
| App install / launch / stop | `appium_app_lifecycle` |

## Session setup
- Read the remote server URL the calling skill passes in (`remote_server_url` setting).
- Empty: create the session in local mode and do not pass `remoteServerUrl`. Local mode needs the platform toolchain (Android SDK/ADB, or Xcode on macOS).
- Set: pass it as `remoteServerUrl` when creating the session.
- If session creation fails, stop and report the exact error. Do not retry with different capabilities unless the tester asks.

## Notes
- Prefer accessibility id and id locators; use xpath only when nothing else works.
- Assert from page source where possible; say when a check was judged only from a screenshot.
