# Roadmap

This reflects current intent, not committed dates. See the README's [MVP Status and Known Limitations](../README.md#mvp-status-and-known-limitations) section for what is implemented today.

## MVP (current)

Local-development-complete; not production-deployed.

- VS Code extension: status bar rendering, wait-state detection, mock adapter for local testing
- Hono API: impression, event, ledger, and developer endpoints
- Drizzle ORM schema and migrations: campaigns, impressions, ledger, developer accounts
- `@ad-alt/ledger`: integer-microcent accounting with balance verification
- `@ad-alt/fraud`: impression/click fraud scoring
- `@ad-alt/telemetry`: closed event schema with forbidden-field validator
- Redis-based deduplication and rate limiting
- Unit test coverage across packages

## V1

- OAuth / SSO login (replacing API-key-only auth in the MVP)
- Stripe payout integration for developer earnings
- Reconciliation / settlement job (periodic ledger-to-payout reconciliation)
- GDPR data-export endpoint
- VS Code Marketplace publication
- Full advertiser self-serve portal (campaign creation, creative upload, billing)
- Production infrastructure and deployment pipeline
- Monitoring and alerting
- Bigint-safe ledger mode review for very-high-volume accounts

## Future

- Multi-AI-provider adapters beyond the current `copilot_status` / `ai_status_bar` / `mock` set
- Real-time bidding (RTB) auction for ad placement
- Advertiser-facing analytics dashboard
- Multi-currency support

## How this list changes

Significant product or architecture decisions are recorded in [`DECISIONS.md`](./DECISIONS.md) as they're made. This roadmap is updated to stay consistent with those decisions, not the other way around.
