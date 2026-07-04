# PromptProfit — Platform Support Matrix

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03

> Machine-checkable summary. `scripts/check-platform-support-readiness.js`
> (`check:platforms`) verifies ChatGPT remains `verified` and that no
> other platform is mislabeled `verified` without evidence.
> `scripts/check-platform-certification.js` (`check:platform-certification`)
> additionally verifies that Claude/Gemini have real smoke+privacy test
> evidence behind their `beta` label, that desktop/terminal/Codex are
> correctly NOT claimed as tested/verified, and that no doc in this
> directory overclaims support.
> `scripts/check-platform-live-readiness.js` (`check:platform-live-readiness`)
> tracks the separate no-login-smoke / assisted-manual-session evidence
> trail for Claude and Gemini specifically — see
> `LIVE_VERIFICATION_SAFETY_POLICY.md` for the full workflow. Its current
> result is `HOLD`: the workflow is ready, no human evidence has been
> recorded yet.
> `scripts/check-vscode-extension-readiness.js` (`check:vscode-extension`)
> and `scripts/check-nonbrowser-platform-readiness.js`
> (`check:nonbrowser-platforms`) cover VS Code and the terminal/Claude
> Code/Codex surfaces — see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` and
> `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md`.
> `scripts/check-terminal-adapter.js` (`check:terminal-adapter`) verifies
> the real, generic, opt-in `packages/terminal-adapter` package (build,
> typecheck, tests, a fresh synthetic demo run, and static privacy/stdio-
> safety scans) — see `REAL_TERMINAL_ADAPTER_DESIGN.md`,
> `TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md`, and the three
> per-platform decision docs (`CLAUDE_CODE_TERMINAL_INTEGRATION_
> DECISION.md`, `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`,
> `CODEX_CLI_IDE_INTEGRATION_DECISION.md`).
> `scripts/check-native-hooks.js` (`check:native-hooks`),
> `scripts/check-claude-code-native-hooks.js`
> (`check:claude-code-native-hooks`), `scripts/check-codex-native-hooks.js`
> (`check:codex-native-hooks`), and
> `scripts/check-native-hook-installation.js`
> (`check:native-hook-installation`) verify the newer, official-hook-based
> `packages/native-hook-adapter` package and the `scripts/claude-code-hook.js`
> / `scripts/codex-hook.js` integrations — see
> `NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md`,
> `NATIVE_HOOK_PRIVACY_CONTRACT.md`,
> `CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md`,
> `CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`,
> `CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md`, and
> `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md`.

| Platform | Surface type | Support status | Adapter exists | Tests exist | Privacy reviewed | Monetization ready | Kill-switch capable | Launch priority | Blocks revenue pilot? | Next action |
|----------|---------------|------------------|-----------------|--------------|---------------------|-----------------------|--------------------------|--------------------|--------------------------|--------------|
| ChatGPT browser | Browser extension (MV3) | **verified** | Yes — `chatgpt.adapter.ts` + selectors/renderer/wait-state | Yes — 42 unit tests + 27 e2e smoke tests | Yes — dedicated privacy test suite + `check:monetization:privacy` | Yes — full pipeline, real ledger writes confirmed | Yes — server-side (event-processor.ts) + client-side (`syncFlagsFromBackend`), both confirmed | 1 (current revenue platform) | **No** | None — maintain |
| Claude browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `claude.adapter.ts` + selectors/renderer/wait-state, wired live into `content/claude.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`claude-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 2 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:claude:no-login`, then `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| Gemini browser | Browser extension (MV3) | **beta** — live-wired / fixture-tested / live verification pending | Yes — `gemini.adapter.ts` + selectors/renderer/wait-state, wired live into `content/gemini.ts` | Yes — 25 unit + 15 privacy tests + 7 e2e smoke tests (`gemini-adapter.smoke.spec.ts`) | Yes — dedicated privacy test suite + `check:monetization:privacy` passing | Pipeline wired (same API/ledger path as ChatGPT); disabled for real users pending live-session confirmation | Yes — same two-layer kill-switch as ChatGPT, unit + e2e tested | 3 | No | Live verification intentionally deferred this sprint (user decision) — when resumed: `pnpm -w run live:gemini:no-login`, then `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` if needed |
| VS Code extension | Native extension | **beta** | Yes — `ai-status-bar.adapter.ts` (real idle-timer heuristic, not a stub) | Yes — 82 unit tests (up from 34 this sprint: adds `ai-status-bar.adapter`, `mock.adapter`, `status-bar`, `api-client`, and `controller` coverage via a hand-written `vscode` module mock); no e2e host-level harness | Yes — 26 dedicated privacy tests plus new privacy assertions inside the controller/adapter tests; no live-session record | Yes — real event queue + API client wired | Yes — flag-cache polling wired; this sprint also fixed a real bug where disabling the extension mid-wait-state could leave a phantom timer that rendered an ad anyway (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md`) | 4 | No | Add `@vscode/test-electron` e2e harness, then a human-operated live session (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`) — see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` |
| Claude Code terminal | CLI/terminal | **beta** (native official hooks, this sprint) / experimental (via generic adapter, prior sprint) | Yes — `scripts/claude-code-hook.js` + `packages/native-hook-adapter`, wired via Claude Code's own official `settings.json` `hooks` mechanism (confirmed via official docs + the installed `claude` binary's own strings); also reachable via `packages/terminal-adapter`'s generic `wrap`/`demo` modes | Yes — 5 native-hook fixture tests (hostile `tool_input`/`tool_response`/prompt canaries) + 76 shared-package unit tests + 35 generic-adapter tests | Yes — dedicated privacy suites in both packages + `check:native-hooks`/`check:claude-code-native-hooks` gates | No — fully offline, never contacts any API | Yes — two-layer kill-switch, unit-tested | 5 | No | Human-operated session confirming the native hook fires in a real `claude` session (and, separately, inside Claude Code Desktop) — see `CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md` |
| Codex (CLI/terminal) | CLI/terminal | **experimental** (native hooks via `scripts/codex-hook.js`, this sprint; config schema confirmed via primary-source `config.schema.json`, but no local CLI to cross-validate runtime payload) / experimental (via generic adapter) | Yes — `scripts/codex-hook.js` + `packages/native-hook-adapter`; also `packages/terminal-adapter`'s generic `wrap`/`demo` modes | Yes — 5 native-hook fixture tests + 76 shared-package unit tests + 35 generic-adapter tests | Yes — same dedicated privacy suites + gates | No | Yes — same kill-switch | 5 | No | Human-operated session against a real `codex` invocation (resolves the runtime-schema evidence gap) — see `CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md` |
| Codex (IDE/editor) | VS Code/Cursor/Windsurf/JetBrains extension | **experimental** (same native hooks as Codex CLI, tagged `codex_ide` — the IDE extension shares the CLI's config/hooks engine, confirmed via official docs) | Yes — same `scripts/codex-hook.js --ide` | Yes — same as Codex CLI (the `--ide` tagging path is explicitly tested) | Yes — same | No | Yes — same | 5 | No | Human-operated session inside the IDE extension, to confirm hooks fire identically to the bare CLI — see `CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md` |
| Claude Code desktop | Desktop app | **experimental** (same native hooks as the CLI — official docs confirm Desktop shares the same engine/settings — but a credible, unofficial bug report says hooks may not fire in some Desktop modes on Windows) | Yes — same `scripts/claude-code-hook.js`, no Desktop-specific code | Yes — same as Claude Code terminal | Yes — same | No | Yes — same | 6 | No | Human-operated session inside the real Desktop App, specifically to confirm the hook fires at all (addresses the documented firing-reliability gap) — see `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md` |
| Generic terminal AI tools | CLI/terminal | **experimental** | Yes — `packages/terminal-adapter` (`@ad-alt/terminal-adapter`): local JSON config, two-layer kill-switch, synthetic `demo` mode, real-process `wrap` mode (stdio fully inherited, lifecycle-only observation) | Yes — 35 unit tests | Yes — dedicated privacy suite + `check:terminal-adapter` gate | No — fully offline | Yes | 6 | No | Human-operated verification session against any real long-running CLI tool, to reach `beta` — see `REAL_TERMINAL_ADAPTER_DESIGN.md` §13 |
| `browser_mock` | Test fixture (not a real platform) | **verified (fixture only)** | Yes | Yes — 10 tests | Yes | Yes (synthetic) | Yes (synthetic) | N/A | No | None — this is test infrastructure, never describe it as a real platform |
| `antigravity` | Desktop (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | Not confirmed to correspond to any specific researched product this sprint |
| `copilot_status` | VS Code (reserved ID only) | **placeholder** | No | No | No | No | No | Not prioritized | No | None this sprint |

---

**Business priority order (confirmed unchanged by this sprint's audit):**

1. ChatGPT browser — keep verified, protect the revenue pilot.
2. Claude browser — beta; live verification intentionally deferred this
   sprint (explicit user decision, not a technical blocker).
3. Gemini browser — beta; same deferral as Claude.
4. VS Code — beta; needs an e2e harness + a human-operated live session
   to reach verified (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`).
5. Claude Code terminal native hooks (`scripts/claude-code-hook.js` +
   `packages/native-hook-adapter`) — real, tested, `beta`; uses Claude
   Code's own official `settings.json` hooks mechanism, confirmed via
   official docs and the installed `claude` binary's own strings (see
   `CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md`).
6. Codex CLI/IDE native hooks (`scripts/codex-hook.js`) — real, tested,
   `experimental`; uses Codex's own official `hooks.json`/`config.toml`
   `[hooks]` mechanism, confirmed via a primary-source schema file, one
   level below Claude Code's `beta` because no local `codex` CLI was
   available to cross-validate the runtime payload schema (see
   `CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`,
   `CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md`).
7. Claude Code desktop — `experimental`; shares the same native hook
   mechanism as the CLI (official docs confirm a shared engine), but a
   credible, unofficial bug report describes hooks not firing in some
   Desktop modes on Windows, so this is not yet `beta` (see
   `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md`).
8. Generic terminal lifecycle adapter (`packages/terminal-adapter`) —
   real, tested, `experimental`; remains available as a fallback for any
   CLI tool with no official hook mechanism, unaffected by the native
   hook work above (see `REAL_TERMINAL_ADAPTER_DESIGN.md`).

**What changed this sprint (Native Claude Code / Codex Integration
Completion Sprint):**
- Built `packages/native-hook-adapter` (`@ad-alt/native-hook-adapter`) —
  a shared, allowlist-based, no-content normalizer for native hook
  events from Claude Code and Codex. 76 unit tests, including a
  per-platform, per-event-type hostile-payload sweep (53 cases) proving
  every known event type normalizes cleanly even with injected
  `tool_input`/`tool_response`/prompt/`notify`-shaped content.
- Built `scripts/claude-code-hook.js`, wired into Claude Code's own
  official `settings.json` `hooks` mechanism (confirmed via
  `code.claude.com/docs/en/hooks` AND cross-validated against strings in
  the actual installed `@anthropic-ai/claude-code@2.1.42` binary on this
  machine). 5 fixture tests, including hostile canaries. Reaches `beta`.
- Built `scripts/codex-hook.js`, wired into Codex's own official
  `hooks.json`/`config.toml` `[hooks]` mechanism (confirmed via the
  primary-source `openai/codex` repo's `config.schema.json`; `codex` is
  not installed on this machine, so the runtime payload schema is
  inferred, not confirmed — documented honestly). 5 fixture tests.
  Reaches `experimental`, one level below Claude Code, specifically
  because of this evidence gap.
- **Revised** (did not silently overwrite) the prior sprint's
  conclusion that Claude Code Desktop and the Codex IDE extension
  "require separate integration": new official-docs evidence found this
  sprint shows both share the exact same config/hooks engine as their
  CLI counterparts — no separate integration is architecturally needed.
  Both move to `experimental` (not `beta`/`verified`) pending human
  confirmation, and Claude Code Desktop specifically flags a credible,
  unofficial bug report about hooks not firing in some Desktop modes.
- Built `scripts/install-claude-code-hooks.js` and
  `scripts/install-codex-hooks.js` (dry-run by default, explicit
  `--write`, automatic backup, JSON round-trip validation, idempotent
  merge) plus `scripts/check-native-hook-installation.js` — 8 fixture
  tests, all against temp directories only, never a real user config
  path.
- Built `scripts/check-native-hooks.js`, `scripts/check-claude-code-
  native-hooks.js`, and `scripts/check-codex-native-hooks.js`, and wired
  all four new gates into `check:nonbrowser-platforms` as fresh upstream
  dependencies.
- Upgraded `check-platform-certification.js`'s overclaim scanner to the
  same negation-aware pattern already used elsewhere in this repo (it
  was still using a naive substring scan and would have false-failed on
  this sprint's own "do not claim X" sentences), and relaxed its
  Codex/desktop/terminal labeling checks to accept the new, more
  advanced, still-honest `experimental`/`beta` wording instead of only
  the older `requires separate integration` wording — a check update
  justified by real, evidence-backed progress, not a weakening.
- The earlier fixture-only prototype (`scripts/lib/terminal-fixture.js`)
  and the generic `packages/terminal-adapter` package both remain in
  place, passing, and untouched — nothing this sprint built supersedes
  them.

**Nothing in this sprint changed the ChatGPT revenue pilot's scope.** It
remains `browser_chatgpt` only, per
`docs/internal-beta/revenue-pilot/CONTROLLED_REVENUE_PILOT_CRITERIA.md`.

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
