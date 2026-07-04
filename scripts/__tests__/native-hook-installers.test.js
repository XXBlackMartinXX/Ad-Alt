'use strict';
/**
 * Tests for scripts/install-claude-code-hooks.js and
 * scripts/install-codex-hooks.js -- confirms dry-run-by-default,
 * explicit-opt-in --write, backup-before-write, idempotent merge, and
 * that unparsable existing files are refused rather than clobbered.
 *
 * CRITICAL: every test here targets a temp directory (os.tmpdir()) via
 * an explicit --target flag. Never the real default
 * ~/.claude/settings.json or ~/.codex/hooks.json path.
 *
 * Run via: pnpm -w run test:scripts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLAUDE_INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-claude-code-hooks.js');
const CODEX_INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-codex-hooks.js');

function freshTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'native-hook-installer-test-'));
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

for (const [label, installer, targetFile] of [
  ['Claude Code', CLAUDE_INSTALLER, 'settings.json'],
  ['Codex', CODEX_INSTALLER, 'hooks.json'],
]) {
  test(`${label} installer: dry run never touches the target file`, () => {
    const dir = freshTmpDir();
    const target = path.join(dir, targetFile);
    const result = run(installer, ['--target', target]);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(target), false, 'dry run must not create the target file');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${label} installer: --write creates the target file and a backup only appears when one existed`, () => {
    const dir = freshTmpDir();
    const target = path.join(dir, targetFile);
    const result = run(installer, ['--target', target, '--write']);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(target), true);
    const backups = fs.readdirSync(dir).filter((f) => f.includes('.bak.'));
    assert.deepEqual(backups, [], 'no backup should be created when the target did not previously exist');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${label} installer: second --write is idempotent (no duplicate hook entries)`, () => {
    const dir = freshTmpDir();
    const target = path.join(dir, targetFile);
    run(installer, ['--target', target, '--write']);
    const firstContent = JSON.parse(fs.readFileSync(target, 'utf8'));
    run(installer, ['--target', target, '--write']);
    const secondContent = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.deepEqual(secondContent, firstContent, 'running --write twice must not duplicate hook entries');
    const backups = fs.readdirSync(dir).filter((f) => f.includes('.bak.'));
    assert.equal(backups.length, 1, 'the second --write must create exactly one backup (of the first write\'s output)');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${label} installer: refuses to modify an existing but unparsable target file`, () => {
    const dir = freshTmpDir();
    const target = path.join(dir, targetFile);
    fs.writeFileSync(target, '{ not valid json at all', 'utf8');
    const before = fs.readFileSync(target, 'utf8');
    const result = run(installer, ['--target', target, '--write']);
    assert.equal(result.status, 1);
    const after = fs.readFileSync(target, 'utf8');
    assert.equal(after, before, 'unparsable existing file must be left completely untouched');
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
