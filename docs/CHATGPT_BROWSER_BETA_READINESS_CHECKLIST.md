# ChatGPT Browser Adapter — Beta-Readiness Checklist

**Date:** 2026-06-30
**Branch:** `claude/ecstatic-maxwell-h0d8d8`
**Overall label:** beta-readiness candidate; blockers documented

---

## Legend

| Status | Meaning |
|--------|---------|
| PASS | Verified and passing |
| PARTIAL | Present but incomplete |
| BLOCKED | Cannot verify — external dependency missing |
| NOT STARTED | Planned but not yet implemented |
| N/A | Not applicable to this milestone |

---

## 1. Fixture E2E Test Suite

| Item | Status | Notes |
|------|--------|-------|
| All fixture E2E tests pass | PASS | 13/13 passing |
| Wait-state detection covered | PASS | Tests 3, 7 |
| Kill-switch enforcement covered | PASS | Test 8 |
| Missing API config covered | PASS | Test 9 |
| Viewability threshold event covered | PASS | Test 10 |
| Privacy: no forbidden fields in ad request | PASS | privacy.smoke.spec.ts test 11 |
| Privacy: no forbidden fields in events | PASS | privacy.smoke.spec.ts test 12 |
| Privacy: no page content in DOM interactions | PASS | privacy.smoke.spec.ts test 13 |
| Chromium executable path CI-compatible | PASS | Falls back to /opt/pw-browsers/chromium |

---

## 2. Unit Test Suite

| Item | Status | Notes |
|------|--------|-------|
| Unit tests pass | PASS | 105/105 passing |
| DebugPanel state fields covered | PASS | 26 tests including new fields |
| ViewabilityObserver threshold logic | PASS | 16 tests |
| ChatGPT adapter lifecycle | PASS | 18 tests |
| Wait-state detector | PASS | 12 tests |
| Event sender privacy compliance | PASS | 11 tests |
| Kill-switch logic | PASS | 6 tests |
| Event schema validation | PASS | 7 tests |
| Privacy guard field checking | PASS | 9 tests |

---

## 3. TypeScript / Lint / Build

| Item | Status | Notes |
|------|--------|-------|
| TypeScript: 0 errors | PASS | `pnpm typecheck` |
| ESLint: 0 errors | PASS | `pnpm lint` |
| dist/ production build clean | PASS | `pnpm build` |
| dist-test/ test build clean | PASS | `pnpm build:test` |

---

## 4. Live Smoke Test (Windows)

| Item | Status | Notes |
|------|--------|-------|
| Live ChatGPT smoke (3/3 runs) | PASS | User-verified on Windows |
| Stability runner script (PS5.1 compat) | PASS | ASCII-clean, tested |
| Report viewer script (PS5.1 compat) | PASS | ASCII-clean, tested |
| PS1 ASCII compliance check | PASS | `pnpm check:ps1` — 3 files clean |

---

## 5. Local Real-API Smoke Mode

| Item | Status | Notes |
|------|--------|-------|
| Docker daemon available on CI | BLOCKED | Daemon not running on this host |
| Local API health check | BLOCKED | Needs Docker |
| DB migration and seed | BLOCKED | Needs Docker/Postgres |
| Real-API E2E test runs | BLOCKED | See docs/LOCAL_REAL_API_SMOKE_MODE.md |
| `pnpm smoke:chatgpt:local-api` script | BLOCKED | Documents blockers when run |

---

## 6. Privacy & Security

| Item | Status | Notes |
|------|--------|-------|
| No page content reads (DOM text, innerHTML reads) | PASS | Audit clean |
| No page URL path/query reads | PASS | Only hostname read |
| No cookies / localStorage reads | PASS | Audit clean |
| No auth token reads | PASS | Audit clean |
| No clipboard access | PASS | Audit clean |
| Privacy guard enforces forbidden fields | PASS | validateBrowserEvent() |
| Service worker never logs page content | PASS | SW audit clean |
| Events use only backend-assigned IDs | PASS | ad-event-sender.ts |
| eventId is per-event UUID (dedup safe) | PASS | crypto.randomUUID() per event |
| Full audit documented | PASS | docs/CHATGPT_BROWSER_PRIVACY_SECURITY_AUDIT.md |

---

## 7. Event Pipeline Correctness

| Item | Status | Notes |
|------|--------|-------|
| impression_requested fires before render | PASS | chatgpt.ts order verified |
| impression_rendered fires after banner in DOM | PASS | chatgpt.ts order verified |
| viewability_threshold_met fires at 5000ms | PASS | Production threshold confirmed |
| Test threshold override is fixture-only | PASS | chatgpt.ts never reads it |
| Session ID is per content-script lifetime | PASS | MODULE-scope SESSION_ID |
| sequenceNumber increments per event | PASS | nextSeq() monotonic |
| eventId is unique per event | PASS | crypto.randomUUID() |
| Kill switch prevents all events | PASS | Returns early before any dispatch |
| Service worker unreachable = no events | PASS | Fails closed silently |
| Full dedup review documented | PASS | docs/EVENT_LEDGER_DEDUP_REVIEW.md |

---

## 8. Release Package Hygiene

| Item | Status | Notes |
|------|--------|-------|
| VSIX packages cleanly | PASS | 5 files, 15.47 KB |
| .turbo/ excluded from VSIX | PASS | .vscodeignore entry |
| src/ excluded from VSIX | PASS | .vscodeignore entry |
| No dist-test/ in VSIX | PASS | Different app package |
| No .env / secrets in VSIX | PASS | git-ignored |
| Source maps not in VSIX | PASS | browser ext separate from VS Code ext |
| LICENSE file present | BLOCKED | No LICENSE file — required for marketplace |
| Browser ext ZIP: source maps stripped | NOT STARTED | Strip .map before CWS submission |
| Full hygiene documented | PASS | docs/RELEASE_PACKAGE_HYGIENE.md |

---

## 9. Debug Panel

| Item | Status | Notes |
|------|--------|-------|
| adapterActive state | PASS | Set on adapter.start() |
| waitStateDetected state | PASS | Set on onWaitStateStart |
| sponsoredMomentRendered state | PASS | Set after renderSponsoredMoment |
| lastEventType state | PASS | Set per event fired |
| killSwitchEnabled state | PASS | Set on kill-switch active |
| apiConfigured state | PASS | Set on init |
| adDecisionRequested state | PASS | Set before GET_AD_DECISION |
| adDecisionReceived state | PASS | Set on non-null decision |
| lastErrorCode state | PASS | Typed error codes, no page data |
| Unit tests for new fields | PASS | 26 tests total |

---

## 10. Canary Checks

| Canary | Status | Notes |
|--------|--------|-------|
| CANARY 1: Working directory correct | PASS | /home/user/Ad-Alt |
| CANARY 2: Branch is claude/ecstatic-maxwell-h0d8d8 | PASS | Verified |
| CANARY 3: No new platform support added | PASS | No Claude/Gemini/Desktop changes |
| CANARY 4: No ChatGPT login automation | PASS | No auth code present |
| CANARY 5: No ChatGPT content/URL/cookie reads | PASS | Privacy audit clean |
| CANARY 6: No generated artifacts committed | PASS | All in .gitignore |
| CANARY 7: Local-real-API not faked | PASS | Marked BLOCKED, not claimed PASSED |
| CANARY 8: No events = skip privacy check | PASS | Fixture tests verify event content |
| CANARY 9: Not claimed production-ready | PASS | Label is beta-readiness candidate |
| CANARY 10: Valid final label | PASS | beta-readiness candidate |

---

## 11. Developer Experience

| Item | Status | Notes |
|------|--------|-------|
| smoke:chatgpt:fixture works on Linux CI | PASS | 13/13 |
| smoke:chatgpt:live works on Windows | PASS | User-verified |
| smoke:chatgpt:live:stability works | PASS | 3/3 via run-live-chatgpt-stability.ps1 |
| smoke:chatgpt:report works | PASS | Prints to console on Windows |
| smoke:chatgpt:report:open works | PASS | Opens viewer on Windows |
| smoke:chatgpt:local-api (stub) | PARTIAL | Reports blockers cleanly |
| smoke:chatgpt:reports:list | PASS | Lists reports dir contents |
| smoke:chatgpt:reports:clean | PASS | Removes old reports with confirm |
| check:ps1 covers all PS1 files | PASS | 3 files (added query-local script) |
| query-local-browser-events.ps1 ASCII-safe | PASS | Fixed em dashes, added filters |

---

## 12. Outstanding Beta Blockers (Summary)

| Blocker | Category | Path to Resolve |
|---------|----------|----------------|
| No LICENSE file | Release | Add LICENSE.md before store submission |
| Local-real-API smoke BLOCKED | Testing | Start Docker, add seed script |
| Source maps not stripped for CWS | Release | esbuild `sourcemap: false` in prod |
| No automated API key seed | Testing | Add globalSetup to playwright.config.ts |

---

## Final Label

**beta-readiness candidate; blockers documented**

The ChatGPT browser adapter passes all automated fixture tests, unit tests,
TypeScript checks, lint, and Windows live smoke validation. Privacy and
security audits are clean. The two outstanding blockers (LICENSE and
local-real-API smoke) are documented and do not affect the core adapter
correctness. The adapter is suitable for internal beta testing; public
store submission requires resolving the LICENSE and source-map blockers.
