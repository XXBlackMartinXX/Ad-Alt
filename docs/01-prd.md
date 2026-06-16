# Ad-Alt: Product Requirements Document

> **Historical naming note:** Authored under the original working name **"Ad-Alt,"** since rebranded **PromptProfit**. Read "Ad-Alt" below as "PromptProfit" wherever it names the product/brand. Retained verbatim for historical record; the GitHub repository name `Ad-Alt` is unrelated and unchanged.

**Document version:** 1.0  
**Date:** 2026-06-15  
**Status:** Approved for engineering use  
**Product name:** Ad-Alt (see naming note above — now PromptProfit)  
**Author:** Ad-Alt Inc. — Product

---

## 1. Problem Statement

AI coding assistants have become a fixture of professional software development. When a developer invokes Claude, Copilot, or any similar tool, they enter a predictable idle window — typically 5 to 30 seconds — during which they are mentally disengaged from their primary task and passively waiting. This idle time currently has zero economic value for the developer.

Simultaneously, developer tools companies, SaaS vendors, and developer education platforms struggle to reach software developers at the moment of highest receptiveness. Existing developer advertising channels (newsletter sponsorships, conference ads, social media) reach developers in non-work contexts or with high ambient noise.

Ad-Alt solves both problems. It converts developer AI wait-states into a value exchange: developers earn passive income, advertisers reach a captive, high-intent professional audience, and the platform mediates this exchange with full transparency, explicit consent, and rigorous privacy guarantees.

The specific gap Ad-Alt fills is trust. Existing monetization experiments in this space have been closed-source, with opaque earnings calculations, unknown fraud handling, and no public privacy commitment. Ad-Alt's differentiation is privacy-by-construction, an open-source extension, an explainable fraud model, and an immutable earnings ledger — all enforced at the architecture level, not just stated in marketing copy.

---

## 2. Market and Category Positioning

**Category:** Developer monetization / developer audience advertising  
**Closest analogs:** Developer newsletter sponsorships (TLDR, Bytes.dev), carbon.txt ads, job board sponsorships  
**Adjacent reference:** kickbacks.ai (public, general concept only — no proprietary implementation copied)

Ad-Alt sits between passive income tools (which pay developers directly) and developer advertising networks (which serve advertisers). It is the only product in this category that:

- Serves ads inside the IDE during verified AI wait-states (not on external websites)
- Pays developers with a per-event ledger they can audit line-by-line
- Publishes its telemetry schema as an open contract
- Uses a Vickrey second-price auction (truthful bidding, no gaming)
- Runs creative review with an SLA before any ad ever serves

**Target customers:**

- **Developer side:** Individual professional developers using VS Code with Claude Code, GitHub Copilot, or other supported AI assistants. Primary geography: North America, Western Europe. Primary segment: software engineers at companies that allow VS Code extensions.
- **Advertiser side:** B2B developer tools companies (Stripe, Vercel, Render, etc.), SaaS platforms targeting engineering teams, developer education companies (courses, bootcamps, certifications). Budget range: $1,000–$50,000 per campaign at MVP.

**Pricing model:**

- Advertisers pay CPM (cost per thousand impressions) or CPC (cost per click) based on campaign type.
- Developers earn 50% of net revenue attributable to their account's impressions and clicks.
- Ad-Alt retains 50% as a platform fee.
- All amounts stored and computed in integer microcents; Stripe disbursements are in cents.

---

## 3. Primary Workflows

### 3.1 Developer Onboarding

1. Developer finds Ad-Alt through marketplace listing, word of mouth, or the Ad-Alt website.
2. Developer installs the VS Code extension from the VS Code Marketplace.
3. Extension shows a welcome panel on first install. Developer reads the plain-English consent notice (what data is collected, what is shown, how earnings work, how to opt out).
4. Developer clicks "Connect account" → OAuth flow opens a browser tab to app.ad-alt.com.
5. Developer signs in (GitHub, Google, or email/password via NextAuth).
6. OAuth token is stored in the OS keychain via VS Code's `SecretStorage` API.
7. Extension downloads a signed remote configuration payload (feature flags, kill-switch state, serving eligibility).
8. Developer dashboard is now accessible at app.ad-alt.com showing a zero-balance ledger.
9. Extension is now active. On the next AI invocation, the first PauseMoment may appear (if inventory is available and the developer's account passes the eligibility check).

### 3.2 PauseMoment Serving (Extension Flow)

1. Developer invokes an AI assistant (types a prompt, hits enter).
2. The active AI adapter detects the transition to "thinking" state using stable VS Code API events (e.g., status bar item changes, extension host events, command completions — per adapter implementation).
3. Adapter emits an `ai_pause_started` event to the extension coordinator.
4. Coordinator checks: (a) developer has opted in, (b) kill-switch is off, (c) local rate limit not exceeded, (d) a minimum pause duration threshold has been met (default: 3 seconds, configurable via remote config).
5. If all checks pass, coordinator sends a `fetch_creative` request to the Ad-Alt API, including: `device_id` (non-PII hash), `session_id` (ephemeral, rotated per VS Code session), `extension_version`, `adapter_type` (e.g., `claude-code`), `idempotency_key` (UUID v4, generated fresh per pause event).
6. API returns a `PauseMoment` payload: `creative_id`, `copy_text` (≤120 chars), `display_url` (optional), `impression_token` (signed, single-use), `ttl_ms`.
7. Extension renders the creative in the VS Code status bar (left zone, below editor area) using `StatusBarItem.text`.
8. Extension reports an `impression` event to the API within 1 second of display, including `impression_token`.
9. If the developer clicks the status bar item, the extension opens the `display_url` in the default browser and reports a `click` event to the API, including `impression_token` and a fresh `click_token`.
10. When the AI response completes, the adapter emits `ai_pause_ended`. The status bar item is cleared.
11. The extension enforces a minimum cool-down period before the next PauseMoment can be shown (default: 30 seconds, remote-configurable).

### 3.3 Advertiser Campaign Creation

1. Advertiser signs up at app.ad-alt.com (separate advertiser role; same auth system).
2. Advertiser creates a campaign: name, budget (in dollars, min $100), start date, end date (optional), max CPM bid.
3. Advertiser writes ad creative: headline (≤80 chars), body (≤120 chars), display URL (≤60 chars), destination URL (full, validated via safe-browsing API).
4. Advertiser submits payment method via Stripe. Budget is charged upfront to a campaign escrow account.
5. Campaign is created in `status: pending_review`. No impressions serve.
6. Advertiser receives email confirmation with expected review time (< 4 business hours).
7. Admin reviews creative (see Section 3.4). If approved, campaign moves to `status: active`.
8. If rejected, advertiser receives email with rejection reason and edit link. Advertiser may resubmit.

### 3.4 Admin Creative Review

1. Admin logs in to the Ad-Alt admin panel at admin.ad-alt.com (separate subdomain, IP-allowlisted, requires 2FA).
2. Admin sees the review queue sorted by submission time ascending. Each row shows: advertiser name, campaign name, submission time, copy preview.
3. Admin clicks a submission to open the full review view: complete creative copy, destination URL (with a safe-link preview), advertiser account age, previous campaign history, and the creative policy checklist.
4. Admin selects one of: **Approve**, **Request Revision** (with required reason from a dropdown + optional free text), or **Reject — Permanent Ban** (for policy violations).
5. Decision is logged with admin identity, timestamp, and reason. The decision is immutable; a correction requires a new entry.
6. Approved campaigns become `status: active` within 60 seconds (the serving engine polls for status changes).

### 3.5 Developer Payout

1. On the 1st of each month, the finance operator triggers the payout batch job from the admin panel.
2. The batch job queries confirmed earnings for each developer with a balance ≥ $10 (minimum payout threshold).
3. For each eligible developer: a debit entry is created in the ledger for the payout amount, a Stripe transfer is initiated to the developer's connected Stripe account (or bank, if ACH is enabled).
4. Stripe webhook confirms success → ledger is updated with Stripe transfer ID.
5. Failed transfers enter a retry queue (3 attempts, 48-hour spacing). After 3 failures, the developer receives an email to update their payout method.
6. Developer sees each payout as a ledger entry in their dashboard: date, amount, Stripe transfer reference.

---

## 4. MVP Scope (Ship in Month 1–2)

The MVP proves the core value loop end-to-end. It is intentionally minimal but complete for a closed beta with ~50 developers and ~3 advertisers.

### MVP Features

| ID | Feature | Description |
|---|---|---|
| MVP-01 | VS Code extension (Claude Code adapter) | PauseMoment serving via Claude Code AI state detection. Status bar rendering. Impression and click telemetry. |
| MVP-02 | Developer OAuth onboarding | GitHub OAuth via NextAuth. SecretStorage for token. Consent screen. |
| MVP-03 | Developer dashboard | Earnings ledger (paginated event log). Account settings. Opt-in/opt-out toggle. |
| MVP-04 | Ad creative API | `fetch_creative` endpoint. Basic weighted selection (no full auction engine yet — manual priority weights). |
| MVP-05 | Impression + click event ingestion | Idempotent event API. Fraud pre-filter (duplicate token rejection). Queue-based async processing. |
| MVP-06 | Advertiser self-serve (basic) | Campaign creation form. Creative submission. Budget charge via Stripe. |
| MVP-07 | Admin creative review | Queue interface. Approve/reject with reason. Status update webhook to serving engine. |
| MVP-08 | Ledger engine | Double-entry ledger. Integer microcents. Per-event earnings split (50/50). |
| MVP-09 | Kill-switch | Remote config payload. Extension respects `serving_enabled: false` and stops serving immediately. |
| MVP-10 | Privacy telemetry schema | Published JSON Schema v1 for all extension-emitted events. No work-product fields. |

### MVP Acceptance Criteria

**MVP-01: VS Code Extension**
- Extension activates without error on VS Code >= 1.85.0 on macOS, Windows, and Linux.
- Claude Code adapter correctly detects pause state within 1 second of AI invocation.
- Status bar item renders copy text within 200ms of `fetch_creative` response.
- Extension handles `fetch_creative` API timeout (> 2s) gracefully: no ad shown, no error surfaced to developer.
- Extension does not crash if the AI adapter cannot detect state (silently no-ops).
- Extension passes VS Code's "restricted mode" workspace trust — no workspace permissions required.
- Telemetry events contain zero file path, buffer content, or prompt data (verified by unit test against schema).

**MVP-02: Developer OAuth**
- OAuth flow opens in system browser (not embedded webview).
- Token stored in VS Code `SecretStorage` (not `globalState`).
- Consent screen displayed before OAuth redirect. Developer must click explicit agree button.
- If OAuth fails or is cancelled, extension falls back to unauthenticated (no ads) mode without error.

**MVP-03: Developer Dashboard**
- Ledger table shows: event type, timestamp, advertiser name, amount in $ (2 decimal places), running balance.
- Opt-out toggle disables ad serving within 1 API polling cycle (≤ 60 seconds).
- Dashboard loads in < 2 seconds on a standard connection.

**MVP-04: Ad Creative API**
- `GET /api/v1/creative` returns a creative within 500ms at p99.
- Returns `204 No Content` when no eligible creative is available (extension handles gracefully).
- Impression token is single-use; second use returns `409 Conflict`.

**MVP-05: Event Ingestion**
- Duplicate impression_token submissions return `200 OK` (idempotent) but do not create a second ledger entry.
- Events missing required fields return `400 Bad Request`.
- Events with invalid signatures return `401 Unauthorized`.

**MVP-06: Advertiser Self-Serve**
- Campaign creation form validates: budget ≥ $100, copy ≤ 120 chars, destination URL is HTTPS, start date is in the future.
- Stripe charge occurs before campaign is created in the database (charge-first pattern prevents free impressions).
- Campaign immediately enters `pending_review` queue after payment confirmation.

**MVP-07: Admin Review**
- Queue updates in real time (or within 30 seconds via polling).
- Rejection without a reason is blocked by form validation.
- Permanent ban sets advertiser account flag immediately, terminates all active campaigns, and initiates Stripe refund of unspent budget.

**MVP-08: Ledger**
- Every billable event produces exactly two ledger entries: one debit (advertiser) and one credit (developer + platform), summing to zero net.
- No floating-point arithmetic anywhere in the financial pipeline (all microcents, integer math).
- Ledger entries are append-only (no UPDATE or DELETE on ledger rows).

**MVP-09: Kill-Switch**
- Setting `serving_enabled: false` in the remote config causes all extensions to stop serving within their next polling interval (≤ 60 seconds).
- Kill-switch is per-adapter-type (can disable Claude Code adapter only without affecting others).

**MVP-10: Privacy Schema**
- JSON Schema file is publicly accessible at `https://ad-alt.com/telemetry-schema/v1.json`.
- Schema enumerates every field name, type, and description. No "additionalProperties: true".
- Extension test suite validates all emitted events against this schema.

---

## 5. V1 Scope (Month 3 — End of Quarter 1)

V1 expands the platform to a public beta with full auction mechanics and a second AI adapter.

| ID | Feature |
|---|---|
| V1-01 | GitHub Copilot adapter (second adapter type) |
| V1-02 | Full Vickrey second-price auction engine |
| V1-03 | Advertiser real-time dashboard (spend, impressions, clicks, CTR) |
| V1-04 | Developer earnings export (CSV + JSON) |
| V1-05 | Developer account deletion (GDPR/CCPA) |
| V1-06 | Fraud scoring pipeline v1 (click velocity, duplicate device, account age signals) |
| V1-07 | Payout disbursement (monthly batch via Stripe Connect) |
| V1-08 | Admin fraud investigation UI (fraud score breakdown per account) |
| V1-09 | Google OAuth (second developer auth method) |
| V1-10 | Remote config v2 (per-adapter kill-switch, min pause duration, cool-down period) |
| V1-11 | Campaign budget hard cap enforcement (ledger-level, not UI-level) |
| V1-12 | Stripe webhook reconciliation (auto-match Stripe events to ledger entries) |

---

## 6. V2 Scope (Month 4–6 — End of Quarter 2)

V2 targets general availability with advanced advertiser tooling and developer growth features.

| ID | Feature |
|---|---|
| V2-01 | Cursor adapter (third adapter type) |
| V2-02 | Advertiser campaign scheduling (start/end time, day-parting) |
| V2-03 | Advertiser audience targeting (geography exclusion, OS exclusion) |
| V2-04 | Advertiser A/B creative testing (2 variants per campaign) |
| V2-05 | Referral program (developers earn bonus for referring other developers) |
| V2-06 | Developer tier system (higher earnings % for high-volume developers) |
| V2-07 | Fraud scoring pipeline v2 (ML-assisted anomaly detection) |
| V2-08 | Advertiser self-serve budget increase (without new campaign) |
| V2-09 | Admin bulk decision tools (batch approve/reject from queue) |
| V2-10 | Public transparency report (monthly aggregate stats: total impressions, total earnings paid out, fraud rate) |
| V2-11 | Webhook outbound for advertisers (impression/click events pushed to advertiser systems) |
| V2-12 | Campaign pause and resume by advertiser |

---

## 7. Feature Priority Matrix

| Feature | Impact | Effort | Priority | Scope |
|---|---|---|---|---|
| VS Code extension (Claude Code) | High | High | P0 | MVP |
| Developer OAuth + consent | High | Medium | P0 | MVP |
| Event ingestion + deduplication | High | Medium | P0 | MVP |
| Ledger engine | High | High | P0 | MVP |
| Creative serving API | High | Medium | P0 | MVP |
| Admin review queue | High | Low | P0 | MVP |
| Kill-switch | High | Low | P0 | MVP |
| Privacy telemetry schema | High | Low | P0 | MVP |
| Advertiser self-serve | Medium | Medium | P1 | MVP |
| Developer dashboard | Medium | Medium | P1 | MVP |
| Auction engine (second-price) | High | High | P1 | V1 |
| Fraud scoring v1 | High | High | P1 | V1 |
| Developer payout (Stripe) | High | Medium | P1 | V1 |
| Data export + deletion | Medium | Medium | P1 | V1 |
| Second adapter (Copilot) | Medium | High | P2 | V1 |
| Advertiser real-time dashboard | Medium | Medium | P2 | V1 |
| A/B creative testing | Low | Medium | P3 | V2 |
| ML fraud scoring | Medium | High | P3 | V2 |
| Developer tier system | Low | Medium | P3 | V2 |

---

## 8. Trust and Safety Requirements

**TS-01 — Creative Policy**  
All ad creative must comply with the Ad-Alt Creative Policy before serving. Prohibited categories: adult content, gambling, illicit substances, weapons, content that defames a competitor, phishing or malware. Prohibited formats: claims using superlatives that cannot be verified ("best," "#1"), countdown urgency ("expires in 2 hours") that is not tied to a real event.

**TS-02 — Review SLA**  
Ad-Alt commits to a ≤ 4-business-hour creative review SLA. If the SLA is breached, the advertiser is notified and the queue is escalated to senior admin.

**TS-03 — Advertiser Banning**  
Any advertiser found to have submitted creative containing malware URLs, illegal claims, or policy-prohibited content categories receives a permanent ban. Banned accounts are flagged at the database level; re-registration under a new email is detected via payment method fingerprint and Stripe identity.

**TS-04 — Developer Fraud Hold**  
Developer accounts flagged by the fraud pipeline are put on a payout hold (not an account ban). Their extension continues to serve (so legitimate activity is not disrupted), but earnings are held pending review. The developer is notified within 24 hours of a hold being applied, with a plain-English explanation.

**TS-05 — Appeal Process**  
Both advertisers and developers have a defined appeal path: email appeals@ad-alt.com with account ID and description. Appeals are reviewed within 3 business days. Appeal decisions are logged and cannot be overridden without a second admin approval.

**TS-06 — Minor Protection**  
Ad-Alt requires age attestation (18+) during account creation. The product is not directed at minors. COPPA does not apply (no services directed at children under 13).

---

## 9. Privacy Requirements

**PR-01 — Telemetry Minimization**  
The extension telemetry schema (published at `https://ad-alt.com/telemetry-schema/v1.json`) enumerates the complete set of fields that may be transmitted. The schema must not include any field that could carry work-product data. Schema updates require a version bump and are reviewed by the product lead before publication.

**PR-02 — Data Residency**  
All developer PII (name, email, payout details) is stored in the primary database region (US-East). Data is not replicated to regions without adequate data protection laws.

**PR-03 — Retention Limits**  
- Session IDs: purged after 90 days.
- IP address hashes: purged after 180 days.
- Event logs (non-PII): retained for 24 months for billing dispute resolution, then purged.
- Ledger entries: retained indefinitely in anonymized form for accounting compliance.

**PR-04 — Third-Party Sharing**  
Developer event data is shared with: (a) Stripe for payment processing, (b) the law enforcement agencies when legally compelled. No other sharing permitted.

**PR-05 — GDPR Compliance**  
EU/EEA developers are presented with a GDPR-compliant consent notice identifying Ad-Alt Inc. as the data controller. They have the right to access, portability, erasure, and objection. Erasure is completed within 30 days.

**PR-06 — CCPA Compliance**  
California residents are informed of their CCPA rights in the privacy notice. Ad-Alt does not "sell" personal information as defined by CCPA. Opt-out of sharing is honored within 15 business days.

**PR-07 — COPPA Non-Applicability**  
Ad-Alt is not directed at children under 13. No COPPA compliance measures are required beyond the age attestation gate at account creation.

---

## 10. Security Requirements

**SEC-01 — Authentication**  
Developer and advertiser authentication uses NextAuth with PKCE-protected OAuth flows. Admin panel uses NextAuth with mandatory TOTP 2FA and IP allowlisting.

**SEC-02 — Authorization**  
All API routes are protected by role-based middleware. Developer tokens can only access developer-scoped endpoints. Advertiser tokens can only access advertiser-scoped endpoints. Admin tokens are issued separately and expire after 8 hours.

**SEC-03 — Input Validation**  
All API request bodies are validated with Zod schemas at the route handler level before any database operation. Invalid input returns `400` immediately.

**SEC-04 — Rate Limiting**  
The event ingestion API is rate-limited per `device_id` and per `developer_id`: maximum 10 impression events per minute. The creative serving API is rate-limited to 1 request per 30 seconds per device. Rate limit state is stored in Redis with sliding windows.

**SEC-05 — Impression Token Integrity**  
`impression_token` values are JWTs signed with an Ed25519 key held server-side. The extension cannot forge valid tokens. Tokens include `exp` (TTL: 5 minutes), `jti` (unique, stored in Redis for single-use enforcement), and `creative_id`.

**SEC-06 — TLS**  
All API and dashboard traffic uses TLS 1.2+. HSTS headers enforced. Extension rejects any non-HTTPS API endpoint configuration.

**SEC-07 — Secret Management**  
Database credentials, Stripe API keys, NextAuth secrets, and signing keys are stored in a secrets manager (e.g., Doppler or HashiCorp Vault). They are never committed to source control or included in Docker images.

**SEC-08 — Dependency Scanning**  
CI pipeline runs `npm audit` and Snyk on every pull request. Critical and high severity vulnerabilities block merge.

**SEC-09 — Penetration Testing**  
A third-party penetration test is conducted before V1 public beta launch.

---

## 11. Compliance Considerations

**GDPR (EU General Data Protection Regulation)**  
Applicable to developers in EU/EEA. Ad-Alt is the data controller. Legal basis for processing: legitimate interests (fraud prevention, platform integrity) and consent (ad serving). DPA (Data Processing Agreement) available on request for enterprise advertiser customers.

**CCPA (California Consumer Privacy Act)**  
Applicable to California residents. Ad-Alt does not sell personal data. Privacy notice links in extension and web dashboard.

**COPPA (Children's Online Privacy Protection Act)**  
Not applicable. Ad-Alt is not directed at children under 13. Age gate at registration.

**PCI DSS**  
Ad-Alt does not store card data. Stripe handles all card processing. Ad-Alt is a Stripe-facilitated merchant. Stripe's PCI DSS SAQ A compliance covers card data handling.

**CAN-SPAM / CASL**  
Transactional emails (receipts, payout confirmations, review decisions) are exempt. Marketing emails use opt-in consent and include an unsubscribe mechanism.

**Money Transmission**  
Ad-Alt acts as a marketplace facilitating payments between advertisers and developers via Stripe Connect. Legal counsel must confirm that this structure qualifies for the marketplace exemption from money transmitter licensing in applicable US states before V1 public launch.

---

## 12. Required Upgraded Features

The following 14 features represent Ad-Alt's differentiated improvements over the general reference product concept. All are required in V1.

1. **Published telemetry schema (PRIV-05)** — Machine-readable JSON Schema at a public URL; versioned; changelog public. Enforced by extension test suite.

2. **Open-source extension (MIT)** — Extension source published to GitHub before public beta. No proprietary components in the extension package.

3. **Explainable fraud scoring** — Fraud score is always a named sum of components (`click_velocity`, `account_age_penalty`, `device_share_penalty`, etc.). Admin UI shows component breakdown. Developer notification includes component list.

4. **Second-price (Vickrey) auction** — Advertisers bid max CPM. Clearing price is the second-highest bid plus $0.01. Auction settles at campaign creation (reserved inventory model in V1). Advertisers are billed clearing price, not max bid.

5. **Immutable double-entry ledger** — Schema enforces append-only with a database-level trigger rejecting UPDATE/DELETE on ledger rows. Every transaction has a matching debit and credit.

6. **Integer microcents arithmetic** — All earnings splits, campaign charges, and payout calculations use integer arithmetic in units of 1/1,000,000 USD. No floating-point in the financial pipeline.

7. **Exact spend/earnings reconciliation** — Finance operator can run a reconciliation job for any date range. Output: total advertiser spend, total developer earnings, total platform fees, total fraud reversals. Must sum to zero.

8. **Brand-safety creative review SLA** — Every creative decision is logged with reviewer identity and timestamp. SLA breach alert triggers at 3 hours 45 minutes. Public SLA commitment: < 4 business hours.

9. **Full data export and deletion (GDPR/CCPA)** — Developer dashboard: one-click export in JSON and CSV. Deletion request: queued within 24 hours, completed within 30 days, confirmation email sent. Admin can verify deletion with a tombstone record.

10. **Degraded-mode stability** — Any AI adapter error, network failure, or API error produces zero ads and zero editor errors. The extension's main try/catch boundaries are tested with injected failures in the test suite.

11. **Per-event earnings ledger visibility** — Developer dashboard shows every individual impression and click event with amount, timestamp, creative copy (first 40 chars), and advertiser name. No aggregate-only view.

12. **Stable-API-only extension** — Extension manifest declares no permissions beyond `storage`. No DOM manipulation. No use of VS Code private APIs. Verified by automated lint rule (`no-vscode-private-api`).

13. **Device-level deduplication** — `device_id` is a non-PII hash (HMAC-SHA256 of machine UUID, salted with the developer account ID). Per-device impression cap (default: 500/day) enforced server-side. Multiple accounts on one device share the cap.

14. **Advertiser budget hard cap at ledger level** — Campaign has a `budget_microcents` field. The ad-serving engine checks remaining budget before issuing an `impression_token`. If remaining budget < CPM unit cost, the creative is not served. This check is performed inside a database transaction to prevent over-serving.

---

## 13. Open Questions

| ID | Question | Owner | Target Resolution |
|---|---|---|---|
| OQ-01 | Which US states require money transmitter licensing for the Stripe Connect marketplace model? | Legal | Before V1 public beta |
| OQ-02 | Should the minimum payout threshold be $10 or $25? Lower threshold increases Stripe transfer fees. | Product/Finance | Before payout implementation |
| OQ-03 | What is the right minimum pause duration before a PauseMoment is shown? 3s may be too short for fast models; 5s may miss short pauses. | Product/Data | After MVP telemetry data available |
| OQ-04 | Should the extension telemetry schema be governed by a public RFC process (GitHub issues) or kept internal with public publication? | Product/Engineering | Before V1 |
| OQ-05 | Is a second-price auction the right model for reserved inventory, or should V1 use a fixed CPM rate card until volume justifies an auction? | Product | Before V1 auction implementation |
| OQ-06 | Should advertiser creative review be manual-only or augmented with an automated pre-screening step (URL malware check, copy policy classifier)? | Product/Trust | Before admin tooling implementation |
| OQ-07 | What is the right click cool-down period to prevent accidental double-clicks being billed as two events? | Engineering | Before MVP launch |
| OQ-08 | Does NextAuth support the Stripe Connect OAuth flow for developer payout account linking, or do we need a separate flow? | Engineering | Before payout implementation |

---

## 14. Explicit Assumptions

1. **VS Code Marketplace publishing** — Ad-Alt will be able to publish the extension to the VS Code Marketplace without policy violations. The extension does not inject content into editor buffers or use restricted APIs.

2. **Stripe Connect availability** — Stripe Connect (Custom or Express accounts) is available in the target developer geographies (US, CA, EU, AU) for payout processing.

3. **AI adapter feasibility** — VS Code stable APIs provide sufficient signal to detect when Claude Code and GitHub Copilot are in a "thinking" state. If stable APIs do not provide this signal, the adapter will gracefully no-op.

4. **Developer willingness** — At least 60% of developers who install the extension will opt in after reading the consent notice, based on the value proposition of passive earnings with full privacy transparency.

5. **Advertiser demand** — At least 3 paying advertisers (minimum $1,000 campaign each) can be secured before MVP launch through direct outreach, sufficient to fund the developer earnings for the beta cohort.

6. **Legal structure** — The Stripe Connect marketplace structure exempts Ad-Alt from money transmitter licensing in the US. This assumption must be confirmed by counsel before V1 public launch (see OQ-01).

7. **No AI model data** — The AI state detection does not require reading the AI model's response content. It relies only on observable VS Code editor state events.
