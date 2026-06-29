# Browser Foundation Hardening — Baseline

**Date:** 2026-06-29  
**Branch:** claude/ecstatic-maxwell-h0d8d8  
**Baseline commit:** bc9c032

## Environment

| Tool | Version |
|------|---------|
| Node | v22.22.2 |
| pnpm | 9.4.0 |

## Pre-hardening test results

| Suite | Files | Tests |
|-------|-------|-------|
| packages/telemetry | 1 | 49 ✓ |
| packages/ledger | 1 | 39 ✓ |
| apps/api | 5 | 68 ✓ |
| apps/browser-extension | 1 | 14 ✓ |
| **Total** | **8** | **170 ✓** |

Lint: clean. Typecheck: clean across all 10 packages.

## Build failures at baseline

```
apps/browser-extension build: Error: Cannot find module
  '/home/user/Ad-Alt/apps/browser-extension/scripts/bundle.mjs'
```

Root cause: `scripts/bundle.mjs` does not exist, and neither do the
content-script entry points referenced in `manifest.json`
(`src/content/chatgpt.ts`, `src/content/claude.ts`, `src/content/gemini.ts`).

## Confirmed bugs targeted for hardening

| # | Location | Description |
|---|----------|-------------|
| 1 | `apps/browser-extension/` | Build broken: missing content scripts + bundle script |
| 2 | `packages/shared/src/schemas/events.ts` | `TELEMETRY_FORBIDDEN_FIELDS` missing 9 browser-specific fields |
| 3 | `apps/api/src/services/event-processor.ts` | Kill-switched events not written to dedup store — replayable after flag lift |
| 4 | `apps/browser-extension/src/background/service-worker.ts` | Fresh-install fail-open: empty storage sets `killSwitchEnabled: false` for 5 min |
| 5 | `apps/browser-extension/src/background/service-worker.ts` | `UPDATE_FLAGS` message has no origin/payload validation |
| 6 | `apps/api/src/services/event-processor.ts` | `isAdapterKillSwitched` runs full DB scan before Redis dedup fast-path |
| 7 | `packages/shared/src/schemas/users.ts` | `preferredAdapterName` includes unimplemented desktop adapters |
| 8 | `apps/browser-extension/src/content/wait-state-detector.ts` | `attributes: true` on full-subtree MutationObserver fires on every DOM attribute change |
| 9 | Multiple schema files | Adapter-name enum duplicated in 4+ places; not derived from `ALLOWED_ADAPTER_IDS` |
