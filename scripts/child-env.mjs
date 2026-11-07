// The environment appium-mcp and its dependencies run with. They need PATH, HOME, the
// Android and Java locations and so on, so those pass through. Variables that look like
// credentials do not: device-cloud keys belong in the capabilities file, not the environment.
const SECRET_NAME = /(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)(_|$)|^(AWS|GITHUB|GH|NPM|ANTHROPIC|OPENAI)_/i;

export function childEnv(parent) {
  return Object.fromEntries(Object.entries(parent).filter(([name]) => !SECRET_NAME.test(name)));
}
