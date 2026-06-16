# Security Policy

## Supported Versions

PromptProfit is currently in MVP / pre-production status. There is no production release yet. Security reports are still welcome and will be taken seriously — they help us harden the platform before launch.

| Version | Status |
|---|---|
| `main` branch (MVP) | Active development — reports accepted |
| Earlier commits | Not supported |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue to report a security vulnerability.**

Send vulnerability reports by email to:

**security@promptprofit.dev**

Please include:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept)
- The component affected (API, extension, web dashboard, a specific package)
- Your suggested severity (Critical / High / Medium / Low)
- Whether you would like to be credited in the fix disclosure

### What NOT to include in public issues

- Proof-of-concept exploit code
- API keys, tokens, or credentials (even test ones)
- Secrets or environment values from any deployment
- Personally identifiable information

If you accidentally include sensitive data in an issue or PR, notify us immediately at the email above so we can revoke affected credentials.

### PGP Key

Not yet published — use the email above. If you require end-to-end encryption before sending, contact us and we will arrange a secure channel.

---

## Response SLA

| Milestone | Target |
|---|---|
| Acknowledgement | Within 48 hours of receipt |
| Status update | Within 7 calendar days |
| Fix timeline estimate | Provided with the status update |
| Public disclosure | Coordinated with reporter; default 90 days after fix |

We follow responsible disclosure. We will not pursue legal action against researchers who report in good faith and follow this policy.

---

## Security Model Summary

### Privacy by Construction

The VS Code extension is the most security-sensitive surface because it runs inside developers' editors. The design enforces the following constraints at the code level:

- **Closed Zod telemetry schemas.** All event types are defined as strict Zod objects with no `passthrough()`, `catchall()`, or open union members. Adding a field that could carry source code, file paths, prompts, or AI responses requires changing the schema definition — which is caught by the `TELEMETRY_FORBIDDEN_FIELDS` test suite.
- **No free-text fields in any telemetry event.** The event schemas contain only enumerated strings, UUIDs, ISO timestamps, and numeric counts.
- **The extension does not read file contents, editor buffers, or terminal output.** It only observes the AI provider state machine (idle → waiting → response) via provider-specific adapters.
- **No telemetry is sent during non-wait-state periods.** Events are only emitted when the extension has detected an active AI wait-state.

### API Security

- All advertiser and developer API routes require a valid JWT or API key.
- Admin routes are separately guarded and not exposed on the public API surface.
- Input validation via Zod is applied to all request bodies and query parameters before any handler logic runs.
- Rate limiting is enforced at the Redis layer for all public endpoints.
- Budget enforcement for campaign spend is atomic: the balance check and ledger write occur inside a single database transaction with `FOR UPDATE` row locking, preventing double-spend.

### Ledger Security

- All money amounts are stored and computed as integer microcents.
- No floating-point arithmetic is used anywhere in the ledger or billing path.
- `verifyBalance()` is called before every ledger write.
- Ledger entries are immutable after creation.

---

## In-Scope Targets

The following are in scope for vulnerability reports:

- **API** (`apps/api`) — authentication, authorization, injection, rate limiting, budget enforcement
- **VS Code extension** (`apps/extension`) — data leakage, supply chain, privilege escalation within VS Code
- **Web dashboard** (`apps/web`) — authentication, authorization, XSS, CSRF
- **Shared packages** (`packages/`) — schema bypass, integer overflow in ledger, fraud scoring bypass
- **Docker Compose / infrastructure configuration** — credential exposure in default config
- **Dependency vulnerabilities** — critical CVEs in direct production dependencies

## Out-of-Scope

- Vulnerabilities in third-party services (GitHub, Stripe, Vercel, etc.) that we cannot fix
- Attacks requiring physical access to a developer's machine
- Social engineering attacks against contributors
- Denial-of-service attacks against local development infrastructure
- Issues in dependencies that have no exploitable path in this codebase
- Vulnerabilities in unreleased or experimental branches

---

## Safe Harbor

We consider security research conducted in accordance with this policy to be authorized and will not initiate legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and disruption to other users
- Do not access, modify, or destroy data beyond what is needed to demonstrate the vulnerability
- Report findings promptly and coordinate disclosure with us
- Do not publicly disclose findings before we have had a reasonable opportunity to remediate

We thank the security research community for helping keep PromptProfit and its users safe.
