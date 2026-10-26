#!/usr/bin/env node
// Tests the remote-server allowlist the launcher hands to appium-mcp:
// only the configured URL may match, and bad settings block everything.
import { allowRegexFor, DENY_ALL } from './allowlist.mjs';

const ALLOW = true;
const DENY = false;
const cases = [
  ['https://hub.browserstack.com/wd/hub', {
    'https://hub.browserstack.com/wd/hub': ALLOW,
    'https://hub.browserstack.com/wd/hub/': ALLOW,
    'https://attacker.example': DENY,
    'https://hub-browserstack.com/wd/hub': DENY,
    'https://hubXbrowserstack.com/wd/hub': DENY,
    'https://hub.browserstack.com/wd/hub.evil': DENY,
    'https://hub.browserstack.com.evil.com/wd/hub': DENY,
    'https://hub.browserstack.com/wd/hubx': DENY,
    'https://hub.browserstack.com/wd/hub/x': DENY,
    'https://user:key@hub.browserstack.com/wd/hub': DENY,
  }],
  ['https://hub.browserstack.com/', {
    'https://hub.browserstack.com': ALLOW,
    'https://hub.browserstack.com/': ALLOW,
    'https://hub.browserstack.com/x': DENY,
  }],
  ['https://cloud.example/wd/hub//', {
    'https://cloud.example/wd/hub//': ALLOW,
    'https://cloud.example/wd/hub': ALLOW,
    'https://cloud.example/wd/hub/': ALLOW,
    'https://cloud.example/wd/hub///': DENY,
    'https://cloud.example/': DENY,
  }],
  ['  https://cloud.example/wd/hub  ', {
    '  https://cloud.example/wd/hub  ': ALLOW,
    'https://cloud.example/wd/hub': ALLOW,
    'https://cloud.example/wd/hub/x': DENY,
  }],
  ['https://hub.example.com/a.b(c)+d', {
    'https://hub.example.com/a.b(c)+d': ALLOW,
    'https://hub.example.com/aXb(c)+d': DENY,
    'https://hub.example.com/a.bc+d': DENY,
  }],
  ['http://localhost:4723', {
    'http://localhost:4723': ALLOW,
    'http://localhost:4724': DENY,
    'http://localhost:4723@evil.com': DENY,
  }],
  ['http://[::1]:4723', { 'http://[::1]:4723': ALLOW }],
  // Settings that must block every remote server
  ['', { 'https://hub.browserstack.com': DENY, 'http://localhost:4723': DENY }],
  ['${user_config.remote_server_url}', { 'https://x.com': DENY }],
  ['not a url', { 'https://x.com': DENY }],
  ['http://grid.example.com:4723', { 'http://grid.example.com:4723': DENY }],
  ['https://u:k@hub.browserstack.com', { 'https://u:k@hub.browserstack.com': DENY, 'https://hub.browserstack.com': DENY }],
  ['https://hub.example.com/?x=1', { 'https://hub.example.com/': DENY }],
  ['https://hub.example.com/#frag', { 'https://hub.example.com/': DENY }],
  ['ftp://localhost', { 'ftp://localhost': DENY }],
];

let failed = 0;
let total = 0;
for (const [configured, urls] of cases) {
  const source = allowRegexFor(configured, () => {});
  const re = new RegExp(source);
  for (const [url, expected] of Object.entries(urls)) {
    total++;
    if (re.test(url) !== expected) {
      failed++;
      console.error(`✘ setting ${JSON.stringify(configured)}: ${JSON.stringify(url)} should be ${expected ? 'allowed' : 'denied'} (regex ${source === DENY_ALL ? 'DENY_ALL' : source})`);
    }
  }
}
if (failed) {
  console.error(`✘ ${failed} of ${total} allowlist cases failed`);
  process.exit(1);
}
console.log(`✔ All ${total} allowlist cases passed`);
