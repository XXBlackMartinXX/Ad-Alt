# Claude Code / Codex Support — Research Gate

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03

> This document exists so Claude Code and Codex support is never faked.
> Per CANARY 12: if a platform cannot be safely implemented this sprint,
> it is labeled `requires separate integration` with its exact blocker
> stated plainly, not silently marked as if it were further along.

---

## 1. Claude Code terminal

- **What is known from this repo:** Nothing product-specific — this repo
  has no existing code, dependency, or documentation referencing Claude
  Code's terminal CLI internals. What IS known generically: any terminal
  CLI tool's AI-generation activity is only observable, without reading
  terminal content, via the wrapping-process's own lifecycle (start time,
  exit time, exit code) — see `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md`
  §1 for the full design.
- **Whether integration exists:** No real integration exists. A
  **fixture-only prototype** proving the lifecycle-only pattern in
  isolation was built this sprint (`scripts/lib/terminal-fixture.js` +
  `scripts/terminal-fixture-runner.js`) — it does not wrap or observe a
  real Claude Code session.
- **Whether implementation is safe:** The *design* (process-lifecycle
  wrapper, never reading stdin/stdout/stderr content) is safe by
  construction. A *real* implementation is not attempted this sprint
  because it requires solving transparent terminal passthrough (colors,
  interactive prompts, Ctrl+C/signal forwarding) correctly across
  bash/zsh/PowerShell — a real engineering effort, not a research
  question, and out of scope for "research + fixture-only prototype."
- **What would be needed:** (1) A real CLI wrapper package (e.g.
  `packages/terminal-wrapper` or similar) that spawns the user's real
  `claude` command as a child process with inherited stdio (so the user
  sees identical behavior to running it unwrapped), while only observing
  the child process's lifecycle events. (2) Confirmation that the
  wrapper introduces no meaningful latency or behavioral difference for
  the wrapped tool. (3) A genuinely new adapter ID added deliberately to
  `packages/shared/src/schemas/adapters.ts` (not the "manual" ID used by
  the fixture-only prototype, which is explicitly developer-tooling-only
  and must not be reused for a real shipped adapter). (4) A real, opt-in
  local config file the user edits to enable the wrapper — never
  auto-installed.
- **What must not be done:** Piping/inspecting the wrapped process's
  actual stdout/stderr content (this typically contains the AI's actual
  response text — reading it here is exactly as much of a privacy
  violation as reading it in a browser DOM); any pty-capture
  (`script`/`asciinema`-style) library that records session content;
  shell history reading; any attempt to infer wait-state from keystroke
  timing (this is a form of behavioral/keylogging inference the
  non-negotiable rules exclude even though it is not literally "reading"
  content).
- **Whether a fixture prototype exists:** Yes — see
  `TERMINAL_PROTOTYPE_VERIFICATION.md`. It is intentionally
  tool-agnostic (does not name or detect Claude Code specifically).
- **Final label: `requires separate integration`** (real product);
  `fixture-only` (the generic prototype covers this case's architecture).

## 2. Claude Code desktop

- **What is known from this repo:** Nothing. No evidence of a public
  extension/plugin API for a "Claude Code desktop" application is present
  anywhere in this repo's dependencies, docs, or code history. The
  `antigravity` adapter ID reserved in `packages/shared/src/schemas/
  adapters.ts`'s `DESKTOP_ADAPTER_IDS` is NOT confirmed to correspond to
  Claude Code desktop specifically — it predates this sprint's research
  and its exact intended target product is not documented.
- **Whether integration exists:** No.
- **Whether implementation is safe:** Unknown and likely no — without a
  confirmed first-party extension API exposing content-free lifecycle
  events, the only remaining techniques (screen-scraping, OCR,
  accessibility-tree text reading) are explicitly forbidden by this
  mission's non-negotiable privacy rules, because a desktop AI
  application's visible window content typically IS the AI's response.
- **What would be needed:** Confirmation (external research, not
  achievable by inspecting this repo alone) of whether Claude Code
  desktop exposes any plugin/extension API with structural, content-free
  lifecycle events (analogous to VS Code's `onDidChangeActiveTerminal`).
  Without that, there is no safe path forward at all.
- **What must not be done:** Screen capture, OCR, accessibility-API text
  reading, window-title polling without first confirming the title never
  contains conversation content, any clipboard monitoring.
- **Whether a fixture prototype exists:** No — a fixture prototype for a
  platform with no known safe integration point would only demonstrate
  the same generic lifecycle pattern already proven by
  `terminal-fixture.js`; it would add nothing platform-specific and was
  not built separately for this reason.
- **Final label: `requires separate integration`.**

## 3. Codex CLI/terminal

- **What is known from this repo:** Nothing product-specific. Same
  generic terminal-tool reasoning as Claude Code terminal (§1) applies —
  Codex CLI/terminal has no known specifics differentiating it from any
  other terminal AI tool for the purposes of this architecture.
- **Whether integration exists:** No.
- **Whether implementation is safe:** Same as §1 — the lifecycle-only
  wrapper design is safe; a real implementation is not attempted.
- **What would be needed:** Identical to §1 — the same real CLI wrapper,
  generalized (or configured) to also wrap a `codex` command. No
  Codex-specific research gap exists beyond what's already covered in
  §1, since the safe design is tool-agnostic by construction.
- **What must not be done:** Identical list to §1.
- **Whether a fixture prototype exists:** Yes — the same
  `terminal-fixture.js` prototype; it is intentionally generic and was
  written to cover this case without modification.
- **Final label: `requires separate integration`** (real product);
  `fixture-only` (the generic prototype covers this case's architecture).

## 4. Codex IDE/editor integration

- **What is known from this repo:** Nothing. Whether "Codex" ships an IDE
  extension, and for which IDE(s), is not established anywhere in this
  repo. This is a genuine open research question, not merely an
  unimplemented feature.
- **Whether integration exists:** No.
- **Whether implementation is safe:** Cannot be assessed without first
  knowing the concrete product surface. If Codex is VS-Code-extension-
  shaped, the existing `apps/extension` lifecycle-hook pattern
  (`AiStatusBarAdapter`) would very likely transfer directly and safely.
  If it is a different IDE or a different integration shape, this
  assessment does not apply and must be redone.
- **What would be needed:** External product research (what IDE(s) does
  Codex integrate with, does it expose any extension API, what lifecycle
  events if any are available) before any code is written.
- **What must not be done:** Reading Codex's own output channel, webview,
  or panel content (this is again "reading the AI's response,"
  regardless of which UI surface it appears in).
- **Whether a fixture prototype exists:** No — there is nothing concrete
  enough yet to prototype against.
- **Final label: `requires separate integration`.**

---

## Summary

| Platform | Final label |
|----------|--------------|
| Claude Code terminal | `requires separate integration` (product) / `fixture-only` (prototype) |
| Claude Code desktop | `requires separate integration` |
| Codex CLI/terminal | `requires separate integration` (product) / `fixture-only` (prototype) |
| Codex IDE/editor integration | `requires separate integration` |

No code claiming to be a real Claude Code or Codex integration exists
anywhere in this repo as of this commit. The only artifacts related to
this research are: this document, `DESKTOP_TERMINAL_INTEGRATION_
ARCHITECTURE.md`, and the tool-agnostic fixture-only prototype in
`scripts/lib/terminal-fixture.js` / `scripts/terminal-fixture-runner.js`.

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
