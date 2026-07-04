# Claude Code Terminal — Integration Decision

**Phase:** Safe Real Integration Sprint for Claude Code Terminal, Claude
Code Desktop, and Codex CLI/IDE
**Date:** 2026-07-04

---

## Was real integration implemented?

**Partially, in the only sense that is honest to claim.** This sprint
implemented a real, working, tested, generic lifecycle-only terminal
adapter (`packages/terminal-adapter`, `@ad-alt/terminal-adapter`). It is
**not** Claude-Code-specific — it does not detect, name, special-case, or
depend on the `claude` binary in any way. A user who wants to time their
own Claude Code terminal sessions can explicitly opt in and run:

```
pnpm --filter @ad-alt/terminal-adapter start -- wrap -- claude <their args>
```

This genuinely works today (verified this sprint by running the package's
own automated tests, which spawn real child processes with `stdio:
'inherit'` and assert real exit codes and lifecycle events — see
`packages/terminal-adapter/src/__tests__/wrap.test.ts`). What was **not**
implemented, and is not claimed: any code that specifically recognizes,
auto-detects, auto-wraps, or ships an alias/shortcut for Claude Code
specifically. No Claude-Code-specific configuration, branding, or
auto-invocation exists anywhere in this repo.

## Is it generic lifecycle-only, or Claude-Code-specific?

**Entirely generic.** `wrap.ts` accepts an arbitrary `argv` array and
spawns whatever command is given. It has no knowledge of what "Claude
Code" is. This is a deliberate design choice (see
`REAL_TERMINAL_ADAPTER_DESIGN.md` §1-2) — building tool-specific code
without a confirmed official hook would mean guessing at a real product's
internals, which this repo's history already identified as an
anti-pattern to avoid (see `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_
DECISION.md` §6, "guessing at Claude/Gemini DOM selectors before they
were confirmed against a real session").

## Does it integrate with actual Claude Code hooks?

**No.** No Claude Code first-party hook, plugin API, or extensibility
surface is used, referenced, or assumed anywhere in this implementation.
The adapter works purely at the OS process level (`child_process.spawn`
lifecycle: start, exit, exit code) — a layer that exists for any spawned
process regardless of what it is, not a Claude-Code-provided integration
point.

## Was any official safe hook/API found in the repo?

**No.** Re-confirmed this sprint by re-checking every `package.json` in
this workspace for any Claude-Code-specific dependency and finding none,
consistent with the prior sprint's finding in
`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §1. This is a
grounded, re-verified negative finding, not an assumption.

## What remains before `beta` or `verified`?

Per `REAL_TERMINAL_ADAPTER_DESIGN.md` §13's transition rules:

- **`beta`** requires a human-operated session actually wrapping a real
  `claude` invocation and confirming transparent-passthrough fidelity
  (colors, interactive prompts, Ctrl+C/signal forwarding all preserved
  exactly as if run unwrapped) — not performed this sprint, matching this
  repo's established pattern of never automating or faking human-operated
  verification.
- **`verified`** requires the same dated, human-operated live-session
  evidence-log standard used everywhere else in this repo (e.g.
  `CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md`'s result-log convention) —
  applied here to a real Claude Code terminal session specifically, not
  merely the generic adapter's own tests.

## Privacy review

Clean. `packages/terminal-adapter`'s own test suite (35 tests, all
passing) includes a dedicated privacy suite
(`src/__tests__/privacy.test.ts`) proving: every producible lifecycle
event is free of every forbidden field name; no source file outside
`wrap.ts` imports `node:child_process`; no source file imports
`node:http`/`node:https`/`node:net` (this package makes zero network
calls of any kind); and `wrap.test.ts` proves a "secret-looking" wrapped
argument is never echoed into any emitted event. No command text, prompt
text, response text, or output text is ever read, stored, or transmitted
by this adapter, whether or not it happens to be pointed at a `claude`
invocation.

## Support label

**`experimental`** — via the generic lifecycle adapter. Claude-Code-
specific support (as a named, marketed feature) remains **`requires
separate integration`**: this repo does not claim "Claude Code terminal
supported" as a marketed feature, because that claim would require the
`beta`-level human verification above, which has not happened.

**Do not claim "Claude Code terminal supported" or "verified" anywhere
in this repo's docs, marketing copy, or code comments** — the only
accurate claim is "a generic, opt-in, lifecycle-only terminal adapter
exists and can be pointed at any CLI tool, including Claude Code, by an
explicit user action; it has not been verified against a real Claude
Code session." This exact distinction is mechanically enforced by
`check:terminal-adapter` (Phase 7).

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
