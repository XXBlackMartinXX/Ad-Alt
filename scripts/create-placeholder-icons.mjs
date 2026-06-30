/**
 * Generate beta-placeholder PNG icons for the browser extension.
 *
 * These are ORIGINAL, programmatically-generated solid-color squares.
 * They contain NO third-party logos, fonts, or copyrighted assets.
 *
 * IMPORTANT: These are BETA PLACEHOLDERS only.
 * Final brand assets must be created and reviewed before Chrome Web Store
 * submission. See docs/PUBLIC_RELEASE_READINESS_MATRIX.md.
 *
 * Usage:
 *   node scripts/create-placeholder-icons.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { deflateSync } from 'zlib';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = join(__filename, '..');
const REPO_ROOT  = join(__dirname, '..');
const ICONS_DIR  = join(REPO_ROOT, 'apps', 'browser-extension', 'icons');

// ---------------------------------------------------------------------------
// CRC32 (required for PNG chunk integrity)
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// PNG chunk builder
// ---------------------------------------------------------------------------

function pngChunk(typeStr, data) {
  const type   = Buffer.from(typeStr, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([lenBuf, type, data, crcBuf]);
}

// ---------------------------------------------------------------------------
// Minimal valid PNG: solid RGB color, no alpha, no text chunks
// ---------------------------------------------------------------------------

function createSolidColorPng(width, height, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 4 bytes width + 4 bytes height + bit depth(8) + color type(2=RGB)
  //        + compression(0) + filter(0) + interlace(0)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // color type: RGB (no alpha)
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  // Raw image data: for each row, filter byte (0x00 = None) then RGB pixels
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const base = y * rowSize;
    raw[base] = 0; // filter method: None
    for (let x = 0; x < width; x++) {
      raw[base + 1 + x * 3]     = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Main: generate placeholder icons
// ---------------------------------------------------------------------------

// Placeholder color: #1D4ED8 (a neutral blue, visually distinct from white/grey)
// Intentionally chosen as a beta placeholder — NOT a final brand decision.
const R = 0x1D, G = 0x4E, B = 0xD8;

if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
  process.stdout.write('[OK] Created icons/ directory\n');
}

const SIZES = [16, 48, 128];
for (const size of SIZES) {
  const png     = createSolidColorPng(size, size, R, G, B);
  const outPath = join(ICONS_DIR, `icon${size}.png`);
  writeFileSync(outPath, png);
  process.stdout.write('[OK] Created placeholder icon: icons/icon' + size + '.png (' + png.length + ' bytes)\n');
}

process.stdout.write('\n');
process.stdout.write('[!!] IMPORTANT: These are BETA PLACEHOLDER icons (solid #1D4ED8 squares).\n');
process.stdout.write('[!!] They are original, programmatically generated, with no third-party assets.\n');
process.stdout.write('[!!] Final brand icons must be reviewed and approved before public store submission.\n');
process.stdout.write('[!!] See docs/PUBLIC_RELEASE_READINESS_MATRIX.md for icon requirements.\n');
