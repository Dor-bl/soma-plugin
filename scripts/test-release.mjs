#!/usr/bin/env node
// Tests for scripts/release.mjs: version bump, badge, changelog cut and release notes.
import assert from 'node:assert/strict';
import { bumpBadge, bumpManifest, changelogSection, compareVersions, cutChangelog, isValidDate, keepEol } from './release.mjs';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`✔ ${name}`);
};

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- New thing

## [0.1.0] - not tagged

### Added

- First thing
`;

test('compareVersions orders releases and prereleases', () => {
  assert.ok(compareVersions('0.2.0', '0.1.0') > 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
  assert.ok(compareVersions('1.0.0-beta.1', '1.0.0') < 0);
  assert.ok(compareVersions('0.1.0', '0.2.0') < 0);
  assert.ok(compareVersions('0.2.0-rc.10', '0.2.0-rc.2') > 0);
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-alpha.1') < 0);
  assert.ok(compareVersions('1.0.0-1', '1.0.0-alpha') < 0);
  assert.ok(compareVersions('1.0.0-beta', '1.0.0-alpha.9') > 0);
});

test('isValidDate accepts real dates only', () => {
  assert.ok(isValidDate('2026-11-20'));
  assert.ok(isValidDate('2028-02-29'));
  for (const bad of ['2026-02-30', '2026-13-45', '2027-02-29', '2026-1-5', '', undefined]) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test('bumpManifest changes only the version and keeps formatting', () => {
  const text = '{\n  "name": "soma",\n  "version": "0.1.0",\n  "x": 1\n}\n';
  assert.equal(bumpManifest(text, '0.2.0'), text.replace('0.1.0', '0.2.0'));
  assert.throws(() => bumpManifest('{}', '0.2.0'), /version/);
});

test('bumpBadge rewrites the version badge only', () => {
  const text = '[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](x) ![Status](https://img.shields.io/badge/status-beta-yellow.svg)';
  const out = bumpBadge(text, '0.2.0');
  assert.match(out, /badge\/version-0\.2\.0-blue\.svg/);
  assert.match(out, /status-beta-yellow/);
  assert.throws(() => bumpBadge('no badge', '0.2.0'), /badge/);
  const rc = bumpBadge(text, '1.0.0-rc.1');
  assert.match(rc, /badge\/version-1\.0\.0--rc\.1-blue\.svg/);
  assert.match(bumpBadge(rc, '1.0.0'), /badge\/version-1\.0\.0-blue\.svg/);
});

test('cutChangelog moves Unreleased entries under a dated heading', () => {
  const out = cutChangelog(CHANGELOG, '0.2.0', '2026-11-20');
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-20\n\n### Added\n\n- New thing\n\n## \[0\.1\.0\]/);
  assert.deepEqual(changelogSection(out, '0.2.0'), { body: '### Added\n\n- New thing', date: '2026-11-20' });
});

test('cutChangelog dates a heading prepared earlier and leaves Unreleased alone', () => {
  const prepared = CHANGELOG.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.2.0] - not yet tagged\n');
  const out = cutChangelog(prepared, '0.2.0', '2026-11-20');
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-20\n/);
  assert.equal(out.match(/## \[0\.2\.0\]/g).length, 1);
});

test('cutChangelog refuses an empty Unreleased section', () => {
  const empty = CHANGELOG.replace('### Added\n\n- New thing\n\n', '');
  assert.throws(() => cutChangelog(empty, '0.2.0', '2026-11-20'), /nothing under Unreleased/);
});

test('changelogSection reports undated headings and missing versions', () => {
  assert.equal(changelogSection(CHANGELOG, '0.1.0').date, null);
  assert.equal(changelogSection(CHANGELOG, '9.9.9'), null);
  assert.equal(changelogSection(CHANGELOG, '0.1.0').body, '### Added\n\n- First thing');
});

test('keepEol cuts a CRLF changelog without extra lines and keeps CRLF', () => {
  const crlf = CHANGELOG.replace(/\n/g, '\r\n');
  const out = keepEol(crlf, (t) => cutChangelog(t, '0.2.0', '2026-11-20'));
  assert.equal(out, cutChangelog(CHANGELOG, '0.2.0', '2026-11-20').replace(/\n/g, '\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(out), 'no bare LF');
});

test('version dots are matched literally', () => {
  assert.equal(changelogSection(CHANGELOG.replace('[0.1.0]', '[0x1x0]'), '0.1.0'), null);
});

console.log(`✔ All ${passed} release tests passed`);
