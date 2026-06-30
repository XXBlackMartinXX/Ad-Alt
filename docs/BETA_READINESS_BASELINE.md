# ChatGPT Browser Adapter — Beta-Readiness Baseline

**Date:** 2026-06-30
**Branch:** `claude/ecstatic-maxwell-h0d8d8`
**Label:** beta-readiness candidate; blockers documented

This document records the verified baseline after the beta-readiness validation
pass on the ChatGPT browser adapter. It supersedes `CHATGPT_ALPHA_HARDENING_BASELINE.md`
for post-alpha tracking.

---

## 1. Test Suite Results

| Suite | Result | Count | Failed |
|-------|--------|-------|--------|
| Fixture E2E (`test:e2e`) | PASS | 13 passed | 0 |
| Unit tests (`test:unit`) | PASS | 105 passed | 0 |
| TypeScript typecheck | PASS | 0 errors | — |
| Lint | PASS | 0 errors | — |
| Build (`dist/`) | PASS | clean | — |
| Build (`dist-test/`) | PASS | clean | — |
| PS1 ASCII check (`check:ps1`) | PASS | 3 files clean | 0 |
| VSIX package (`extension:package`) | PASS | 5 files, 15.47 KB | — |

Run commands:

```
pnpm --filter @ad-alt/browser-extension test:e2e
pnpm --filter @ad-alt/browser-extension test:unit
pnpm -w run verify
pnpm -w run check:ps1
pnpm --filter promptprofit package
```

---

## 2. Fixture E2E Test Inventory (13 tests)

| # | Test | File |
|---|------|------|
| 1 | extension loads on fixture page without errors | chatgpt-adapter.smoke.spec.ts |
| 2 | fixture page reports idle state initially | chatgpt-adapter.smoke.spec.ts |
| 3 | sponsored banner appears when wait-state is triggered | chatgpt-adapter.smoke.spec.ts |
| 4 | banner has required sponsorship label | chatgpt-adapter.smoke.spec.ts |
| 5 | banner has close button | chatgpt-adapter.smoke.spec.ts |
| 6 | banner disappears when close button is clicked | chatgpt-adapter.smoke.spec.ts |
| 7 | banner disappears when wait-state ends | chatgpt-adapter.smoke.spec.ts |
| 8 | disabled adapter (kill-switch) shows no banner | chatgpt-adapter.smoke.spec.ts |
| 9 | missing api url shows no banner | chatgpt-adapter.smoke.spec.ts |
| 10 | viewability_threshold_met fires after test threshold | chatgpt-adapter.smoke.spec.ts |
| 11 | ad decision request contains no forbidden fields | privacy.smoke.spec.ts |
| 12 | captured events contain no forbidden fields | privacy.smoke.spec.ts |
| 13 | no page content sent for any DOM interaction | privacy.smoke.spec.ts |

---

## 3. Unit Test Modules (105 tests, 8 files)

| File | Tests |
|------|-------|
| `debug-panel.test.ts` | 26 |
| `viewability-observer.test.ts` | 16 |
| `chatgpt-adapter.test.ts` | 18 |
| `chatgpt-wait-state.test.ts` | 12 |
| `ad-event-sender.test.ts` | 11 |
| `kill-switch.test.ts` | 6 |
| `event-schema.test.ts` | 7 |
| `privacy-guard.test.ts` | 9 |
| `platform-detector.test.ts` | 7 (includes 3 overlap files) |

---

## 4. Infrastructure Checks

| Check | Status | Notes |
|-------|--------|-------|
| Node.js | v22.22.2 | OK |
| pnpm | 9.4.0 | OK |
| Docker daemon | NOT RUNNING | Phase 1 blocker |
| PowerShell (pwsh) | NOT INSTALLED on CI | Linux-only limitation |
| Live smoke (Windows) | 3/3 PASSED | Verified by user on Windows |

---

## 5. Chromium Path Fix (this session)

Playwright 1.61.1 (pinned) looks for `chromium-1228` but the CI host
pre-installs `chromium-1194`. The `buildExtensionContext()` helper was
updated to fall back to `/opt/pw-browsers/chromium` (the system symlink)
on non-Windows hosts when no `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var
is set. Windows behavior is unchanged.

File: `apps/browser-extension/e2e/helpers/extension-context.ts`

---

## 6. Beta Blockers

| Blocker | Category | Severity |
|---------|----------|----------|
| No local-real-API smoke mode (Docker not running on CI) | Testing | MEDIUM |
| No LICENSE file in repo (VSIX warns; required for store submission) | Release | HIGH |
| Source maps emitted alongside `dist/` (must strip before Chrome Web Store) | Release | MEDIUM |
| `dist/manifest.json` not persisted after build (only `dist-test/` persists) | Release | LOW |
| No automated seed script for dev API key / test campaign | Testing | MEDIUM |

See `docs/CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md` for the full list.

---

## 6. Prior Baseline

`docs/CHATGPT_ALPHA_HARDENING_BASELINE.md` (2026-06-30) recorded:
- 13 fixture E2E tests passing
- 105 unit tests passing
- PowerShell smoke scripts repaired for ASCII/Windows-PS5.1 compatibility
- Live smoke 3/3 PASSED on Windows (user-verified)
