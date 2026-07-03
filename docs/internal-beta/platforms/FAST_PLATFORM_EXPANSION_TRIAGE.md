# PromptProfit — Fast Platform Expansion Triage

**Phase:** Multi-Platform Professional Completeness Sprint
**Date:** 2026-07-03

> Ruthless. Goal: protect the ChatGPT revenue pilot from endless platform
> expansion. Most items below are DO NOT BUILD YET — that is intentional
> and correct, not a gap.

| Item | Value to revenue | Effort | Risk | Fastest safe implementation | Defer reason | Recommended timing |
|------|---------------------|--------|------|--------------------------------|----------------|----------------------|
| Keep ChatGPT browser stable | Highest — it's the only revenue platform | None (already done) | Low if left alone | Do not touch adapter/wait-state/renderer code | N/A | **DO NOW** (i.e. protect it, don't expand it) |
| `check:platforms` verification gate | High — prevents false "verified" claims from ever shipping | Low | Low | Static scan + fresh-run existing checks (Phase 7) | N/A | **DO NOW** |
| Claude browser: dedicated adapter skeleton + fixture + disabled-by-default status | Medium — unlocks the next revenue platform, but not revenue itself yet | Medium | Low if scoped to fixture-only, no real-login testing | `ClaudeAdapter` class + fixture HTML page + unit tests for detection/forbidden-fields, kept `experimental`/`disabled` | N/A — this is the recommended next step | **DO NEXT** |
| Claude browser: real-session verification (DRYRUN-Claude-001 equivalent) | High once built | Medium | Medium — requires a human manually logging into real claude.ai | Same evidentiary process as DRYRUN-001, run by a human, not automated | Depends on the skeleton above existing first | **DO NEXT** (after skeleton) |
| Gemini browser: dedicated adapter | Medium | Medium | Low if scoped like Claude | Same pattern as Claude, reused | Should follow Claude, not run in parallel, to avoid splitting review attention while the pilot is live | **DO LATER** |
| VS Code live-session verification | Medium — VS Code MVP is already "shipped" per existing docs but lacks a DRYRUN-001-equivalent record | Low-Medium | Low | One human-run verification session, recorded like DRYRUN-001 | Does not block the ChatGPT pilot; can run in parallel by a different person without touching browser-extension code | **DO NEXT** (in parallel, zero conflict with ChatGPT/Claude work) |
| Codex integration research | Unknown — no evidence Codex users would pay for this yet | Unknown (research needed first) | Unknown until researched | A research memo only, no code | No adapter ID, no clear integration surface, no product validation yet | **DO NOT BUILD YET** |
| Claude Code desktop adapter | Unknown | High — desktop has no DOM/extension API; would need OS-level hooks | High — screen-reading/OCR approaches are explicitly forbidden | Research memo only | Fundamentally different integration model; premature before browser expansion is even proven | **DO NOT BUILD YET** |
| Claude Code terminal adapter | Unknown | High — needs a CLI wrapper or shell hook design | High — terminal content must never be captured; a naive approach risks exactly that | Research memo only | Same reasoning as desktop — separate integration path, no existing scaffolding | **DO NOT BUILD YET** |
| Generic terminal AI tools | Unknown | High | High | Research memo only | Same as above, and "generic" implies even less specificity to design against | **DO NOT BUILD YET** |
| `antigravity` / `copilot_status` real implementation | Low — reserved IDs only, no product signal yet | Unknown | Unknown | N/A | No implementation plan exists or is requested this sprint | **DO NOT BUILD YET** |
| Multi-platform API filtering hardening (beyond what already exists) | Medium, but only once 2+ real platforms are live | Low-Medium | Low | `packages/telemetry`'s schema already rejects unknown `adapterName` — re-verify this still holds once Claude's real adapterId starts sending events | Not urgent until Claude reaches `beta` | **DO LATER** |

---

## Summary

**DO NOW:** protect ChatGPT (touch nothing), build `check:platforms`.
**DO NEXT:** Claude browser adapter skeleton (fixture-scoped, disabled by
default) + VS Code live-session verification (parallel, zero conflict).
**DO LATER:** Gemini browser adapter, multi-platform API filtering
hardening.
**DO NOT BUILD YET:** Codex, Claude Code desktop, Claude Code terminal,
generic terminal tools, real `antigravity`/`copilot_status` — all require
separate research before any code is justified.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
