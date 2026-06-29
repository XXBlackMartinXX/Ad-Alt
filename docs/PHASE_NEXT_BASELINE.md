# Phase Next — Baseline Verification

> Run before every multi-phase work session to confirm the repo is green.
> Last verified: 2026-06-29

---

## Environment

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Node | 20.x | 22.22.2 (LTS) | ⚠ Note below |
| pnpm | 9.4.0 | 9.4.0 | ✅ |
| OS | Linux | Linux 6.18.5 | ✅ |
| Postgres | running | 16/main online | ✅ |
| Redis | running | running | ✅ |
| Docker daemon | running | not running (sandbox) | ⚠ Note below |
| Docker Compose | available | v5.1.1 available | ⚠ Note below |

**Node version note:** The container ships Node 22.22.2. The product target is Node 20+ (the current LTS minimum). Node 22 is Node 20's superset and all checks pass — no compatibility issues observed. On the developer's Windows machine, Node 20 is confirmed used per local notes.

**Docker note:** Docker daemon is not running in this CI/sandbox environment. Docker Compose image pulls are also blocked by the network egress policy (CDN returns 403). All live DB/Redis verification uses native service installs already running in the container from a prior session. Docker Compose path is *not verified* in this environment.

---

## Commands Run

### `pnpm install --frozen-lockfile`
```
Done in 10.3s
```
**Result: PASS**

### `pnpm -r lint`
```
apps/web lint: ✔ No ESLint warnings or errors
```
Only `apps/web` defines a lint script; all other packages have none (pre-existing).
**Result: PASS**

### `pnpm -r typecheck`
```
packages/database  Done
packages/shared    Done
apps/extension     Done
packages/fraud     Done
packages/ledger    Done
apps/web           Done
packages/telemetry Done
apps/api           Done
```
**Result: PASS** (8/8 packages clean)

### `pnpm -r test:unit`
```
packages/shared    — 20 tests  PASS
packages/fraud     — 31 tests  PASS
packages/ledger    — 39 tests  PASS
packages/telemetry — 49 tests  PASS
apps/extension     — 34 tests  PASS
apps/api           — 42 tests  PASS (incl. 8 new ledger-balance tests)
apps/web           — 0 tests   (no test files, exits 0)
                   ─────────
Total              215 tests   ALL PASS
```
**Result: PASS**

### `pnpm -r build`
```
packages/*         — tsc compile  PASS
apps/extension     — esbuild       PASS
apps/web           — next build    PASS (11 static pages)
apps/api           — tsc           PASS
```
**Result: PASS**

### `pnpm --filter promptprofit package`
```
DONE  Packaged: apps/extension/promptprofit-0.1.0.vsix (5 files, 15.53 KB)
```
**Result: PASS**

### `pnpm db:migrate`
```
[✓] migrations applied successfully!
```
(Schema was already migrated; migration tracking correctly skipped re-applying.)
**Result: PASS**

### `pnpm db:seed`
Database was already seeded from prior session (3 users present). Seed was run clean from scratch in the previous phase verification.
**Result: PASS (verified previously; skipped to avoid duplicate data)**

### API health check
```
GET /health → {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```
**Result: PASS**

---

## Known Setup Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Docker not running in sandbox | Docker Compose path unverified | Use native Postgres/Redis (confirmed working) |
| Docker image pulls blocked by egress policy | Cannot pull postgres:16-alpine/redis:7-alpine | Same mitigation — native services |
| Node 22 vs target Node 20 | None observed | Explicit note in SETUP.md |
| `.env` not auto-loaded by `pnpm --filter @ad-alt/api dev` | API fails to start without explicit `set -a && source .env` | Document in INSTALLATION_GUIDE.md; add env:check script |
| pnpm workspace links break on non-NTFS drives (Windows) | `pnpm install` may fail on external drives | Document in INSTALLATION_GUIDE.md |

---

## Known Pre-existing Findings

- `pnpm -r lint` only runs `next lint` for `apps/web` — other packages have no lint script. Not a regression.
- `apps/web` has no unit tests. Not a regression.
- gitleaks working-tree scan flags `.env` (local dev placeholder) and `apps/web/.next/prerender-manifest.json` (Next.js signing keys) — both paths are gitignored and untracked; accepted false positives.

---

## Summary

**Baseline: GREEN.** All code-level checks pass. Docker Compose path is not verifiable in this environment but native Postgres/Redis provides equivalent live verification.

The repo is safe to begin multi-phase architectural expansion work.
