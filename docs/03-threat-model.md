# Ad-Alt Threat Model

**Version:** 1.0  
**Last Updated:** 2026-06-15  
**Classification:** Internal – Engineering  

---

## Overview

This document enumerates the threats specific to Ad-Alt's architecture: a privacy-preserving platform that monetizes developer AI wait-states through sponsored text messages delivered via a VS Code extension. The platform uniquely intersects three trust boundaries: the developer's local machine, the Ad-Alt cloud API, and the advertiser's campaign. Each boundary introduces distinct adversarial surfaces.

Threat ratings use a two-axis system:

- **Likelihood**: Low / Medium / High (probability this attack is attempted at scale)
- **Impact**: Low / Medium / High (financial, reputational, or privacy consequence if the attack succeeds)

---

## Threat Catalog

---

### T-01 — Fake Impressions (Scripted Wait-State Detection)

**Attack Description**  
An adversary writes a script that calls the extension's internal impression-reporting surface or the ingestion API endpoint directly, fabricating impression events without any genuine AI wait-state occurring. The goal is to inflate impression counts so that the developer account earns more revenue than was legitimately generated, or to drain an advertiser's budget without genuine exposure.

**Likelihood:** High  
**Impact:** High  

**Countermeasures**

1. **Signed event envelopes.** Every impression event is signed with an HMAC derived from a per-device symmetric key and a server-issued per-session nonce. Raw HTTP calls without a valid signature are rejected at the ingestion boundary (HTTP 401).

2. **Wait-state authenticity heuristics.** The server validates that the `wait_start_ms` and `wait_end_ms` timestamps bracket a plausible AI inference latency window (configurable floor: 800 ms; configurable ceiling: 120 000 ms). Events outside this window are automatically flagged in `fraud_signals` with `signal_type = 'implausible_duration'`.

3. **Correlated extension heartbeat.** The extension emits a heartbeat event every 30 seconds when active. If impression events arrive from a device ID with no corresponding heartbeat in the preceding 60-second window, the event is quarantined pending fraud review.

4. **Statistical anomaly detection.** A nightly job computes each developer's impression-per-active-hour ratio and flags accounts whose ratio exceeds the 99th-percentile cohort value by more than 3 standard deviations.

5. **Rate limiting at the API gateway.** The ingestion endpoint enforces per-device-ID rate limits (max 1 impression event per 5 seconds, max 600 per hour) backed by Redis sliding-window counters. Excess events receive HTTP 429 and are not processed.

6. **Advertiser budget circuit breakers.** Spend against any single campaign is capped at 2× the daily budget before human review is required, preventing a scripted attack from draining a campaign entirely before detection.

---

### T-02 — Fake Clicks (Automated Clicking)

**Attack Description**  
An adversary automates click events on sponsored messages, either by scripting calls to the click ingestion endpoint or by using UI automation (e.g., xdotool, AppleScript) against the VS Code panel. Click events are higher-value than impressions, so click fraud has outsized financial impact.

**Likelihood:** Medium  
**Impact:** High  

**Countermeasures**

1. **Click-to-impression binding.** A click event is only valid if it references a `impression_event_id` that exists in the database, belongs to the same `device_id`, was rendered within the last 300 seconds, and has not already been clicked. Orphaned click events are rejected.

2. **Click velocity limiting.** A developer account may register at most 3 clicks per 15-minute window per campaign. Excess clicks are recorded as `fraud_signals` with `signal_type = 'click_velocity'` and withheld from billing.

3. **Inter-click timing analysis.** Clicks arriving at inhuman speeds (sub-200 ms after impression render) are flagged. The extension records the render timestamp at display time; the server computes the delta and rejects clicks where `click_ms - render_ms < 200`.

4. **Click-through-rate outlier detection.** CTR per developer account is monitored. Accounts with CTR > 5× the campaign average trigger a fraud_review workflow.

5. **No click incentive in developer UX.** The extension displays sponsored text but never communicates to the developer that clicking generates income. This reduces the motivation for manual click farming.

---

### T-03 — Scripted AI Wait-States (Artificial Delay Injection)

**Attack Description**  
A sophisticated adversary modifies a local AI extension (e.g., GitHub Copilot) to inject artificial delays — pausing completion responses to manufacture wait-states that trigger Ad-Alt's impression logic. This could be achieved via a malicious VS Code extension that intercepts messages on the same language model communication channel.

**Likelihood:** Low  
**Impact:** Medium  

**Countermeasures**

1. **Adapter passivity.** Ad-Alt's wait-state adapters use only stable, documented VS Code APIs (`window.activeTextEditor`, `languages.registerCompletionItemProvider` status listeners, `workspace.onDidChangeTextDocument`). They do not intercept message traffic. Artificial delay injection in another extension does not change what Ad-Alt observes unless the target extension's own status events fire — which they would not for injected delays that bypass the completion pipeline.

2. **Wait-state duration ceiling.** Wait states lasting longer than 120 seconds are treated as session-idle events, not impression-eligible events. Artificially long delays are thus not monetizable.

3. **Completion-event correlation.** The adapter waits for the AI extension's "response received" event before closing the wait-state window. If no completion event arrives within the ceiling window, the wait-state is marked as abandoned and is not eligible for impression billing.

4. **Volume anomaly detection.** Developers with an unusually high count of abandoned wait-states (no completion event) relative to total wait-states are flagged for review. Artificial delay injection typically produces abandoned wait-states.

---

### T-04 — Multi-Account Abuse (One Person, Many Accounts)

**Attack Description**  
An adversary creates many developer accounts to multiply impression revenue. Each account appears legitimate in isolation but is controlled by the same person. The goal is to multiply payout eligibility without increasing genuine audience reach.

**Likelihood:** Medium  
**Impact:** Medium  

**Countermeasures**

1. **Device-account binding.** Each device registers a pseudonymous device ID (see Privacy Document §4). A device ID may only be associated with one active developer account at a time. Attempts to associate an already-bound device with a second account trigger a `fraud_signal` of type `device_account_collision`.

2. **Payout KYC gating.** Payouts require verified identity (legal name + tax ID via Stripe Identity). The same tax ID cannot be associated with more than one active payout-eligible account.

3. **Email domain velocity.** More than 3 accounts created from the same email domain within 7 days (excluding major providers) triggers a fraud review queue entry.

4. **IP-to-account clustering (metadata only).** While raw IPs are never stored (see Privacy Document §5), the hashed IP subnet (/24) is recorded at registration time for clustering purposes only. More than 5 accounts from the same hashed /24 within 30 days triggers a review.

5. **Behavioral fingerprint clustering.** Nightly jobs cluster device behavior profiles (session timing patterns, wait-state duration distributions). Clusters with high similarity across multiple accounts are flagged for manual review.

---

### T-05 — Device Spoofing (Fake Device IDs)

**Attack Description**  
An adversary generates synthetic device IDs, either by reverse-engineering the device ID generation algorithm or by requesting many IDs from the registration endpoint. Each fake device ID is used to generate a separate impression stream, bypassing per-device rate limits.

**Likelihood:** Medium  
**Impact:** High  

**Countermeasures**

1. **Challenge-response device registration.** Device registration requires a cryptographic challenge-response round-trip. The server issues a time-limited (30-second) challenge nonce; the client must return `HMAC-SHA256(challenge_nonce, device_secret)` where `device_secret` is derived from a TEE (Trusted Execution Environment) or OS keychain. Synthetic IDs cannot complete this round-trip without a legitimate OS-backed secret.

2. **Per-device impression rate limits.** Even if a device ID is successfully spoofed, each device ID is subject to the same rate limits as legitimate devices (see T-01), preventing exponential impression inflation from a fixed number of spoofed IDs.

3. **Device registration velocity limiting.** No more than 5 new device registrations are permitted per unique account per 7-day rolling window. Excess registrations are rejected with HTTP 429.

4. **Anomalous device metadata detection.** The registration payload includes VS Code version, OS platform, and extension host version. Synthetic devices frequently present implausible combinations (e.g., VS Code versions that do not match any release date) and are flagged.

---

### T-06 — Event Replay (Resending Old Captured Events)

**Attack Description**  
An adversary captures a legitimate event (impression, viewability, click) by intercepting HTTP traffic or inspecting the extension's outbound requests, then replays the same event payload multiple times to generate duplicate revenue.

**Likelihood:** Medium  
**Impact:** Medium  

**Countermeasures**

1. **Idempotency keys with expiry.** Every event payload includes a UUID `idempotency_key` generated at event creation time. The ingestion API records each key in the `event_deduplication_keys` table with a TTL of 7 days. Replayed events with a key already present receive HTTP 200 (idempotent success) but are not re-processed into the ledger.

2. **Timestamp drift rejection.** Events whose `event_timestamp` is more than 5 minutes in the past or any time in the future are rejected with HTTP 422. Captured events replayed hours later fail this check.

3. **Session nonce binding.** The HMAC signature on each event (see T-01) incorporates a server-issued session nonce that expires after the session ends. A valid replay requires both the idempotency key to be fresh AND the session nonce to still be valid — a narrow window.

4. **TLS everywhere.** All communication between extension and API is over TLS 1.3 with certificate pinning in the extension bundle. Man-in-the-middle interception of events is not feasible without the pinned certificate private key.

---

### T-07 — Event Tampering (Modifying Event Fields)

**Attack Description**  
An adversary intercepts an event in transit or at rest and modifies fields — for example, changing a `campaign_id` to redirect spend, inflating `duration_ms` to push an impression into a higher billing tier, or changing a `developer_account_id` to redirect revenue.

**Likelihood:** Low  
**Impact:** High  

**Countermeasures**

1. **HMAC over canonical field set.** The event signature covers a deterministic canonical serialization of all billing-relevant fields: `event_id`, `event_type`, `device_id`, `campaign_id`, `creative_id`, `impression_id` (for click/viewability events), `event_timestamp`, and `session_nonce`. Any modification to a covered field invalidates the signature.

2. **TLS in transit.** Events are transported over TLS 1.3, preventing in-transit modification.

3. **Schema validation with strict unknown-field rejection.** The ingestion endpoint uses Zod schemas in strict mode. Events with unexpected fields are rejected, preventing field injection attacks.

4. **Immutable event log.** Ingested events are written to an append-only PostgreSQL table with row-level security that permits only INSERT to the ingestion service role. No UPDATE or DELETE is permitted on ingested events; corrections require compensating entries.

---

### T-08 — VPN / Proxy / Network Rotation

**Attack Description**  
An adversary uses VPN services, open proxies, Tor, or residential proxy networks to rotate IP addresses, evading rate limits and IP-based fraud detection signals, or to fake geographic presence in a high-CPM market.

**Likelihood:** High  
**Impact:** Medium  

**Countermeasures**

1. **Device-centric rate limiting.** Primary rate limits are keyed on device ID and account ID, not on IP address. VPN rotation does not help an adversary who has already saturated device-level limits.

2. **IP reputation scoring (metadata only, no storage).** At event ingestion time, the server queries a commercial IP reputation service (e.g., IPQualityScore or MaxMind minFraud). The resulting reputation score (0–100) and risk flags (VPN, datacenter, Tor exit, proxy) are stored as a `fraud_signal` on the event. Raw IP is never stored (see Privacy Document §5). Events from high-risk IPs are flagged but not automatically rejected, to avoid false positives from legitimate developers on corporate VPNs.

3. **Geo consistency checks.** The inferred country from the IP reputation service is compared against the device registration country. Persistent mismatches (>5 events flagged across a 7-day window) trigger a fraud review.

4. **Datacenter IP rejection for new registrations.** Device registration attempts originating from known datacenter IP ranges are rejected with a soft error and placed in a manual review queue before the device ID is provisioned.

---

### T-09 — Advertiser Malicious URLs (Phishing / Malware)

**Attack Description**  
A malicious advertiser submits a campaign creative that contains a URL pointing to a phishing page, malware download, or other harmful destination. Developers who click the sponsored link are sent to the harmful URL.

**Likelihood:** Medium  
**Impact:** High  

**Countermeasures**

1. **URL allowlist and format validation.** Creative URLs must use HTTPS, must resolve to a non-private IP address, and must pass a regex pattern validation that rejects known obfuscation patterns (e.g., `@`-symbol tricks, homoglyph domains).

2. **Google Safe Browsing API check at creative submission.** Every URL submitted in a creative is checked against the Google Safe Browsing API before the creative enters the review queue. A positive match results in immediate creative rejection and a `creative_review` record with `rejection_reason = 'malicious_url'`.

3. **Periodic re-scan.** Approved creatives have their URLs re-scanned weekly against Safe Browsing and VirusTotal's URL scanner. If a URL is retroactively flagged, the creative is immediately paused and a fraud_review is opened.

4. **URL redirect tracking.** Click events open the destination URL via a server-side redirect (`/r/{click_id}`) that logs the click before forwarding. This provides an interception point for future URL re-validation and enables retroactive analysis if a URL turns malicious post-approval.

5. **Advertiser identity verification.** Advertisers must complete email verification and provide a valid payment method before campaigns go live. This creates accountability and a paper trail.

---

### T-10 — Phishing Creatives (Deceptive Ad Text)

**Attack Description**  
A malicious advertiser submits creative text that impersonates a trusted entity (e.g., "Your GitHub account requires immediate action — click here") to trick developers into clicking under false pretenses.

**Likelihood:** Medium  
**Impact:** Medium  

**Countermeasures**

1. **Human moderation of all creatives.** No creative is served until it has been approved by a human moderator. The creative review workflow (see `creative_reviews` entity) requires explicit approval before the creative enters active rotation.

2. **Moderation policy document.** A clear creative policy document prohibits impersonation of companies, urgency-based manipulation language, false claims of system alerts, and misleading calls to action. Moderators are trained against this policy.

3. **Automated pre-screening.** Before entering the human review queue, creative text is scanned with a classifier trained to detect phishing language patterns (urgency, impersonation, credential requests). High-confidence flags are auto-rejected; borderline cases are fast-tracked to senior moderation.

4. **Advertiser reputation scoring.** Advertisers who have had creatives rejected for policy violations receive heightened scrutiny on future submissions. Three policy violations result in account suspension.

5. **Developer reporting mechanism.** Developers can report a sponsored message as suspicious from within the VS Code extension. Reports are fed into the fraud review queue with high priority.

---

### T-11 — Admin Privilege Abuse

**Attack Description**  
A malicious or compromised admin user abuses their elevated privileges to approve fraudulent payouts, modify ledger entries, escalate developer balances, approve malicious creatives, or exfiltrate the user database.

**Likelihood:** Low  
**Impact:** High  

**Countermeasures**

1. **Immutable admin audit log.** Every admin action (creative approvals, payout approvals, ledger adjustments, account suspensions) is written to `admin_audit_logs` with the admin's user ID, timestamp, action type, target entity, and before/after state. This log is append-only at the database level.

2. **Least-privilege role structure.** Admin roles are granular: `moderator` (creative review only), `finance_reviewer` (payout review only), `fraud_analyst` (fraud signal review only), `super_admin` (account management + role assignment). No single role has access to all sensitive functions.

3. **Two-person approval for large payouts.** Payout batches above a configurable threshold (default: $500 per batch) require approval from two distinct admin accounts before disbursement is initiated via Stripe.

4. **Regular access reviews.** Admin account list is reviewed quarterly. Accounts inactive for 90 days are automatically deprovisioned.

5. **Separate admin authentication.** Admin panel uses a separate NextAuth provider configuration with mandatory MFA (TOTP or hardware key). Admin sessions are valid for 4 hours maximum.

6. **Database-level row security.** Admin operations that must modify ledger entries or balances go through dedicated stored procedures that enforce invariants (e.g., double-entry balance) and log compensating entries rather than direct UPDATE statements.

---

### T-12 — Payout Fraud (Invalid Payout Claims)

**Attack Description**  
A developer inflates their balance through impression fraud (see T-01, T-02) then requests a payout for the fraudulently earned balance. Alternatively, a developer attempts to manipulate payout thresholds or request payouts before earned funds are confirmed.

**Likelihood:** Medium  
**Impact:** High  

**Countermeasures**

1. **Payout hold period.** Earned revenue enters a holding state for 30 days before becoming payout-eligible. This window allows fraud detection jobs to run and flag suspicious earnings before they can be withdrawn.

2. **Fraud score threshold gate.** Developers with a fraud score above a configurable threshold have their payout requests automatically held pending human review, regardless of balance age.

3. **Tax ID verification via Stripe Identity.** Payouts above $600/year (IRS Form 1099-NEC threshold) require tax ID verification. This links payouts to verified legal identities.

4. **Incremental payout limits.** First payout is capped at $50. Subsequent payout limits increase based on account history, up to a maximum per-payout limit of $5,000. Unusual jumps in payout amounts trigger manual review.

5. **Ledger reconciliation.** Before any payout is approved, the finance system runs a reconciliation check: the sum of all credit ledger entries for the developer must equal the claimed balance. Any discrepancy blocks the payout.

---

### T-13 — Data Exfiltration (Stealing Developer Data)

**Attack Description**  
An attacker who gains unauthorized access to the Ad-Alt backend (via SQL injection, SSRF, credential theft, or supply chain compromise) attempts to exfiltrate the developer database, including account information, device IDs, and any stored behavioral data.

**Likelihood:** Low  
**Impact:** High  

**Countermeasures**

1. **Minimal data collection.** Ad-Alt's privacy-by-construction design means developer behavioral data is extremely limited: no source code, file paths, prompt text, or AI response content is ever stored (see Privacy Document). Exfiltration yields little sensitive data beyond account metadata.

2. **Field-level encryption.** Sensitive fields (tax IDs, payout bank details) are encrypted at rest using AES-256-GCM with application-layer keys managed by a dedicated secrets manager (AWS KMS or equivalent). Database compromise alone does not expose plaintext sensitive values.

3. **Pseudonymous device IDs.** Device IDs are opaque UUIDs with no direct linkage to developer identity in the same table. Joining device IDs to accounts requires access to a separate table with its own RLS policy.

4. **Input validation and parameterized queries.** All database access goes through Drizzle ORM with parameterized queries. No raw SQL string interpolation is permitted in application code. CI enforces this with a lint rule.

5. **Network segmentation.** The PostgreSQL database is not reachable from the public internet. API servers access the database only through a private VPC subnet. Bastion host access to the database requires MFA and is logged.

6. **Rate limiting on bulk read endpoints.** Admin APIs that can return lists of users or events are rate-limited and paginated. Bulk export requires special permission and is logged in the admin audit trail.

---

### T-14 — Extension Compromise (Supply Chain Attack on the .vsix)

**Attack Description**  
An attacker compromises the Ad-Alt VS Code extension build pipeline, inserts malicious code into the published .vsix, and distributes it to developers. The malicious extension could exfiltrate source code or prompt text, perform click fraud locally, or steal API keys.

**Likelihood:** Low  
**Impact:** High  

**Countermeasures**

1. **Reproducible builds.** The extension build process is fully deterministic and runs in an isolated CI environment (GitHub Actions with pinned runner versions). The build artifact is reproduced from a clean checkout of the tagged commit.

2. **Code signing.** The .vsix is signed with an EV code-signing certificate. The extension's public key is published in the repository and in the extension manifest. VS Code validates the signature on installation.

3. **Minimal permission manifest.** The extension's `package.json` declares only the minimum required VS Code API permissions. No file system access beyond workspace detection, no network access beyond the Ad-Alt API domain (enforced via CSP in the webview), no clipboard access.

4. **Dependency pinning and audit.** All npm dependencies are pinned to exact versions. CI runs `npm audit` on every build and fails on high/critical vulnerabilities. A weekly automated PR updates dependencies with audit results.

5. **Two-person code review.** No commit to the extension codebase merges without approval from two engineers. Automated checks enforce that the build pipeline configuration files (`*.yml` in `.github/workflows/`) require the same review bar.

6. **Marketplace integrity check.** A post-publish CI step downloads the published .vsix from the VS Code Marketplace and verifies its SHA-256 hash against the build artifact hash. A mismatch triggers an immediate incident.

---

### T-15 — Unsupported Host-App Changes (AI Extension API Breakage)

**Attack Description**  
A major update to GitHub Copilot, Cursor, or another AI extension changes or removes the VS Code API hooks that Ad-Alt's wait-state adapters rely on. This breaks the wait-state detection logic without any malicious actor involved, causing either silent data loss (impressions not recorded) or incorrect behavior (false wait-states).

**Likelihood:** High  
**Impact:** Medium  

**Countermeasures**

1. **Stable API-only adapters.** Ad-Alt's adapters use exclusively stable, documented VS Code extension APIs (`vscode.languages`, `vscode.window`, `vscode.workspace`). No monkey-patching of other extensions, no access to private extension channels, no interception of IPC messages.

2. **Adapter health monitoring.** Each adapter reports its operational status in a heartbeat payload. A field `adapter_status` with values `active | degraded | disabled` lets the backend detect when adapters go silent without error.

3. **Per-adapter versioned contracts.** Each adapter is versioned (`CopilotAdapterV2`, `CursorAdapterV1`). When a new version is required due to a host-app change, the new adapter is deployed alongside the old one. The extension selects the adapter based on the detected version of the host extension.

4. **Automated integration tests.** The CI pipeline runs integration tests against pinned versions of supported host extensions. When a new version of a host extension is published to the marketplace, a scheduled job runs the integration tests and alerts the team on failure.

5. **Graceful degradation.** If no supported adapter is available (all adapters report `disabled`), the extension silently stops generating wait-state events. It does not crash, does not show errors to the developer, and resumes automatically when a compatible adapter becomes available after an extension update.

---

### T-16 — API Key Theft

**Attack Description**  
An adversary steals an active API key (developer SDK key, advertiser API key, or admin service key) through phishing, credential stuffing, repository exposure (accidentally committed to source control), or shoulder surfing, then uses it to generate fraudulent events or access sensitive data.

**Likelihood:** Medium  
**Impact:** High  

**Countermeasures**

1. **Short-lived keys with rotation.** Developer and advertiser API keys have a default TTL of 90 days with automatic rotation prompts. Admin service keys rotate every 30 days. No key has an indefinite lifetime.

2. **Key scoping.** API keys are scoped to a single capability set: event ingestion keys cannot read account data; reporting keys cannot write events; admin keys are not distributed to client-side code.

3. **Secret scanning in CI.** The repository has GitHub Secret Scanning enabled. A pre-commit hook (using `detect-secrets`) blocks commits containing strings matching API key patterns. CI enforces this check.

4. **Key usage anomaly detection.** Each API key's usage pattern (request times, source subnets, request types) is baselined over the first 7 days. Significant deviations trigger an alert and optional automatic key suspension.

5. **Immediate revocation workflow.** Developers and advertisers can revoke API keys from the web dashboard in one click. The revocation takes effect within 30 seconds (Redis cache TTL). Revoked keys are never reactivated — a new key must be issued.

6. **Leaked key detection.** A scheduled job searches GitHub, GitLab, Pastebin, and npm packages (using GitHub's secret scanning partner program and similar feeds) for leaked Ad-Alt API key patterns. Discovered keys are revoked within 5 minutes.

---

### T-17 — Rate Limit Evasion

**Attack Description**  
An adversary evades rate limits by distributing requests across many IP addresses, many device IDs, or many accounts, or by carefully timing requests to stay just below per-window thresholds while still generating fraudulent volume at scale.

**Likelihood:** Medium  
**Impact:** Medium  

**Countermeasures**

1. **Multi-dimensional rate limiting.** Rate limits are enforced simultaneously across four dimensions: per-device-ID, per-account-ID, per-IP-subnet (/24, hashed), and per-campaign. An adversary must evade all four to generate undetected volume.

2. **Sliding window counters.** Redis-backed sliding-window counters (rather than fixed-window counters) prevent the "burst at window boundary" evasion technique. The window does not reset at a predictable clock boundary.

3. **Behavioral budget limits.** In addition to per-request rate limits, each account has a total daily event budget. This budget is set at 2× the statistical maximum for a legitimate developer in that cohort. Budget exhaustion triggers suspension of event ingestion from that account.

4. **Progressive backoff enforcement.** Repeated rate-limit violations (>5 within 1 hour) result in progressively longer cooldown periods: 1 hour, 4 hours, 24 hours, then permanent flagging for manual review.

5. **Coordinated campaign detection.** A nightly job identifies campaigns where the sum of all per-device limits would be easily saturated by a small number of colluding devices. Campaigns with unusual device concentration relative to impression volume are flagged.

---

## Risk Summary Matrix

| ID    | Threat                          | Likelihood | Impact | Priority |
|-------|---------------------------------|-----------|--------|----------|
| T-01  | Fake Impressions                | High      | High   | Critical |
| T-02  | Fake Clicks                     | Medium    | High   | High     |
| T-03  | Scripted AI Wait-States         | Low       | Medium | Medium   |
| T-04  | Multi-Account Abuse             | Medium    | Medium | Medium   |
| T-05  | Device Spoofing                 | Medium    | High   | High     |
| T-06  | Event Replay                    | Medium    | Medium | Medium   |
| T-07  | Event Tampering                 | Low       | High   | High     |
| T-08  | VPN / Proxy / Network Rotation  | High      | Medium | High     |
| T-09  | Advertiser Malicious URLs       | Medium    | High   | High     |
| T-10  | Phishing Creatives              | Medium    | Medium | Medium   |
| T-11  | Admin Privilege Abuse           | Low       | High   | High     |
| T-12  | Payout Fraud                    | Medium    | High   | High     |
| T-13  | Data Exfiltration               | Low       | High   | High     |
| T-14  | Extension Compromise            | Low       | High   | High     |
| T-15  | Unsupported Host-App Changes    | High      | Medium | High     |
| T-16  | API Key Theft                   | Medium    | High   | High     |
| T-17  | Rate Limit Evasion              | Medium    | Medium | Medium   |

---

## Monitoring and Incident Response

### Fraud Signal Aggregation

All countermeasures that produce signals write to the `fraud_signals` table. A daily aggregation job scores each developer account across all active signals and writes a composite `fraud_score` to `developer_profiles.fraud_score`. Score thresholds:

- **0–30:** Normal. No action.
- **31–60:** Elevated. Increased sampling of events for manual review.
- **61–80:** High risk. Payouts held. Events continue to ingest but are flagged.
- **81–100:** Suspended. Event ingestion halted. Account locked pending fraud review.

### Incident Response Runbook

1. On detection of a Critical or High threat in production, the on-call engineer opens an incident in the incident management system within 15 minutes.
2. Immediate mitigations (rate limit tightening, account suspension) are applied by the on-call engineer without waiting for approval.
3. A post-incident review is completed within 5 business days for every Critical incident.
4. Affected advertisers are notified of fraudulent spend with a full credit issued within 24 hours of incident closure.
5. Affected developers whose accounts are incorrectly suspended during fraud investigation are notified and their accounts restored within 48 hours if cleared.

---

## Assumptions and Out-of-Scope Items

- **OS-level compromise** of the developer's machine is out of scope. If the OS is compromised, the device secret can be exfiltrated, and most device-level controls fail. Defense at this level is the responsibility of the developer's endpoint security tooling.
- **VS Code process compromise** (e.g., a malicious extension with the same host process) is partially mitigated by the minimal permission manifest (T-14) but cannot be fully defended against at the application layer.
- **Stripe infrastructure compromise** is out of scope; Stripe's own security controls are trusted for the payment processing layer.
