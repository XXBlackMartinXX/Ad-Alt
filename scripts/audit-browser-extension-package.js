'use strict';
/**
 * Audit the browser extension dist/ directory for Chrome Web Store submission readiness.
 *
 * Checks:
 *   1. Source maps (.js.map files) - should be absent or documented
 *   2. Manifest.json reference integrity - all referenced files exist
 *   3. Required assets - popup.html, options.html, icons/
 *   4. Disallowed content - no .env, no test artifacts, no dist-test/
 *   5. Content script integrity - only chatgpt.js (not fixture-test.ts)
 *   6. Host permissions - no localhost in production manifest
 *
 * Usage:
 *   node scripts/audit-browser-extension-package.js
 *   pnpm -w run package:browser:audit
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_DIR   = path.join(REPO_ROOT, 'apps', 'browser-extension');
const DIST_DIR  = path.join(EXT_DIR, 'dist');
const MANIFEST  = path.join(EXT_DIR, 'manifest.json');

let exitCode = 0;

function pass(msg)  { process.stdout.write('[PASS] ' + msg + '\n'); }
function fail(msg)  { process.stderr.write('[FAIL] ' + msg + '\n'); exitCode = 1; }
function warn(msg)  { process.stdout.write('[WARN] ' + msg + '\n'); }
function info(msg)  { process.stdout.write('[--]   ' + msg + '\n'); }
function section(t) { process.stdout.write('\n== ' + t + ' ==\n'); }

// ---------------------------------------------------------------------------
// Helper: walk directory
// ---------------------------------------------------------------------------

function walkDir(dir, cb) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fp = path.join(dir, entry);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walkDir(fp, cb);
    else cb(fp, entry);
  }
}

// ---------------------------------------------------------------------------
// Check 1: dist/ directory exists and was built
// ---------------------------------------------------------------------------

section('1. Build Output');

if (!fs.existsSync(DIST_DIR)) {
  fail('dist/ directory not found. Run: pnpm --filter @ad-alt/browser-extension build');
  process.exit(1);
}
pass('dist/ directory exists');

const expectedBundles = [
  'dist/background/service-worker.js',
  'dist/content/chatgpt.js',
];

for (const rel of expectedBundles) {
  const fp = path.join(EXT_DIR, rel);
  if (fs.existsSync(fp)) {
    const size = Math.round(fs.statSync(fp).size / 1024);
    pass(rel + ' (' + size + ' KB)');
  } else {
    fail(rel + ' - NOT FOUND (run: pnpm build)');
  }
}

// ---------------------------------------------------------------------------
// Check 2: Source maps
// ---------------------------------------------------------------------------

section('2. Source Maps');

const mapFiles = [];
walkDir(DIST_DIR, (fp, name) => {
  if (name.endsWith('.js.map')) mapFiles.push(path.relative(EXT_DIR, fp));
});

if (mapFiles.length === 0) {
  pass('No .js.map files in dist/ (source maps excluded)');
} else {
  warn(mapFiles.length + ' .js.map file(s) found in dist/ - EXCLUDE before CWS submission:');
  for (const m of mapFiles) {
    warn('  ' + m);
  }
  info('Option 1: Set sourcemap: false in apps/browser-extension/scripts/bundle.mjs');
  info('Option 2: Exclude *.map from the submission ZIP (safe for beta)');
}

// ---------------------------------------------------------------------------
// Check 3: Manifest.json
// ---------------------------------------------------------------------------

section('3. Manifest.json');

if (!fs.existsSync(MANIFEST)) {
  fail('manifest.json not found at: ' + MANIFEST);
} else {
  pass('manifest.json exists');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    fail('manifest.json is not valid JSON: ' + e.message);
    process.exit(1);
  }

  // Version check
  if (manifest.manifest_version === 3) {
    pass('manifest_version: 3 (Manifest V3)');
  } else {
    fail('manifest_version is not 3: ' + manifest.manifest_version);
  }

  // Service worker reference
  if (manifest.background && manifest.background.service_worker) {
    const swPath = path.join(EXT_DIR, manifest.background.service_worker);
    if (fs.existsSync(swPath)) {
      pass('background.service_worker exists: ' + manifest.background.service_worker);
    } else {
      fail('background.service_worker not found: ' + manifest.background.service_worker);
    }
  } else {
    fail('manifest.json missing background.service_worker');
  }

  // Content scripts
  if (manifest.content_scripts && manifest.content_scripts.length > 0) {
    for (const cs of manifest.content_scripts) {
      if (!cs.js) continue;
      for (const jsFile of cs.js) {
        const fp = path.join(EXT_DIR, jsFile);
        if (fs.existsSync(fp)) {
          pass('content_script JS exists: ' + jsFile);
        } else {
          fail('content_script JS not found: ' + jsFile + ' (run: pnpm build)');
        }
      }
    }
    // Warn if fixture-test.ts content scripts are in production manifest
    const allJs = manifest.content_scripts.flatMap(cs => cs.js || []);
    for (const js of allJs) {
      if (js.includes('fixture') || js.includes('test')) {
        fail('Production manifest includes test content script: ' + js);
      }
    }
  }

  // Host permissions: no localhost in production
  const hostPerms = manifest.host_permissions || [];
  const hasLocalhost = hostPerms.some(p => p.includes('127.0.0.1') || p.includes('localhost'));
  if (hasLocalhost) {
    fail('host_permissions includes localhost URL - remove before CWS submission');
    info('  Localhost is only needed in dist-test/manifest.json (fixture testing)');
  } else {
    pass('host_permissions: no localhost URLs (production manifest clean)');
  }

  // Permissions audit
  const perms = manifest.permissions || [];
  const sensitivePerms = perms.filter(p =>
    ['tabs', 'history', 'bookmarks', 'downloads', 'geolocation', 'notifications'].includes(p)
  );
  if (sensitivePerms.length > 0) {
    warn('Sensitive permissions declared: ' + sensitivePerms.join(', '));
  } else {
    pass('Permissions: no sensitive permissions (' + perms.join(', ') + ')');
  }

  // Popup and options page
  const popup   = manifest.action && manifest.action.default_popup;
  const options = manifest.options_ui && manifest.options_ui.page;

  for (const [label, ref] of [['popup', popup], ['options', options]]) {
    if (!ref) {
      info(label + ': not declared in manifest (optional)');
    } else {
      const fp = path.join(EXT_DIR, ref);
      if (fs.existsSync(fp)) {
        pass(label + ': ' + ref + ' exists');
      } else {
        warn(label + ': ' + ref + ' declared in manifest but file not found');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: Required assets
// ---------------------------------------------------------------------------

section('4. Required Assets');

// Icons
const iconDir = path.join(EXT_DIR, 'icons');
if (fs.existsSync(iconDir)) {
  const iconFiles = fs.readdirSync(iconDir);
  pass('icons/ directory exists (' + iconFiles.join(', ') + ')');
} else {
  warn('icons/ directory not found - icon16.png, icon48.png, icon128.png required for CWS');
}

// LICENSE
const licenseFile = path.join(REPO_ROOT, 'LICENSE');
if (fs.existsSync(licenseFile)) {
  pass('LICENSE file present');
} else {
  fail('No LICENSE file - required for Chrome Web Store and VS Code Marketplace');
  info('  See docs/LICENSE_DECISION_REQUIRED.md');
}

// ---------------------------------------------------------------------------
// Check 5: Disallowed content in dist/
// ---------------------------------------------------------------------------

section('5. Disallowed Content');

const disallowedPatterns = [
  { pattern: /\.env/, label: '.env file' },
  { pattern: /secret|password|apikey|api_key/i, label: 'potential secret file' },
];

walkDir(DIST_DIR, (fp, name) => {
  for (const { pattern, label } of disallowedPatterns) {
    if (pattern.test(name)) {
      fail('Disallowed file in dist/: ' + name + ' (' + label + ')');
    }
  }
});

// Check for dist-test/ (must not be in production package)
const distTestDir = path.join(EXT_DIR, 'dist-test');
if (fs.existsSync(distTestDir)) {
  info('dist-test/ exists (E2E test build) - confirm it is excluded from CWS ZIP');
  pass('dist-test/ excluded from production dist/ (separate directory)');
} else {
  pass('dist-test/ not present (clean build)');
}

// Check for TypeScript declaration files (unnecessary bloat)
const dtsFiles = [];
walkDir(DIST_DIR, (fp, name) => {
  if (name.endsWith('.d.ts') || name.endsWith('.d.ts.map')) {
    dtsFiles.push(path.relative(EXT_DIR, fp));
  }
});
if (dtsFiles.length > 0) {
  warn(dtsFiles.length + ' TypeScript declaration file(s) in dist/ - exclude from ZIP for size:');
  for (const f of dtsFiles.slice(0, 5)) warn('  ' + f);
  if (dtsFiles.length > 5) warn('  ... and ' + (dtsFiles.length - 5) + ' more');
} else {
  pass('No TypeScript declaration files in dist/');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n');
process.stdout.write('='.repeat(60) + '\n');
if (exitCode === 0) {
  process.stdout.write('[PASS] Browser extension package audit passed.\n');
  process.stdout.write('       Package is ready for beta distribution.\n');
  process.stdout.write('       Run package:browser:beta to create the ZIP.\n');
} else {
  process.stderr.write('[FAIL] Browser extension package audit found issues.\n');
  process.stderr.write('       Resolve FAIL items before CWS submission.\n');
}
process.stdout.write('='.repeat(60) + '\n');

process.exit(exitCode);
