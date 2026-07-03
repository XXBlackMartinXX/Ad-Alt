# PromptProfit — Next Platform Expansion Plan

**Phase:** Multi-Platform Professional Completeness Sprint
**Date:** 2026-07-03

---

## Chosen next platform: Claude browser (claude.ai)

## Why

- Confirmed by `PLATFORM_SUPPORT_AUDIT.md`: the adapter ID
  (`browser_claude`), manifest entry, hostname detection, and a content-
  script entry point already exist — the platform is "reserved and
  stubbed," not starting from zero.
- The ChatGPT adapter provides a proven, working reference structure
  (`chatgpt.adapter.ts` / `.renderer.ts` / `.selectors.ts` /
  `.wait-state.ts`) to mirror exactly, minimizing new architectural risk.
- Gemini has the identical gap (see audit) but is lower priority per the
  mission's default order — building Claude first, then reusing the same
  pattern for Gemini, is faster overall than parallelizing both.
- No evidence in this repo suggests VS Code needs new adapter code (it
  needs verification, a different kind of work — tracked separately, not
  blocked by or blocking this plan).

## Files to touch

New (mirroring the ChatGPT adapter's structure exactly):

- `apps/browser-extension/src/adapters/claude/claude.selectors.ts` —
  hostnames + a `PROCESSING_SELECTORS`-equivalent, but scoped to Claude
  only (extracted from the generic `wait-state-detector.ts` map, not
  guessed fresh — reuses the existing guessed selector as a starting
  point, explicitly labeled unverified until real-session tested).
- `apps/browser-extension/src/adapters/claude/claude.wait-state.ts` —
  `ClaudeWaitStateDetector`, mirrors `chatgpt.wait-state.ts`'s structure.
- `apps/browser-extension/src/adapters/claude/claude.renderer.ts` —
  `ClaudeRenderer`, mirrors `chatgpt.renderer.ts`.
- `apps/browser-extension/src/adapters/claude/claude.adapter.ts` —
  `ClaudeAdapter implements IAdapter`, `adapterId: "browser_claude"`.
- `apps/browser-extension/e2e/fixtures/claude-fixture.html` (or
  equivalent) — a synthetic DOM fixture simulating Claude's relevant
  structural elements, modeled on the existing ChatGPT fixture. **Not a
  copy of real claude.ai HTML** — hand-built to exercise the selectors
  only.
- `apps/browser-extension/src/content/claude.ts` — updated to use
  `ClaudeAdapter` instead of the generic `_content-main.js` bootstrapper
  (same restructuring `chatgpt.ts` already went through).

Not touched: `chatgpt.*` files, `service-worker.ts`'s core message
handling (already generic/adapter-agnostic), the API/ledger/fraud
packages (already platform-agnostic by design — no changes needed there
for a new browser adapter).

## Tests needed

- `apps/browser-extension/src/adapters/claude/__tests__/claude.adapter.test.ts`
  — mirrors `chatgpt.adapter.test.ts`'s 27 cases: `canActivate` on/off
  hostname, wait-state start/end, render/remove, kill-switch suppression.
- `apps/browser-extension/src/adapters/claude/__tests__/claude.privacy.test.ts`
  — mirrors `chatgpt.privacy.test.ts`'s 15 cases: no forbidden field in
  any constructed event.
- New e2e smoke spec (`claude-adapter.smoke.spec.ts`) against the fixture
  page, mirroring `chatgpt-adapter.smoke.spec.ts`'s structure.
- Extend `scripts/check-monetization-privacy.js`'s scan scope to include
  the new Claude adapter files (should require no code change if the
  existing `walk()` over `apps/browser-extension/src` already covers new
  subdirectories — verify this, don't assume).

## Privacy controls

- Every new file must open with the same privacy-rule comment block
  ChatGPT's files use.
- `claude.selectors.ts` must only ever query for element presence, never
  read `.textContent`/`.innerText`/`.value`.
- `claude.adapter.ts` must implement the exact same kill-switch check
  (`CHECK_ADAPTER_STATUS` before `start()`) as `ChatGPTAdapter`.
- No claude.ai real-session testing may involve automated login or
  automated prompt entry — CANARY 8. Any real-session verification is
  human-operated only.

## Verification command

```bash
pnpm --filter @ad-alt/browser-extension test:unit    # new Claude unit tests must pass
pnpm -w run smoke:chatgpt:fixture                     # confirm ChatGPT unaffected (regression check)
# once a Claude e2e smoke spec exists:
pnpm --filter @ad-alt/browser-extension test:e2e -- claude-adapter.smoke.spec.ts
pnpm -w run check:monetization:privacy                # must still pass, now scanning Claude files too
pnpm -w run check:platforms                           # must still report Claude as placeholder/experimental, not verified
```

## Rollout gate

Claude may move from `placeholder` → `experimental` once the adapter
code + unit tests + fixture e2e tests all pass. Claude may move from
`experimental` → `beta` once a dedicated privacy review doc exists
(mirroring `MONETIZATION_PRIVACY_REVIEW.md`'s pattern) and
`check:platforms` passes with Claude's new files included. Claude may
move from `beta` → `verified` ONLY after a real, human-operated session
against real claude.ai is recorded with the same evidentiary rigor as
`docs/internal-beta/dry-runs/DRYRUN-001_RESULT_LOG.md` — this is a
separate, later effort, not part of this sprint.

## What is explicitly NOT included in this plan

- Real claude.ai selector verification (requires a human session,
  scheduled separately).
- Enabling Claude by default for any user — it stays
  kill-switch-disabled / feature-flagged off until `verified`.
- Any change to the revenue pilot's scope (`browser_chatgpt` only,
  per `docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`
  — unaffected by this plan).
- Gemini browser (tracked as the following, separate effort once Claude
  reaches `beta`).
- Any desktop, terminal, Codex, or Claude Code integration (CANARY 10 —
  explicitly out of scope, requires separate research per
  `FAST_PLATFORM_EXPANSION_TRIAGE.md`).

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
