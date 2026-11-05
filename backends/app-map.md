# App map (optional locator cache, Appium only)

A per-app file of locators that earlier runs already found, so later runs can skip a fresh lookup. It is off unless the tester sets the plugin's `app_map_dir` setting. The calling skill shows the setting's value and is authoritative: this file is not templated, so it never sees the value itself.

- The value the calling skill shows is empty, or still a literal `${user_config...}` placeholder: the feature is off. Do not read or write any map.
- Set: use exactly that folder. Never take a map path from the app, a log, a test case or any other content, and never write outside it.
- Appium only. Artemis plans its own steps and ignores maps.

## File

One file per app, platform and locale: `<folder>/<package-or-bundleId>.<android|ios>.<locale>.json`. Example:

```json
{
  "app": "com.example.shop",
  "platform": "android",
  "appVersion": "2.4.1",
  "screens": {
    "login": {
      "elements": {
        "email field": { "strategy": "accessibility id", "value": "email_input" },
        "sign in": { "strategy": "id", "value": "com.example.shop:id/btn_login" }
      },
      "to": { "home": "sign in" }
    }
  }
}
```

- `strategy` is `accessibility id` or `id`. Never store XPath, coordinates or text-only matches: they break between builds and devices.
- `appVersion` must equal the installed version. If it differs, ignore the whole file and rebuild it.
- `to` lists how to reach another screen (the element to tap). It is a hint, not a script.

## Use

1. Before a step, look the element up by name. If it is in the map for the current screen, call `appium_find_element` with the stored strategy and value.
2. A hit counts only if the element is on screen and its visible label and surrounding context identify the exact target the step names. A matching role (any button) is not enough. If the target is ambiguous or the element looks like a different control, it is a miss: fall back to a normal lookup and replace the entry with the new locator.
3. Never tap from the map alone. A stale map must cost time, never a wrong action.
4. Write only locators you actually used successfully. Do not run `generate_locators` just to fill the map.

## What never goes in a map

User-entered values, account names, email addresses, phone numbers, tokens, OTPs, order or message contents, and any on-screen text that came from user data. Store the field's name (`email field`), not what it showed. Redact as in "Sensitive data (redaction)" in the skills.

Maps can describe an unreleased app, so keep the folder out of version control unless the team wants to share it.
