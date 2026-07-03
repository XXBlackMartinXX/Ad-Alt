# Terminal / Claude Code / Codex — Feasibility Decision

**Phase:** Nonbrowser Platform Readiness
**Date:** 2026-07-03

> This is the consolidated decision record for every non-browser,
> non-VS-Code platform in scope. It supersedes nothing — it draws
> together `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` and
> `CLAUDE_CODE_CODEX_SUPPORT_RESEARCH.md` (both written in the prior
> sprint) into one decision-focused document, and adds the explicit
> "build or don't build a CLI wrapper MVP" decision this sprint's
> mission asked for.

**Hard rule this decision honors throughout:** no terminal support is
ever built by scraping terminal output, reading shell history,
monitoring clipboard, OCR, screenshots, keylogging, or process-memory
inspection. Every "safe implementation model" below uses only:
explicit opt-in CLI wrapper, lifecycle-only events, user-visible local
config, kill-switch, synthetic fixtures — never command/output content
capture.

---

## 1. Claude Code terminal

- **Integration exists now:** No real integration. A **fixture-only
  prototype** exists (`scripts/lib/terminal-fixture.js` +
  `scripts/terminal-fixture-runner.js`, built in the prior sprint) that
  proves the safe lifecycle-only pattern in complete isolation — it does
  not wrap or observe a real Claude Code session, and is intentionally
  tool-agnostic (it does not name or detect Claude Code specifically).
- **Safe API/hook exists:** Not confirmed. No public Claude Code
  extension/plugin API with content-free lifecycle events is known to
  this repo's research.
- **Unsafe methods rejected:** Piping/inspecting the wrapped process's
  real stdout/stderr (this typically contains the AI's actual response
  text); pty-capture (`script`/`asciinema`-style) recording; shell
  history reading; keystroke-timing inference; any bot-check or
  automation-detection bypass.
- **Safe implementation model:** An explicit, user-invoked CLI wrapper
  that spawns the real `claude` command as a child process with
  inherited stdio (so the wrapped tool behaves identically to running it
  unwrapped), observing only the child process's own lifecycle
  (start time, exit time, exit code) — never its input/output streams'
  content.
- **Current blocker:** Building the *real* wrapper (beyond the existing
  fixture-only prototype) requires solving transparent stdio passthrough
  correctly across bash/zsh/PowerShell (colors, interactive prompts,
  Ctrl+C/signal forwarding) — a genuine engineering task, not a research
  question, and not attempted this sprint (see §6 for why).
- **Tests needed (for a real wrapper, beyond what the prototype already has):**
  passthrough-fidelity tests (wrapped output byte-identical to unwrapped),
  signal-forwarding tests, and the same privacy/kill-switch test pattern
  the fixture-only prototype already established
  (`scripts/__tests__/terminal-fixture.test.js`).
- **Verification needed:** A human-operated session confirming the real
  wrapper doesn't change the wrapped tool's behavior, plus the same
  dated-evidence-log standard used elsewhere in this repo.
- **Support label:** `requires separate integration` (real product);
  `fixture-only` (the existing prototype proves the architecture).

## 2. Claude Code desktop

- **Integration exists now:** No. Only an unrelated, unconfirmed adapter
  ID reservation (`antigravity` in `packages/shared/src/schemas/
  adapters.ts`'s `DESKTOP_ADAPTER_IDS`) predates this research and is
  not confirmed to correspond to Claude Code desktop specifically.
- **Safe API/hook exists:** Not confirmed. No public extension/plugin
  API is known to this repo's research.
- **Unsafe methods rejected:** Screen capture + OCR (would read the
  AI's response directly); accessibility-tree text reading (same
  content-reading problem as OCR via a different API); window-title
  polling without first confirming the title never contains conversation
  content; clipboard monitoring.
- **Safe implementation model:** None currently known. Would require a
  confirmed first-party plugin API exposing structural, content-free
  lifecycle events (analogous to VS Code's `onDidChangeActiveTerminal`)
  before any implementation could be attempted safely.
- **Current blocker:** No safe integration point is known to exist at
  all. This is the correct state to leave it in rather than building
  something unsafe to "have support."
- **Tests needed:** None until a safe integration point is confirmed —
  writing tests against a nonexistent safe API would be premature.
- **Verification needed:** External product research (does Claude Code
  desktop expose any extension API at all) before anything else.
- **Support label:** `requires separate integration`.

## 3. Codex CLI

- **Integration exists now:** No real integration. Covered by the same
  tool-agnostic fixture-only prototype as Claude Code terminal (§1) —
  the prototype was written generically specifically so it requires no
  Codex-specific modification to demonstrate the same safe pattern.
- **Safe API/hook exists:** Same reasoning as §1 — a real CLI tool's
  process lifecycle (start/exit) is always observable without reading
  its content, regardless of which specific AI CLI tool it is.
- **Unsafe methods rejected:** Identical list to §1.
- **Safe implementation model:** Identical to §1 — the same real CLI
  wrapper, generalized (or configured) to also wrap a `codex` command.
- **Current blocker:** Identical to §1 (transparent passthrough
  engineering, not a research gap).
- **Tests needed:** Identical to §1.
- **Verification needed:** Identical to §1.
- **Support label:** `requires separate integration` (real product);
  `fixture-only` (the existing prototype covers this case generically).

## 4. Codex IDE/editor

- **Integration exists now:** No. Whether Codex ships an IDE extension,
  and for which IDE(s), is not established anywhere in this repo — this
  remains a genuine open research question, not merely an unimplemented
  feature.
- **Safe API/hook exists:** Cannot be assessed without first knowing the
  concrete product surface. If Codex is VS-Code-extension-shaped, the
  existing `apps/extension`'s `AiStatusBarAdapter` lifecycle-hook pattern
  (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md`) would very likely
  transfer directly and safely; if it targets a different IDE, this
  assessment does not apply and must be redone.
- **Unsafe methods rejected:** Reading Codex's own output channel,
  webview, or panel content (same "reading the AI's response" problem,
  regardless of which UI surface it appears in).
- **Safe implementation model:** Would reuse the VS Code idle-timer-style
  lifecycle pattern if the target IDE is VS Code; otherwise unknown.
- **Current blocker:** Unresearched product surface — external research
  needed before any code.
- **Tests needed:** None until the product surface is confirmed.
- **Verification needed:** External product research first.
- **Support label:** `requires separate integration`.

## 5. Generic terminal AI tools

- **Integration exists now:** No real integration. Covered by the same
  fixture-only prototype as §1/§3 — this is precisely why the prototype
  was built tool-agnostic in the first place: "generic terminal AI
  tools" and "Claude Code terminal"/"Codex CLI" are architecturally the
  identical case (wrap a process, observe only its lifecycle).
- **Safe API/hook exists:** Same reasoning as §1 — any CLI process's
  start/exit lifecycle is observable without reading its content.
- **Unsafe methods rejected:** Identical list to §1.
- **Safe implementation model:** Identical to §1.
- **Current blocker:** Identical to §1.
- **Tests needed:** Identical to §1 — already satisfied at the prototype
  level (`scripts/__tests__/terminal-fixture.test.js`, 14 tests covering
  privacy and both kill-switch layers).
- **Verification needed:** Same as §1, once/if a real wrapper is built.
- **Support label:** `fixture-only` (prototype); `experimental` (as a
  general product concept, since the pattern is proven but nothing real
  is wired to any specific tool).

---

## 6. CLI Wrapper MVP Decision (this sprint)

**Decision: do not build a new CLI wrapper this sprint. The existing
fixture-only prototype (built the prior sprint) already satisfies every
"if implemented" requirement this mission's Phase 5 lists**, so there is
nothing further to safely add without crossing from "prove the
architecture" into "ship a real product integration" — a materially
different, larger effort this mission does not ask for and this repo's
evidence does not yet justify (no confirmed product demand for any one
specific terminal tool, no confirmed safe passthrough implementation).

Checking the existing prototype against every stated requirement:

| Requirement (if implemented) | Satisfied by the existing prototype? |
|---|---|
| Explicit user-run command only | Yes — `node scripts/terminal-fixture-runner.js`, run manually, once |
| No background daemon | Yes — runs once to completion and exits; no persistent process |
| No command/output reading | Yes — no `child_process` usage at all (statically enforced by `check:terminal-prototype`) |
| No terminal buffer scraping | Yes — same as above |
| No shell history reading | Yes — never reads any shell history file |
| Lifecycle-only synthetic events | Yes — hardcoded fixed timestamp + duration, not measured from anything real |
| Kill-switch | Yes — global + per-adapter + `kill_switch_<id>` flag, all unit-tested |
| Privacy tests | Yes — `scripts/__tests__/terminal-fixture.test.js` |
| fixture-only/experimental label | Yes — explicitly labeled in `TERMINAL_PROTOTYPE_VERIFICATION.md` and the platform matrix |

**Exact reason a *real* (non-fixture) wrapper is not built:**
1. No specific terminal AI tool has confirmed product demand recorded
   in this repo — building a real wrapper for "Claude Code terminal
   specifically" or "Codex CLI specifically" without that would be
   guessing at a target, the same anti-pattern already corrected once
   this repo's history (guessing at Claude/Gemini DOM selectors before
   they were confirmed against a real session).
2. Transparent stdio passthrough (colors, interactive prompts, signal
   forwarding) is a real, nontrivial engineering task that has not been
   attempted or estimated — building it now, untested against a real
   target tool, would risk shipping something that subtly breaks the
   wrapped tool's own behavior, which is worse than not shipping it.
3. Building a real wrapper prematurely is exactly the kind of "build
   fake/partial support to look further along" this mission's hard
   rules explicitly forbid (CANARY-equivalent: do not overclaim terminal
   support).

**Status left as:** `requires separate integration` for every real
terminal/Claude-Code/Codex product surface; `fixture-only` for the
architecture-proving prototype that already exists. No fake support is
claimed anywhere.

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
