# Architecture Decision Log

This file records key architectural decisions made during the design and implementation of Ad-Alt.

---

## ADR-001: Product Name

**Decision**: Ad-Alt  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Matches the repository name. Suggests "alternative advertising" and "alternative monetization." Avoids any reference to the inspiration product.

---

## ADR-002: Backend Framework — Hono

**Decision**: Use Hono over Fastify, NestJS, or Express.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Hono is TypeScript-native, edge-compatible, lightweight, and has excellent middleware composability. NestJS adds unnecessary complexity for a startup-stage product. Fastify requires more boilerplate for TypeScript. Express lacks first-class TypeScript support. Hono's validator middleware integrates cleanly with Zod.

---

## ADR-003: ORM — Drizzle

**Decision**: Use Drizzle ORM over Prisma.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Drizzle is fully type-safe at the schema level with zero runtime overhead. It generates SQL that's easy to audit. Prisma's binary engine is harder to deploy in containers and adds latency. Drizzle migrations are plain SQL files, which are simpler to review and roll back. The schema-first approach matches how we think about data.

---

## ADR-004: Package Manager — pnpm with Turborepo

**Decision**: Use pnpm workspaces with Turborepo.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: pnpm offers strict isolation, content-addressable storage, and workspace support. Turborepo provides intelligent caching and parallel task execution across the monorepo. This combination is the current industry standard for TypeScript monorepos.

---

## ADR-005: Authentication — NextAuth v5 (Auth.js)

**Decision**: Use NextAuth v5 (Auth.js) for authentication.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Auth.js integrates directly with Next.js App Router, supports multiple OAuth providers and magic links, and manages session state securely. It avoids building auth from scratch while remaining configurable. The extension uses a separate device token flow derived from the user's session.

---

## ADR-006: No Monkey-Patching — Stable VS Code API Only

**Decision**: The VS Code extension MUST use only stable, documented VS Code Extension API surfaces. No DOM manipulation, no private APIs, no monkey-patching of other extensions.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: The reference product (kickbacks.ai) injects into AI extension internals, creating brittleness whenever those extensions update. Ad-Alt uses an `IWaitStateAdapter` interface with implementations that poll publicly observable extension state (status bar items, context keys). A `MockAdapter` enables offline testing. A killswitch disables all adapters if the host app changes incompatibly. This approach is safer, more maintainable, and more trustworthy.

---

## ADR-007: Money Representation — Integer Microcents

**Decision**: All monetary values stored as `BIGINT` representing microcents (1/1,000,000 of a USD).  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Floating-point arithmetic is unsafe for financial calculations. Integer microcents provide sub-cent precision for CPM calculations (e.g., $0.002 per impression = 2,000 microcents) without precision loss. Ledger entries are always balanced: advertiser debit = developer credit + platform fee credit. All microcent values are validated to be non-negative integers.

---

## ADR-008: Double-Entry Ledger

**Decision**: Use immutable, double-entry ledger entries for all financial transactions.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Double-entry accounting ensures balances always reconcile. Every transaction creates at least two ledger entries (debit/credit). Corrections use reversing entries, never destructive updates. This provides a complete audit trail and makes reconciliation straightforward.

---

## ADR-009: Idempotent Event Ingestion

**Decision**: All events carry a client-generated idempotency key (UUID v4). The backend stores these in `event_deduplication_keys` with a TTL and rejects duplicates with HTTP 200 (not 4xx).  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Network retries are inevitable. Returning 200 for duplicates (rather than 409) prevents extension retry loops from treating successful-but-duplicated events as errors. The deduplication window is 24 hours.

---

## ADR-010: Ad Display — Status Bar Primary Surface

**Decision**: The primary ad display surface is the VS Code status bar item. Webview panels are an optional secondary surface.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Status bar items are the most reliable, least intrusive VS Code surface. They don't require a webview context, don't interfere with the editor, and are fully supported by the stable VS Code API. Webview panels provide richer display but require more permissions and can cause layout disruption. Developers can configure their preferred surface in settings.

---

## ADR-011: Fraud Scoring — Score-Based, Not Binary Banning

**Decision**: Fraud detection produces a score (0–100) with labeled signals, not a binary ban decision.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Binary banning creates false positives that harm honest developers. Score-based systems allow graduated responses: low scores = normal processing, medium scores = hold for manual review, high scores = block with appeal path. Scores and signals are never exposed to the end user (prevents gaming), but are reviewed by admins. Appeals are supported.

---

## ADR-012: Privacy-by-Construction

**Decision**: The extension telemetry schema is published. A test suite asserts that no forbidden fields can appear in any event payload.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Privacy promises must be verifiable. Publishing the exact schema and having automated tests that fail if code paths attempt to include source code, file paths, prompt text, AI responses, or project structure makes the promise auditable, not just a marketing claim.

---

## ADR-013: Creative Safety — Text Only

**Decision**: Ad creatives are text-only: headline (max 80 chars), body (max 140 chars), display URL (max 50 chars), click URL (validated allowlist). No images, scripts, tracking pixels, or embedded HTML.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Text-only creatives eliminate XSS, malicious script injection, and visual phishing via images. They are safe to render in VS Code without sanitization concerns. Click URLs are validated against a blocklist of known malicious domains and require HTTPS. All creatives pass admin review before activation.

---

## ADR-014: Explicit Developer Opt-In

**Decision**: The extension shows NO ads and collects NO impressions until the developer explicitly opts in via a one-time consent flow.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: Trust requires genuine consent. Pre-checked or implicit opt-in is legally problematic in many jurisdictions and damages user trust. The opt-in flow explains exactly what data is collected and what ads look like before the developer commits.

---

## ADR-015: Feature Flags and Kill Switch

**Decision**: A server-controlled feature flag system can disable any adapter, the entire extension functionality, or specific ad types with a single API call.  
**Date**: 2026-06-15  
**Status**: Accepted  
**Rationale**: When an AI extension updates incompatibly, the kill switch prevents broken adapters from polluting data or crashing the host IDE. Flags are fetched on extension activation and cached with a 5-minute TTL.
