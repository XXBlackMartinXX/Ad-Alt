#!/usr/bin/env node
'use strict';
/**
 * Fixture: mimics just enough of Chrome's DevTools HTTP protocol to let
 * dryrun-001-launch-chrome.js's real CDP-polling code run against it, while
 * NEVER exposing a chrome-extension:// service_worker target -- forcing the
 * deterministic "extension not verified" path without needing a genuinely
 * broken extension or a flaky real-Chrome timing dependency.
 *
 * Used via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH in
 * dryrun-001-pipeline.integration.test.js.
 */
const http = require('http');

const portArg = process.argv.find((a) => a.startsWith('--remote-debugging-port='));
const port = portArg ? Number(portArg.split('=')[1]) : 0;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/json/version') {
    res.end(JSON.stringify({ Browser: 'FakeChrome/1.0', 'Protocol-Version': '1.3' }));
  } else if (req.url === '/json/list' || req.url === '/json') {
    // Only a "page" target -- deliberately no service_worker target ever,
    // for either mode A or mode B.
    res.end(JSON.stringify([{ type: 'page', url: 'https://chatgpt.com/', title: 'fixture -- no content read' }]));
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});

server.listen(port, '127.0.0.1');

// Stay alive until killed (SIGTERM default behavior exits the process).
