'use strict';
/**
 * Windows-safe dynamic import of an absolute filesystem path.
 *
 * Node's ESM loader requires dynamic `import()` specifiers to be either a
 * bare/relative module specifier or a valid URL. A raw absolute path works
 * by accident on POSIX (`/home/user/repo/dist/index.js` is close enough to
 * a URL that some resolvers tolerate it) but fails hard on Windows: a path
 * like `C:\Users\dev\repo\dist\index.js` gets parsed as a URL with scheme
 * `c:`, which the ESM loader rejects with:
 *
 *   Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in:
 *   file, data, and node are supported by the default ESM loader.
 *
 * `pathToFileURL(absPath).href` converts an absolute filesystem path (on
 * any platform) into a correct `file://` URL, handling drive letters,
 * backslashes, and spaces correctly. Never build a `file://` URL by string
 * concatenation (`file://${path}`) -- that breaks on spaces and backslashes
 * and does not percent-encode reserved characters.
 *
 * Usage:
 *   const { importFile } = require('./lib/import-file.js');
 *   const mod = await importFile(path.join(REPO_ROOT, 'packages/ledger/dist/index.js'));
 */

const { pathToFileURL } = require('node:url');

/**
 * @param {string} absPath Absolute filesystem path to an ESM module.
 * @returns {Promise<any>} The dynamically imported module namespace.
 */
function importFile(absPath) {
  return import(pathToFileURL(absPath).href);
}

/**
 * Pure helper (exported separately for unit testing without triggering an
 * actual import): converts an absolute filesystem path to a `file://` URL
 * string, correct on both POSIX and Windows-style paths.
 *
 * @param {string} absPath
 * @returns {string}
 */
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

module.exports = { importFile, toFileUrl };
