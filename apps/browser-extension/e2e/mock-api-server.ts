/**
 * Mock HTTP API server for PromptProfit browser extension E2E tests.
 *
 * Handles the subset of the real API that the extension calls:
 *   GET  /health
 *   GET  /v1/ads/decision
 *   POST /v1/events
 *
 * Never logs real user data or secrets.
 */

import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SponsoredMoment {
  adDecisionId: string;
  creativeId: string;
  headline: string;
  body?: string;
  displayUrl: string;
  expiresAt: number; // Unix ms timestamp
}

export interface CapturedEvent {
  receivedAt: number;
  body: unknown;
}

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------

export const DEFAULT_AD_DECISION: SponsoredMoment = {
  adDecisionId: '00000000-0000-0000-0000-000000000001',
  campaignId: '00000000-0000-0000-0000-000000000003',
  creativeId: '00000000-0000-0000-0000-000000000002',
  headline: 'E2E Test Sponsored Headline',
  body: 'This is a test sponsored moment body text.',
  displayUrl: 'example.test/e2e',
  // Will be recalculated at request time so the token never expires mid-test.
  expiresAt: 0,
};

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendEmpty(res: ServerResponse, statusCode: number): void {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Length': '0',
  });
  res.end();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// MockApiServer class
// ---------------------------------------------------------------------------

export class MockApiServer {
  private server: http.Server;
  private port = 0;
  private listening = false;
  private killSwitchActive = false;
  private capturedEvents: CapturedEvent[] = [];

  constructor() {
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Starts the server. Defaults to port 0, which asks the OS to assign an
   * available ephemeral port -- this is the actual fix for a class of test
   * flakiness where two Playwright test files (each running in its own
   * worker process) previously hardcoded the SAME fixed port and raced to
   * bind it, producing EADDRINUSE on whichever worker started second. A
   * caller MAY still pass an explicit port (e.g. for a reproduction test
   * that deliberately wants two servers to collide), but no production
   * spec file should ever do so.
   *
   * Binding directly to port 0 (rather than a separate "find a free port,
   * close it, then reopen on that number" helper) avoids a TOCTOU race of
   * its own: the OS reserves the port for this exact listening socket, so
   * there is no window in which another process could grab it first.
   */
  start(preferredPort = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error): void => {
        this.listening = false;
        reject(err);
      };
      this.server.once('error', onError);
      this.server.listen(preferredPort, '127.0.0.1', () => {
        this.server.removeListener('error', onError);
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.listening = true;
        resolve();
      });
    });
  }

  /**
   * Stops the server. Safe to call even if start() never completed (e.g. a
   * beforeAll that threw before this server bound) or if the server has
   * already been stopped -- both are treated as a no-op success rather than
   * throwing ERR_SERVER_NOT_RUNNING, so afterAll cleanup can always call
   * this unconditionally without producing a second, misleading failure on
   * top of whatever caused start() to fail.
   */
  stop(): Promise<void> {
    if (!this.listening) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        this.listening = false;
        if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /** True once start() has completed successfully and stop() has not been called since. */
  isListening(): boolean {
    return this.listening;
  }

  // -------------------------------------------------------------------------
  // Accessors used by tests
  // -------------------------------------------------------------------------

  getPort(): number {
    return this.port;
  }

  getCapturedEvents(): CapturedEvent[] {
    return [...this.capturedEvents];
  }

  clearEvents(): void {
    this.capturedEvents = [];
  }

  setKillSwitch(active: boolean): void {
    this.killSwitchActive = active;
  }

  /** Reset all server state to defaults (kill-switch off, no captured events). */
  reset(): void {
    this.killSwitchActive = false;
    this.capturedEvents = [];
  }

  // -------------------------------------------------------------------------
  // Request handling
  // -------------------------------------------------------------------------

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Handle CORS pre-flight
    if (req.method === 'OPTIONS') {
      sendEmpty(res, 204);
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (method === 'GET' && url.startsWith('/v1/ads/decision')) {
      this.handleAdDecision(res);
      return;
    }

    if (method === 'POST' && url === '/v1/events') {
      this.handleEvents(req, res);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }

  private handleAdDecision(res: ServerResponse): void {
    if (this.killSwitchActive) {
      sendEmpty(res, 204);
      return;
    }

    const moment: SponsoredMoment = {
      ...DEFAULT_AD_DECISION,
      expiresAt: Date.now() + 3_600_000,
    };

    sendJson(res, 200, { data: moment });
  }

  private async handleEvents(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const raw = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }

      this.capturedEvents.push({ receivedAt: Date.now(), body: parsed });
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 500, { error: 'internal error' });
    }
  }
}
