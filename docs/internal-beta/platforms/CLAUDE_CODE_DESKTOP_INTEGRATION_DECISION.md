# Claude Code Desktop — Integration Decision

**Phase:** Safe Real Integration Sprint for Claude Code Terminal, Claude
Code Desktop, and Codex CLI/IDE
**Date:** 2026-07-04

---

## Hard restrictions re-affirmed

No OCR. No screenshots. No window-content scraping. No accessibility-tree
scraping (unless explicitly reviewed and proven privacy-safe — not done
here). No clipboard monitoring. No automation of prompts. No automation
of login. No process-memory inspection. Every one of these is checked
against the implementation below: **none of them appear anywhere in this
repo**, confirmed by the same static source scans this sprint built for
`packages/terminal-adapter` (which contains no desktop-specific code of
any kind) and by direct inspection of every file touched this sprint.

## Does this repo contain a safe official plugin/API/hook for Claude Code desktop?

**No.** This repo has:

- No Electron bridge, no native-messaging host, no desktop SDK dependency
  in any `package.json` in the workspace.
- No accessibility-API dependency (e.g. no `node-window-manager`,
  `active-win`, or platform accessibility bindings) anywhere in
  `package.json` or `pnpm-lock.yaml`.
- No documented first-party Claude Code desktop extensibility surface
  referenced in any doc in this repo, this sprint or prior sprints.
- The only pre-existing artifact is a reserved (unused) adapter-ID string,
  `antigravity`, in `packages/shared/src/schemas/adapters.ts`'s
  `DESKTOP_ADAPTER_IDS` array — a placeholder identifier with zero
  adapter implementation behind it, not evidence of a hook.

This finding is unchanged from, and re-confirms, the prior sprint's
research (`DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` §2,
`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §2). Nothing
discovered this sprint changes this conclusion.

## Decision

**`requires separate integration`.** No implementation was attempted
this sprint, and none should be, because every currently-known method of
observing a desktop application's AI wait-state without a first-party
hook (screen capture + OCR, accessibility-tree text reading, window-title
polling without proven content-safety, clipboard monitoring) either
directly violates this sprint's non-negotiable privacy rules or requires
an unverified assumption this repo cannot make responsibly.

## Why unsupported (not "coming soon" or "in progress")

There is a real, structural reason, not merely unfinished work: the safe
integration surface this would require (a confirmed, content-free
lifecycle hook analogous to VS Code's `onDidChangeActiveTerminal`) does
not exist in any form this repo has access to or can verify. Labeling
this "in progress" would imply a known path is being executed; none is.

## What safe API/hook would be required

A first-party Claude Code desktop plugin/extension API exposing
structural, content-free lifecycle events — e.g. "a conversation turn
started," "a conversation turn ended," "the window gained/lost focus" —
analogous in shape to VS Code's `onDidChangeActiveTerminal` /
`onDidOpenTerminal` / `onDidCloseTerminal`, and explicitly *not* exposing
any window content, accessibility-tree text, or screen buffer. Until such
an API is confirmed to exist (external product research, out of scope
for this repo's automated engineering work), no implementation attempt is
appropriate.

## Why this does not block the controlled ChatGPT pilot

The controlled pilot approved in `GO_NO_GO_FINAL_INTERNAL_PILOT.md` is
explicitly scoped to "a controlled ChatGPT browser internal pilot only."
Desktop support of any kind — Claude Code desktop specifically or
desktop AI clients generally — was never a dependency of that decision,
was never claimed as in-scope, and remains entirely outside the pilot's
critical path. `FINAL_RISK_REGISTER.md` already tracks this class of gap
(R-01, R-02 cover the analogous Claude/Gemini-browser and VS Code cases)
without it blocking anything; this document adds the equivalent entry
for desktop.

## Why fake support would be unsafe

This repo must never claim "Claude Code desktop supported" without a
real, safe integration behind it. Doing so would force one of two
outcomes: (a) actually building one of the
forbidden methods above (screen scraping, OCR, accessibility-tree
reading, clipboard monitoring) — each of which is a direct privacy
violation and a plausible source of leaking real conversation content,
account data, or credentials visible on a user's desktop, or (b) shipping
a support claim with no adapter behind it at all, which is a direct
integrity violation this sprint's rules (and every prior sprint's rules)
explicitly forbid. Neither is acceptable; `requires separate integration`
is the only honest label.

## Support label

**`requires separate integration`.** Unchanged from every prior sprint's
finding, re-verified this sprint, with no new evidence in either
direction.

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
