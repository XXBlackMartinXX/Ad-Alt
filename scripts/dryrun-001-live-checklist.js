#!/usr/bin/env node
// DRYRUN-001 Live Checklist
//
// Prints everything a tester/owner needs to run the real-ChatGPT rerun
// objectively, using the live dry-run diagnostics panel instead of guessing.
//
// This script does NOT connect to ChatGPT, does NOT inspect browser data,
// and does NOT read any private content. It only reads local repo state
// (git commit, ZIP artifact on disk) and prints static guidance text.
//
// Usage: node scripts/dryrun-001-live-checklist.js
//        pnpm -w run dryrun:001:live-checklist
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_PACKAGE_DIR = path.join(ROOT, 'apps', 'browser-extension', 'dist-package');

function runCmd(cmd) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

function line() {
  console.log('-'.repeat(70));
}

console.log('');
console.log('='.repeat(70));
console.log('  DRYRUN-001 LIVE CHECKLIST');
console.log('  Read this immediately before (and during) the real ChatGPT rerun.');
console.log('='.repeat(70));
console.log('');

// ---------------------------------------------------------------------------
// 1. Commit and branch
// ---------------------------------------------------------------------------
console.log('-- Current commit --');
const branch = (runCmd('git rev-parse --abbrev-ref HEAD').stdout || '').trim();
const commit = (runCmd('git rev-parse --short HEAD').stdout || '').trim();
console.log(`  Branch: ${branch}`);
console.log(`  Commit: ${commit}`);
console.log('');

// ---------------------------------------------------------------------------
// 2. Latest ZIP + correct load folder
// ---------------------------------------------------------------------------
console.log('-- Package artifact --');

let zipName = null;
if (fs.existsSync(DIST_PACKAGE_DIR)) {
  const zips = fs.readdirSync(DIST_PACKAGE_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DIST_PACKAGE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (zips.length > 0) zipName = zips[0].name;
}

if (zipName) {
  console.log(`  Latest ZIP: ${zipName}`);
  console.log(`  Path: apps/browser-extension/dist-package/${zipName}`);
} else {
  console.log('  No ZIP found. Run: pnpm -w run package:browser:beta');
}
console.log('');

console.log('-- Correct folder to load in Chrome --');
console.log('  1. Unzip the file to a NEW folder (do not reuse an old extraction folder --');
console.log('     Chrome may treat a reused folder path as an "update" instead of a fresh');
console.log('     "install", which would skip the automatic demo-mode/diagnostics setup).');
console.log('  2. In chrome://extensions -> Load unpacked -> select the EXTRACTED folder');
console.log('     that contains manifest.json DIRECTLY (NOT the dist/ subfolder inside it).');
console.log('');

// ---------------------------------------------------------------------------
// 3. Remove old copies
// ---------------------------------------------------------------------------
console.log('-- Before loading: remove old copies --');
console.log('  In chrome://extensions, remove ANY previous PromptProfit entry before');
console.log('  loading this ZIP. Multiple copies can cause storage/kill-switch confusion.');
console.log('');

// ---------------------------------------------------------------------------
// 4. Extension state checks
// ---------------------------------------------------------------------------
console.log('-- After loading: confirm extension state --');
console.log('  [ ] "PromptProfit" appears in chrome://extensions');
console.log('  [ ] Toggle is ON (blue), not grayed out');
console.log('  [ ] NO red error badge / exclamation icon on the extension');
console.log('  [ ] "Details" -> "Errors" shows no errors (if any: record verbatim, no personal data)');
console.log('');

// ---------------------------------------------------------------------------
// 5. ChatGPT login reminder
// ---------------------------------------------------------------------------
console.log('-- ChatGPT login (manual -- never automate this) --');
console.log('  [ ] Navigate to https://chatgpt.com in a NEW tab (opened AFTER loading the extension)');
console.log('  [ ] Confirm you see the chat interface, NOT "Log in" / "Sign up for free"');
console.log('  [ ] Click "New chat" (not an existing conversation)');
console.log('');

// ---------------------------------------------------------------------------
// 6. Recommended prompt
// ---------------------------------------------------------------------------
console.log('-- Recommended safe test prompt --');
console.log('  RECOMMENDED (gives more observation time):');
console.log('');
console.log('    Count slowly from 1 to 100, one number per line.');
console.log('');
console.log('  Also approved (shorter, original DRYRUN-001 prompt):');
console.log('');
console.log('    Count slowly from 1 to 10.');
console.log('');
console.log('  Do NOT use any other prompt. Do NOT include personal or work content.');
console.log('');

// ---------------------------------------------------------------------------
// 7. Diagnostic panel legend
// ---------------------------------------------------------------------------
console.log('-- What the live dry-run diagnostics panel means --');
console.log('  The panel appears in the TOP-LEFT corner (internal-beta builds only).');
console.log('  It never shows ChatGPT prompt/response text -- only extension-owned state.');
console.log('  Read its status line top-to-bottom; it tells you exactly where the runtime');
console.log('  path stops, instead of a single undifferentiated "no banner" report:');
console.log('');
console.log('  "Extension not loaded on this page"');
console.log('    -> The content script never ran on this page. Reload the ChatGPT tab');
console.log('       AFTER confirming the extension is loaded (not before).');
console.log('  "Platform not detected"');
console.log('    -> Hostname is not chatgpt.com / chat.openai.com. Confirm the URL.');
console.log('  "Kill-switch active -- banner suppressed"');
console.log('    -> A featureFlags.killSwitchEnabled value is stopping the banner.');
console.log('  "Adapter inactive"');
console.log('    -> The extension loaded, but the ChatGPT adapter did not start.');
console.log('  "Waiting for generation state"');
console.log('    -> Normal / expected until you send a prompt. If it never changes');
console.log('       after sending a prompt: the wait-state selector likely did not match');
console.log('       (possible ChatGPT UI change) -- record this exact status line.');
console.log('  "Generation detected; API not configured"');
console.log('    -> Wait-state fired, but neither demo mode nor a real API is configured.');
console.log('       This means dryRunDemoMode did not get set -- see the "remove old');
console.log('       copies" note above; this can happen if Chrome treated the load as');
console.log('       an "update" rather than a fresh "install."');
console.log('  "Generation detected; ad decision failed"');
console.log('    -> Demo mode or a real API IS configured, but no decision came back.');
console.log('       This is a genuine runtime failure -- record it, do not blame setup.');
console.log('  "Generation detected; ad decision missing"');
console.log('    -> Ad decision request never returned (service worker unreachable, etc).');
console.log('  "Banner attempted; not visible"');
console.log('    -> The banner was added to the page but has zero visible size -- a CSS');
console.log('       or host-page conflict. Record this exact status line.');
console.log('  "Banner visible"');
console.log('    -> Everything worked. This is the expected state while ChatGPT generates.');
console.log('');

// ---------------------------------------------------------------------------
// 8. How to answer finalize
// ---------------------------------------------------------------------------
console.log('-- How to answer pnpm -w run dryrun:001:finalize based on what you saw --');
console.log('  If the banner appeared: answer Q7 "yes".');
console.log('  If the banner did NOT appear:');
console.log('    - Answer Q7 "no" (NOT "unknown" -- you have a diagnostic panel reading now).');
console.log('    - When asked for issue details, paste the EXACT diagnostic panel status');
console.log('      line and last-error value you observed. Do not paraphrase or guess.');
console.log('    - A confirmed "no" with the selftest passing is filed as S1/P1 automatically');
console.log('      -- you cannot downgrade it, and that is intentional.');
console.log('  If you could not tell (e.g. panel not visible, unsure): answer "unknown" --');
console.log('    this still blocks GO but is tracked separately from a confirmed failure.');
console.log('');

line();
console.log('This checklist does not connect to ChatGPT, does not read browser data, and');
console.log('does not read any page content. It only prints local repo state and guidance.');
line();
console.log('');
