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
  private killSwitchActive = false;
  private capturedEvents: CapturedEvent[] = [];

  constructor() {
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(preferredPort = 19101): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(preferredPort, '127.0.0.1', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
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
