'use strict';
/**
 * Shared, pure-function ZIP utilities for the browser-extension packaging
 * and dry-run pipeline. Extracted from what was previously duplicated
 * inline across package-browser-extension.mjs, dryrun-001-prepare.js,
 * check-browser-extension-load-folder.js, audit-browser-extension-zip.js,
 * and dryrun-001-launch-chrome.js -- one implementation, one place to fix
 * a bug, and something Phase 6 can actually unit-test in isolation.
 *
 * CommonJS on purpose: package-browser-extension.mjs (an ES module) loads
 * this via createRequire(), which is the same pattern that file already
 * uses to load manifest.json. Every other consumer is already CommonJS.
 *
 * No external dependencies -- pure Node.js built-ins only (fs, zlib).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// ZIP reading (Central Directory) and per-entry decompression
// ---------------------------------------------------------------------------

/**
 * Reads a ZIP file's Central Directory and returns entry metadata plus the
 * whole-file buffer (needed by readZipEntryContent for decompression).
 * @param {string|Buffer} zipPathOrBuffer
 * @returns {{ entries: Array<{name:string, compMethod:number, compressedSize:number, localHeaderOffset:number}>, buf: Buffer }}
 */
function readZipEntries(zipPathOrBuffer) {
  const buf = Buffer.isBuffer(zipPathOrBuffer) ? zipPathOrBuffer : fs.readFileSync(zipPathOrBuffer);
  const len = buf.length;

  // Find EOCD (End of Central Directory) signature: 0x06054b50
  let eocdOffset = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found -- not a valid ZIP');

  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;

  while (pos < cdEnd) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break; // central dir signature
    const compMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + fileNameLen).toString('utf8');
    entries.push({ name, compMethod, compressedSize, localHeaderOffset });
    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return { entries, buf };
}

/**
 * Decompresses a single ZIP entry's content given the whole-ZIP buffer.
 * Supports method 0 (stored) and method 8 (deflate) -- the only methods
 * `zip` and PowerShell's Compress-Archive ever produce.
 * @param {Buffer} buf
 * @param {{name:string, compMethod:number, compressedSize:number, localHeaderOffset:number}} entry
 * @returns {Buffer}
 */
function readZipEntryContent(buf, entry) {
  const local = entry.localHeaderOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error('Invalid local file header for ' + entry.name);
  }
  const fnLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + fnLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compMethod === 0) return compressed;
  if (entry.compMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error('Unsupported compression method ' + entry.compMethod + ' for ' + entry.name);
}

/**
 * Extracts every file entry in a ZIP to destDir, recreating directory
 * structure. Returns the number of file entries written.
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {number}
 */
function extractZip(zipPath, destDir) {
  const { entries, buf } = readZipEntries(zipPath);
  let count = 0;
  for (const entry of entries) {
    const relName = entry.name.replace(/\\/g, '/');
    if (relName.endsWith('/')) continue; // directory entry, nothing to write
    const destPath = path.join(destDir, relName);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, readZipEntryContent(buf, entry));
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Build-info helpers
// ---------------------------------------------------------------------------

const BUILD_INFO_ENTRY_NAME = 'promptprofit-build-info.json';

/**
 * Finds and parses promptprofit-build-info.json from ZIP entries already
 * read via readZipEntries(). Returns null if absent or unparseable.
 * @param {Array<object>} entries
 * @param {Buffer} buf
 * @returns {object|null}
 */
function extractBuildInfo(entries, buf) {
  const entry = entries.find((e) => e.name.replace(/\\/g, '/') === BUILD_INFO_ENTRY_NAME);
  if (!entry) return null;
  try {
    return JSON.parse(readZipEntryContent(buf, entry).toString('utf8'));
  } catch {
    return null;
  }
}

/** Convenience: reads build-info directly from a ZIP file path. Returns null on any failure. */
function readBuildInfoFromZip(zipPath) {
  try {
    const { entries, buf } = readZipEntries(zipPath);
    return extractBuildInfo(entries, buf);
  } catch {
    return null;
  }
}

/**
 * Pure validation: does this build-info object represent a fresh,
 * correctly-built internal-beta dry-run package for the given commit?
 * No I/O -- easy to unit-test with hand-built fixture objects.
 *
 * @param {object|null} buildInfo
 * @param {{ expectedCommit?: string, expectedBuildMode?: string, requireFallback?: boolean }} expectations
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function validateBuildInfo(buildInfo, expectations = {}) {
  const reasons = [];
  if (!buildInfo || typeof buildInfo !== 'object') {
    return { ok: false, reasons: ['build-info is missing or not an object'] };
  }
  if (expectations.expectedCommit && buildInfo.gitCommit !== expectations.expectedCommit) {
    reasons.push(`gitCommit mismatch: package=${buildInfo.gitCommit} expected=${expectations.expectedCommit}`);
  }
  if (expectations.expectedBuildMode && buildInfo.buildMode !== expectations.expectedBuildMode) {
    reasons.push(`buildMode mismatch: package=${buildInfo.buildMode} expected=${expectations.expectedBuildMode}`);
  }
  if (expectations.requireFallback === true && buildInfo.dryRunDemoFallbackExpected !== true) {
    reasons.push(`dryRunDemoFallbackExpected is ${buildInfo.dryRunDemoFallbackExpected}, expected true`);
  }
  if (expectations.requireFallback === false && buildInfo.dryRunDemoFallbackExpected !== false) {
    reasons.push(`dryRunDemoFallbackExpected is ${buildInfo.dryRunDemoFallbackExpected}, expected false (public-release)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Pure freshness check: is `mtimeMs` at or after `sinceMs`? Extracted as its
 * own function purely so the "was this ZIP produced during this run" logic
 * is independently unit-testable without touching the filesystem.
 */
function isFreshEnough(mtimeMs, sinceMs) {
  return mtimeMs >= sinceMs;
}

module.exports = {
  BUILD_INFO_ENTRY_NAME,
  readZipEntries,
  readZipEntryContent,
  extractZip,
  extractBuildInfo,
  readBuildInfoFromZip,
  validateBuildInfo,
  isFreshEnough,
};
