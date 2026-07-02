'use strict';
/**
 * Minimal single-shot Chrome DevTools Protocol WebSocket client.
 *
 * Used by dryrun-001-launch-chrome.js for exactly two things: (1) probing
 * an extension resource tab's content (Layer 3), and (2) reading
 * extension-owned DOM attributes off the chatgpt.com tab (Layer 4). Both
 * are a single Runtime.evaluate request/response -- no persistent
 * connection, no event subscriptions -- so a bare open/send/receive/close
 * cycle is all that's needed. Uses Node's built-in global WebSocket
 * (stable since Node 22); no external dependency.
 */

/**
 * Sends one CDP command over a fresh WebSocket connection to wsUrl and
 * resolves with the command's `result` field. Always closes the socket
 * before resolving/rejecting, so no connection outlives this call.
 * @param {string} wsUrl - a target's webSocketDebuggerUrl from /json/list
 * @param {string} method - e.g. "Runtime.evaluate"
 * @param {object} params
 * @param {number} timeoutMs
 * @returns {Promise<object>}
 */
function sendCdpCommand(wsUrl, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws && ws.close(); } catch { /* ignore */ }
      reject(new Error('CDP command ' + method + ' timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }

    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify({ id: 1, method, params }));
      } catch (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        reject(e);
      }
    });

    ws.addEventListener('message', (ev) => {
      if (settled) return;
      let msg;
      try {
        msg = JSON.parse(ev.data.toString());
      } catch {
        return; // ignore unparseable frames, keep waiting for the real response
      }
      if (msg.id !== 1) return; // not our response
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (msg.error) {
        reject(new Error('CDP error: ' + JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
    });

    ws.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('CDP WebSocket connection error for ' + method));
    });
  });
}

/**
 * Runs a JS expression in a target's page context via Runtime.evaluate and
 * returns the resulting value as a string (the expression is expected to
 * itself return a JSON.stringify'd string -- see buildRuntimeDomProbeExpression
 * in chrome-launch-utils.js -- so the caller gets a plain string back
 * regardless of how complex the evaluated value is).
 * @param {string} wsUrl
 * @param {string} expression
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
async function evaluateInTarget(wsUrl, expression, timeoutMs) {
  const result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', { expression, returnByValue: true }, timeoutMs);
  if (!result || !result.result || typeof result.result.value !== 'string') {
    throw new Error('Runtime.evaluate did not return a string value');
  }
  return result.result.value;
}

module.exports = {
  sendCdpCommand,
  evaluateInTarget,
};
