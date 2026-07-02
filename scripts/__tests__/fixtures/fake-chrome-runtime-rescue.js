#!/usr/bin/env node
'use strict';
/**
 * Fixture: mimics just enough of Chrome's DevTools HTTP + WebSocket protocol
 * to exercise dryrun-001-launch-chrome.js's Layer 4 runtime-rescue path end
 * to end via the real CLI (not a reimplemented copy of its decision logic).
 *
 * Deliberately exposes NO chrome-extension:// CDP target at all (Layer 1
 * always empty) and no real Preferences file will ever exist for this fake
 * profile dir (Layer 2 always empty) -- exactly the "wrong predicted id"
 * scenario a real Windows session hit. The one "page" target's WebSocket
 * responds to Runtime.evaluate as if the extension-owned banner and
 * diagnostics panel ARE genuinely rendered there, proving the launcher's
 * Layer 4 rescue check (and nothing else) is what flips the final result
 * away from BLOCKED_EXTENSION_LOAD.
 *
 * Used via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH in
 * dryrun-001-pipeline.integration.test.js.
 */
const http = require('http');
const crypto = require('crypto');

const portArg = process.argv.find((a) => a.startsWith('--remote-debugging-port='));
const port = portArg ? Number(portArg.split('=')[1]) : 0;

const PAGE_TARGET_ID = 'fake-page-target-1';
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const DOM_PROBE_SUCCESS = JSON.stringify({
  bannerPresent: true,
  bannerVisible: true,
  diagnosticsPresent: true,
  diagStatusLabel: 'Banner visible',
  diagLastErrorCode: 'none',
  diagBannerRendered: 'true',
  diagBannerVisible: 'true',
  diagDemoFallbackActive: 'true',
  diagDemoFallbackRendered: 'true',
  diagKillSwitchActive: 'false',
  diagExtensionLoaded: 'true',
});

function targetDescriptor() {
  return {
    id: PAGE_TARGET_ID,
    type: 'page',
    url: 'https://chatgpt.com/',
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${PAGE_TARGET_ID}`,
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/json/version') {
    res.end(JSON.stringify({ Browser: 'FakeChrome/1.0', 'Protocol-Version': '1.3' }));
  } else if (req.url === '/json/list' || req.url === '/json') {
    res.end(JSON.stringify([targetDescriptor()]));
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});

// ---------------------------------------------------------------------------
// Minimal RFC 6455 WebSocket server -- just enough to accept one connection,
// receive text frames (client->server frames are always masked), and send
// back an unmasked text-frame response containing a CDP Runtime.evaluate
// result for ANY method the launcher sends (this fixture doesn't need to
// actually distinguish methods; the launcher only ever sends one command
// per connection and closes it).
// ---------------------------------------------------------------------------
function acceptKey(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

function encodeTextFrame(payload) {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

function decodeTextFrame(buf) {
  if (buf.length < 2) return null;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  let payload;
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    offset += 4;
    payload = Buffer.from(buf.subarray(offset, offset + len));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  } else {
    payload = buf.subarray(offset, offset + len);
  }
  return payload.toString('utf8');
}

server.on('upgrade', (req, socket) => {
  const clientKey = req.headers['sec-websocket-key'];
  const accept = acceptKey(clientKey);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n',
  );

  socket.on('data', (buf) => {
    if (buf.length < 1) return;
    const opcode = buf[0] & 0x0f;
    // 0x8 = close frame. A real client (and real Chrome) expects the server
    // to echo a close frame back before it considers the connection fully
    // closed -- skipping this leaves the client's ws.close() call waiting
    // forever for an ack that never comes, which keeps that WebSocket's
    // underlying socket (and therefore the launcher's Node process) alive
    // indefinitely even though the launcher already got its result and
    // moved on. Must ack-and-end here so ws.close() actually completes.
    if (opcode === 0x8) {
      try {
        socket.write(Buffer.from([0x88, 0x00])); // empty close frame, unmasked (server->client)
      } catch { /* socket may already be gone */ }
      socket.end();
      return;
    }
    if (opcode === 0x9) {
      // 0xA = pong, echoing back an unmasked empty pong is enough to keep a
      // client-side ping/pong keepalive (if any) from timing out.
      try { socket.write(Buffer.from([0x8a, 0x00])); } catch { /* ignore */ }
      return;
    }
    const message = decodeTextFrame(buf);
    if (!message) return;
    let req2;
    try {
      req2 = JSON.parse(message);
    } catch {
      return;
    }
    if (req2.method === 'Runtime.evaluate') {
      const response = { id: req2.id, result: { result: { type: 'string', value: DOM_PROBE_SUCCESS } } };
      socket.write(encodeTextFrame(JSON.stringify(response)));
    }
  });
});

server.listen(port, '127.0.0.1');

// Stay alive until killed (SIGTERM default behavior exits the process).
