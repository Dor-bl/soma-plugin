#!/usr/bin/env node
// Prepares a release: bumps the version in plugin.json and the README badge,
// and moves the changelog's Unreleased entries under a dated version heading.
//
//   node scripts/release.mjs 0.3.0               # today's date (UTC)
//   node scripts/release.mjs 0.3.0 --date 2026-12-01
//   node scripts/release.mjs --notes 0.3.0       # print that version's changelog section
//
// Run with the version already in plugin.json to date a heading that was
// prepared earlier (e.g. "## [0.2.0] - not yet tagged"). The release itself
// (tag and GitHub release) is made by .github/workflows/release.yml when the
// version change lands on main.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isValidSemver(version) {
  return SEMVER.test(version ?? '');
}

// Runs fn on the text with LF line endings and restores CRLF if the text used it
// (Windows checkouts with core.autocrlf).
export function keepEol(text, fn) {
  const crlf = text.includes('\r\n');
  const out = fn(crlf ? text.replace(/\r\n/g, '\n') : text);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

// SemVer precedence: core numbers first; a prerelease sorts before its release;
// prerelease identifiers compare numerically when both are numeric, numeric
// before alphanumeric, otherwise as text; a shorter identifier list sorts first.
export function compareVersions(a, b) {
  const split = (v) => {
    const i = v.indexOf('-');
    return i === -1 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
  };
  const [ca, pa] = split(a);
  const [cb, pb] = split(b);
  const na = ca.split('.').map(Number);
  const nb = cb.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (na[i] !== nb[i]) return na[i] - nb[i];
  if (pa === pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const ia = pa.split('.');
  const ib = pb.split('.');
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    if (ia[i] === undefined) return -1;
    if (ib[i] === undefined) return 1;
    const da = /^\d+$/.test(ia[i]);
    const db = /^\d+$/.test(ib[i]);
    if (da && db && Number(ia[i]) !== Number(ib[i])) return Number(ia[i]) - Number(ib[i]);
    if (da !== db) return da ? -1 : 1;
    if (ia[i] !== ib[i]) return ia[i] < ib[i] ? -1 : 1;
  }
  return 0;
}

// True for a real calendar date in YYYY-MM-DD form.
export function isValidDate(date) {
  if (!DATE.test(date ?? '')) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function bumpManifest(text, version) {
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(text)) throw new Error('plugin.json: "version" not found');
  return text.replace(re, `$1${version}$2`);
}

export function bumpBadge(text, version) {
  const re = /(badge\/version-)[\w.-]+?(-\w+\.svg)/;
  if (!re.test(text)) throw new Error('README.md: version badge not found');
  // shields.io reads a single hyphen as a field separator; "--" is a literal one
  return text.replace(re, `$1${version.replaceAll('-', '--')}$2`);
}

const heading = (version) => new RegExp(`^## \\[${escape(version)}\\][^\\n]*$`, 'm');

// Returns the changelog with the version's heading dated. If the heading does
// not exist yet, it is created from the Unreleased entries, which must not be empty.
export function cutChangelog(text, version, date) {
  const dated = `## [${version}] - ${date}`;
  if (heading(version).test(text)) return text.replace(heading(version), dated);
  const unreleased = /^## \[Unreleased\][^\n]*\n/m.exec(text);
  if (!unreleased) throw new Error('CHANGELOG.md: "## [Unreleased]" heading not found');
  const start = unreleased.index + unreleased[0].length;
  const next = text.slice(start).search(/^## \[/m);
  const body = next === -1 ? text.slice(start) : text.slice(start, start + next);
  if (!body.trim()) throw new Error('CHANGELOG.md: nothing under Unreleased to release');
  return `${text.slice(0, start)}\n${dated}\n${body.startsWith('\n') ? '' : '\n'}${text.slice(start)}`;
}

// The section's text under its heading, and the heading's date (null if undated or invalid).
export function changelogSection(text, version) {
  const m = heading(version).exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = text.slice(start).search(/^## \[/m);
  const body = (next === -1 ? text.slice(start) : text.slice(start, start + next)).trim();
  const rawDate = m[0].match(/ - (\d{4}-\d{2}-\d{2})\s*$/)?.[1] ?? null;
  const date = isValidDate(rawDate) ? rawDate : null;
  return { body, date };
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const path = (f) => join(root, f);
  const fail = (msg) => {
    console.error(`✘ ${msg}`);
    process.exit(1);
  };

  if (argv[0] === '--notes') {
    const version = argv[1];
    if (!isValidSemver(version)) fail('usage: release.mjs --notes <version>');
    const section = changelogSection(readFileSync(path('CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n'), version);
    if (!section) fail(`CHANGELOG.md: no section for ${version}`);
    if (!isValidDate(section.date)) fail(`CHANGELOG.md: the ${version} heading has no date; run release.mjs ${version} first`);
    if (!section.body) fail(`CHANGELOG.md: the ${version} section is empty`);
    process.stdout.write(`${section.body}\n`);
    return;
  }

  const version = argv[0];
  const dateIdx = argv.indexOf('--date');
  const date = dateIdx === -1 ? new Date().toISOString().slice(0, 10) : argv[dateIdx + 1];
  if (!isValidSemver(version)) fail('usage: release.mjs <version> [--date YYYY-MM-DD]');
  if (!isValidDate(date)) fail(`--date must be a real date in YYYY-MM-DD form, got ${date}`);

  const manifestPath = path('.claude-plugin/plugin.json');
  const manifest = readFileSync(manifestPath, 'utf8');
  const current = JSON.parse(manifest).version;
  if (!isValidSemver(current)) fail(`plugin.json: current version is not semver (${current})`);
  if (compareVersions(version, current) < 0) fail(`${version} is lower than the current version ${current}`);

  const files = {
    [manifestPath]: keepEol(manifest, (t) => bumpManifest(t, version)),
    [path('README.md')]: keepEol(readFileSync(path('README.md'), 'utf8'), (t) => bumpBadge(t, version)),
    [path('CHANGELOG.md')]: keepEol(readFileSync(path('CHANGELOG.md'), 'utf8'), (t) => cutChangelog(t, version, date)),
  };
  for (const [f, text] of Object.entries(files)) writeFileSync(f, text);
  console.log(`✔ ${current} → ${version}, changelog dated ${date}`);

  const check = spawnSync(process.execPath, [path('scripts/check-plugin.mjs')], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 1);
  console.log('Next: review the diff, open a PR, and merge it; the release workflow tags and publishes v' + version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
