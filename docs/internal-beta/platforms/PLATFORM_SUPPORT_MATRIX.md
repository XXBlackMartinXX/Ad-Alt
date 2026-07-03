# PromptProfit — Platform Support Matrix

**Phase:** Multi-Platform Professional Completeness Sprint
**Date:** 2026-07-03

> Machine-checkable summary. `scripts/check-platform-support-readiness.js`
> verifies ChatGPT remains `verified` and that no other platform is
> mislabeled `verified` without evidence — see Phase 7.

| Platform | Surface type | Support status | Adapter exists | Tests exist | Privacy reviewed | Monetization ready | Kill-switch verified | Launch priority | Blocks revenue pilot? | Next action |
|----------|---------------|------------------|-----------------|--------------|---------------------|-----------------------|--------------------------|--------------------|--------------------------|--------------|
| ChatGPT browser | Browser extension (MV3) | **verified** | Yes — `chatgpt.adapter.ts` + selectors/renderer/wait-state | Yes — 42 unit tests + 27 e2e smoke tests | Yes — dedicated privacy test suite + `check:monetization:privacy` | Yes — full pipeline, real ledger writes verified | Yes — server-side (event-processor.ts) + client-side (`syncFlagsFromBackend`), both verified | 1 (current revenue platform) | **No** | None — maintain |
| VS Code extension | Native extension | **beta** (implemented, not DRYRUN-verified) | Yes — `ai-status-bar.adapter.ts` | Yes — 34 unit tests (event-queue, privacy) | Partial — privacy test exists, no live-session record | Yes — real event queue + API client wired | Not separately re-verified this sprint | 2 | No | Run a DRYRUN-001-equivalent live session for VS Code, record it (separate effort) |
| Claude browser | Browser extension (MV3) | **placeholder** | No dedicated adapter — generic bootstrapper only | No Claude-specific tests | No | No — `WAIT_STATE_START`/`END` messages have no service-worker handler | Kill-switch check happens before pipeline exists, so N/A | 3 | No | See `NEXT_PLATFORM_EXPANSION_PLAN.md` — first expansion target |
| Gemini browser | Browser extension (MV3) | **placeholder** | No dedicated adapter — generic bootstrapper only | No Gemini-specific tests | No | No — same gap as Claude | N/A | 4 | No | Second expansion target, after Claude |
| Claude Code terminal | CLI/terminal | **not supported** | No | No | No | No | No | 5 | No | Research only — separate integration model required (CANARY 10) |
| Codex | Unknown (not researched) | **not supported** | No | No | No | No | No | 5 | No | Research only |
| Claude Code desktop | Desktop app | **not supported** | No | No | No | No | No | 6 | No | Research only — no DOM, no extension API; screen-scraping/OCR explicitly forbidden |
| Generic terminal AI tools | CLI/terminal | **not supported** | No | No | No | No | No | 6 | No | Research only |
| `browser_mock` | Test fixture (not a real platform) | **verified (fixture only)** | Yes | Yes — 10 tests | Yes | Yes (synthetic) | Yes (synthetic) | N/A | No | None — this is test infrastructure, never describe it as a real platform |
| `antigravity` | Desktop (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | None this sprint |
| `copilot_status` | VS Code (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | None this sprint |

---

**Business priority order (unchanged from mission default, confirmed by
this audit — no evidence found to override it):**

1. ChatGPT browser — keep verified, protect the revenue pilot.
2. VS Code MVP — verify separately (already functionally implemented).
3. Claude browser — next browser adapter to build.
4. Gemini browser — after Claude.
5. Claude Code terminal / Codex / desktop — separate integration
   research, not scheduled this sprint.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
