# Threat Model Summary

This is a short index into the threat model. The authoritative, detailed document is [`03-threat-model.md`](./03-threat-model.md); this page exists so the summary is easy to find without reading the full spec.

## Assets being protected

- Developer privacy (source code, prompts, file paths, AI responses — see [`PRIVACY.md`](./PRIVACY.md))
- Advertiser spend (campaign budgets must not be over-spent; ledger must balance)
- Developer earnings (must accurately reflect billable impressions/clicks, not be manipulable by fraud)
- API availability (rate limiting, kill switches)

## Key adversaries considered

| Adversary | Goal | Primary mitigation |
|---|---|---|
| Malicious/compromised extension client | Inflate impression/click counts to earn more, or exfiltrate workspace data via a crafted event payload | Closed Zod schemas + forbidden-field list (server-side, not client-trusted); server-side fraud scoring before any ledger credit |
| Bot / scripted traffic | Drain advertiser budgets, generate fake earnings | `@ad-alt/fraud` signal-based scoring (timing, device-id velocity, impression rate); Redis-backed rate limiting; device-level blocking |
| Malicious API caller (no valid session) | Call authenticated endpoints without a key, or replay another device's key | `requireApiKey` middleware (SHA-256-hashed key lookup, revocation/expiry checks); per-route rate limiting |
| Race conditions on budget/balance | Double-spend a campaign budget via concurrent requests (TOCTOU) | Budget checks and ledger writes run inside a single DB transaction with `SELECT ... FOR UPDATE` row locking |
| Click-URL leakage | Advertiser's destination URL appearing in client-side telemetry or logs | The extension never receives the raw `clickUrl`; `/v1/ads/click/:id` resolves and redirects server-side |
| Floating-point drift in money | Rounding errors accumulating into incorrect balances | All money stored and computed as integer microcents (bigint columns); `verifyBalance()` invariant check before ledger writes |

## Out of scope for the current MVP (see README "Known Limitations")

- OAuth/SSO compromise scenarios (OAuth isn't implemented yet — API-key auth only)
- Payment processor (Stripe) attack surface (payout integration isn't implemented yet)
- Production infrastructure hardening (no production deployment exists yet)

## Related documents

- [`03-threat-model.md`](./03-threat-model.md) — full adversary list, attack trees, and mitigation detail
- [`PRIVACY.md`](./PRIVACY.md) / [`04-privacy-and-telemetry.md`](./04-privacy-and-telemetry.md) — data-minimization guarantees
- [`SECURITY.md`](../SECURITY.md) — vulnerability reporting process, supported versions, safe harbor
