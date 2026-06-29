# Roadmap

This reflects current intent, not committed dates. See the README's [MVP Status and Known Limitations](../README.md#mvp-status-and-known-limitations) section for what is implemented today.

## MVP (current)

Local-development-complete; not production-deployed.

- VS Code extension: status bar rendering, wait-state detection, mock adapter for local testing
- **Browser extension (Manifest V3):** ChatGPT adapter (`browser_chatgpt`) — structural DOM
  wait-state detection, fixed-position sponsored moment banner, kill-switch enforced at startup.
  Alpha status — unit-tested (79 tests), not yet manually verified in browser.
  See `docs/CHATGPT_BROWSER_LOCAL_SMOKE_TEST.md`.
- Hono API: impression, event, ledger, and developer endpoints; `GET_AD_DECISION` service-worker
  message handler for the content-script-to-API flow
- Drizzle ORM schema and migrations: campaigns, impressions, ledger, developer accounts
- `@ad-alt/ledger`: integer-microcent accounting with balance verification
- `@ad-alt/fraud`: impression/click fraud scoring
- `@ad-alt/telemetry`: closed event schema with forbidden-field validator
- Redis-based deduplication and rate limiting; kill-switch dedup written on disabled path
- 261+ unit tests across packages

## V1

- OAuth / SSO login (replacing API-key-only auth in the MVP)
- Stripe payout integration for developer earnings
- Reconciliation / settlement job (periodic ledger-to-payout reconciliation)
- GDPR data-export endpoint
- VS Code Marketplace publication
- Chrome Web Store publication (browser extension)
- Manual browser smoke test and promotion from alpha to stable
- Full advertiser self-serve portal (campaign creation, creative upload, billing)
- Production infrastructure and deployment pipeline
- Monitoring and alerting
- Bigint-safe ledger mode review for very-high-volume accounts

## Future

- Claude.ai browser adapter (`browser_claude`)
- Gemini browser adapter (`browser_gemini`)
- Real-time bidding (RTB) auction for ad placement
- Advertiser-facing analytics dashboard
- Multi-currency support
- ViewabilityObserver integration with telemetry event path (billable viewed impressions)

## How this list changes

Significant product or architecture decisions are recorded in [`DECISIONS.md`](./DECISIONS.md) as they're made. This roadmap is updated to stay consistent with those decisions, not the other way around.
