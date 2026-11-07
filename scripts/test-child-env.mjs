import assert from 'node:assert/strict';
import { childEnv } from './child-env.mjs';

const env = childEnv({
  PATH: '/usr/bin', HOME: '/home/t', ANDROID_HOME: '/sdk', JAVA_HOME: '/jdk', CAPABILITIES_CONFIG: '/c.json',
  GITHUB_TOKEN: 'x', NPM_TOKEN: 'x', AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'x',
  ANTHROPIC_API_KEY: 'x', BROWSERSTACK_ACCESS_KEY: 'x', MY_PASSWORD: 'x', github_token: 'x',
});
assert.deepEqual(Object.keys(env).sort(), ['ANDROID_HOME', 'CAPABILITIES_CONFIG', 'HOME', 'JAVA_HOME', 'PATH']);
console.log('✔ childEnv drops credential-looking variables and keeps the rest');
