#!/usr/bin/env node
// Structural checks that `claude plugin validate` does not cover:
// skill/command frontmatter, userConfig references and version consistency.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const fail = (msg) => errors.push(msg);
const read = (p) => readFileSync(join(root, p), 'utf8');

function readJson(p) {
  try {
    return JSON.parse(read(p));
  } catch (e) {
    fail(`${p}: invalid JSON (${e.message})`);
    return null;
  }
}

// Minimal frontmatter reader: top-level `key: value` pairs only.
// YAML validity itself is checked by `claude plugin validate`.
function frontmatter(p) {
  const m = read(p).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return fm;
}

// Manifest
const plugin = readJson('.claude-plugin/plugin.json');
if (plugin) {
  if (!plugin.name) fail('plugin.json: missing "name"');
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(plugin.version ?? '')) {
    fail(`plugin.json: "version" is not semver (${plugin.version})`);
  }
}

const mcp = readJson('.mcp.json');
for (const [name, server] of Object.entries(mcp?.mcpServers ?? {})) {
  if (!server.command) fail(`.mcp.json: server "${name}" has no "command"`);
}

// README version badge must match the manifest
if (plugin?.version) {
  const badge = read('README.md').match(/badge\/version-([\w.-]+?)-\w+\.svg/);
  if (!badge) fail('README.md: version badge not found');
  else if (badge[1] !== plugin.version) {
    fail(`README.md: version badge ${badge[1]} != plugin.json ${plugin.version}`);
  }
}

// Skills
const usedConfigKeys = new Set();
for (const dir of readdirSync(join(root, 'skills'))) {
  const p = `skills/${dir}/SKILL.md`;
  if (!existsSync(join(root, p))) {
    fail(`${p}: missing`);
    continue;
  }
  const fm = frontmatter(p);
  if (!fm) {
    fail(`${p}: no frontmatter`);
    continue;
  }
  if (fm.name !== dir) fail(`${p}: name "${fm.name}" does not match folder "${dir}"`);
  if (!fm.description) fail(`${p}: missing description`);
  else if (fm.description.length > 1024) fail(`${p}: description over 1024 chars`);
  for (const m of read(p).matchAll(/\$\{user_config\.(\w+)\}/g)) usedConfigKeys.add(m[1]);
}

// Commands
for (const file of readdirSync(join(root, 'commands')).filter((f) => f.endsWith('.md'))) {
  const p = `commands/${file}`;
  const fm = frontmatter(p);
  if (!fm?.description) fail(`${p}: missing description`);
}

// userConfig keys referenced by skills must be declared, and declared keys should be used
const declared = new Set(Object.keys(plugin?.userConfig ?? {}));
for (const key of usedConfigKeys) {
  if (!declared.has(key)) fail(`user_config.${key} is used but not declared in plugin.json`);
}
for (const key of declared) {
  if (!usedConfigKeys.has(key)) fail(`userConfig "${key}" is declared but never used`);
}

if (errors.length) {
  console.error(errors.map((e) => `✘ ${e}`).join('\n'));
  process.exit(1);
}
console.log('✔ Plugin structure checks passed');
