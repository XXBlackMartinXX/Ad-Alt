# Terminal / Desktop / Codex — Deep Integration Audit

**Phase:** Safe Real Integration Sprint for Claude Code Terminal, Claude
Code Desktop, and Codex CLI/IDE
**Date:** 2026-07-04

> This audit is grounded in the actual current state of this repository
> as of this sprint's baseline commit. Where no safe hook/API is
> confirmed to exist in this repo, that is stated explicitly rather than
> assumed. This audit supersedes nothing written previously — it draws on
> `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` and
> `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` (both from prior
> sprints), re-verifies their findings against the repo as it stands
> today, and adds the two things this sprint requires that they do not
> already cover: (a) a genuinely new, more capable generic lifecycle
> adapter package (`packages/terminal-adapter`, built this sprint — see
> `REAL_TERMINAL_ADAPTER_DESIGN.md`), and (b) three separate, per-platform
> decision documents (Phases 4-6 of this sprint).

**Non-negotiable constraints re-affirmed for every row below:** no screen
scraping, no OCR, no keylogging, no clipboard monitoring, no shell
history reading, no terminal buffer reading, no process memory
inspection, no reading command text, no reading AI prompt/response text,
no automating login, no automating prompt entry, no hidden background
monitoring, no invisible daemon behavior, no proxying private AI traffic.

---

## 1. Claude Code terminal

- **Current repo implementation:** No integration specific to Claude
  Code exists. The only terminal-shaped code in this repo is (a) the
  fixture-only prototype from a prior sprint (`scripts/lib/terminal-
  fixture.js`, `scripts/terminal-fixture-runner.js`, adapter ID `manual`,
  purely synthetic, never spawns a process), and (b) the new
  `packages/terminal-adapter` package built this sprint (see
  `REAL_TERMINAL_ADAPTER_DESIGN.md`), which is **tool-agnostic** — it does
  not name, detect, or specially recognize a `claude` binary or any other
  specific CLI tool.
- **Possible integration points:** (a) An explicit, user-invoked wrapper
  command that spawns the real `claude` CLI as a child process with
  `stdio: 'inherit'` (transparent passthrough — the child writes directly
  to the real terminal, never through our process), observing only
  process lifecycle (start timestamp, exit timestamp, exit code,
  wall-clock duration). (b) A first-party Claude Code hook/plugin/event
  API, if one exists, that could emit structured lifecycle events without
  this repo needing to spawn or wrap anything itself.
- **Safe official hook/API confirmed to exist in this repo:** **No.**
  This repo contains no Claude-Code-specific SDK dependency, no
  `@anthropic-ai/claude-code` (or similar) package reference anywhere in
  any `package.json` in this workspace, and no documentation of a
  first-party Claude Code extensibility API. Grounding this claim: a
  workspace-wide search for any Claude-Code-specific package or hook
  reference returns nothing outside this sprint's own docs. This finding
  is unchanged from the prior sprint's research
  (`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §1) and is
  re-confirmed, not assumed.
- **Can implementation be lifecycle-only:** Yes, in principle — process
  start/exit is always observable without reading process I/O content,
  regardless of which CLI tool is wrapped. This is exactly what
  `packages/terminal-adapter`'s `wrap` mode implements (see below),
  generically, without any Claude-Code-specific logic.
- **Privacy risk:** Low, for the generic lifecycle-only wrap pattern
  itself (no content is ever read). The risk that must be actively
  guarded against is scope creep — e.g., a future contributor adding
  stdout/stderr capture "just for debugging." `check:terminal-adapter`
  (Phase 7 of this sprint) statically enforces against this.
- **Forbidden approaches (re-affirmed):** piping or tee-ing the wrapped
  process's stdout/stderr for inspection (this typically contains the
  AI's actual response text); pty-capture (`script`/`asciinema`-style)
  recording; shell history reading; any bypass of Claude Code's own
  authentication or bot-detection.
- **Safe implementation path:** The generic `wrap` mode in
  `packages/terminal-adapter` (built this sprint) satisfies this without
  any Claude-Code-specific code — a user who wants to time their own
  `claude` invocations can run
  `pnpm --filter @ad-alt/terminal-adapter start -- wrap -- claude <args>`
  themselves, explicitly, per-invocation. This repo does not ship a
  `claude`-specific binary name, alias, or auto-detection — doing so
  would require assuming implementation details of a real Claude Code
  session that this repo has not verified.
- **Tests needed:** Unit tests proving `wrap` mode passes `stdio:
  'inherit'` to `child_process.spawn` (i.e., never creates a pipe an
  attacker or bug could read from) and that its emitted event never
  contains the wrapped command's argv, text, or exit output — both
  implemented this sprint (`packages/terminal-adapter/src/__tests__/`).
- **Verification needed for a stronger label:** A human-operated session
  actually wrapping a real `claude` invocation and confirming (a) the
  wrapped tool behaves identically to running it unwrapped (colors,
  interactive prompts, Ctrl+C/signal forwarding all preserved), and (b)
  no lifecycle event contains any content field. This has not been done
  this sprint (no human-operated real Claude Code terminal session was
  run, consistent with this sprint's rules against any such automated or
  assumed verification).
- **Current support label:** `experimental` — a real, working, generic
  lifecycle-only wrapper exists and is tested, but it is not
  Claude-Code-specific and has not been verified against a real Claude
  Code session.
- **Completable this sprint:** The generic adapter — yes (done). A
  Claude-Code-specific "beta" or "verified" label — no, this requires
  human-operated verification against the real tool, out of scope for an
  automated sprint per this repo's own live-verification safety rules.
- **Blocks the controlled ChatGPT pilot:** **No.** The ChatGPT pilot is
  browser-only; this row is additive and has no dependency in either
  direction.

## 2. Claude Code desktop

- **Current repo implementation:** None. The only artifact that
  pre-dates this research is an adapter ID reservation,
  `antigravity`, in `packages/shared/src/schemas/adapters.ts`'s
  `DESKTOP_ADAPTER_IDS` array (alongside `desktop_chatgpt` and
  `desktop_claude`) — these are reserved string identifiers only, with
  no adapter implementation behind any of them, and none is confirmed to
  correspond to a real, current "Claude Code desktop" product
  specifically.
- **Possible integration points:** A first-party desktop extension/plugin
  API exposing structural, content-free lifecycle events (window
  open/close, focus/blur) analogous to VS Code's
  `onDidChangeActiveTerminal`. No such API is referenced anywhere in this
  repo.
- **Safe official hook/API confirmed to exist in this repo:** **No.**
  There is no desktop-app SDK dependency, no Electron/native-messaging
  bridge, and no documented extensibility surface for any desktop AI
  client anywhere in this workspace. This is a research gap, not
  something this repo currently has tooling for.
- **Can implementation be lifecycle-only:** Cannot be assessed — there is
  nothing to be lifecycle-only *about* until a real hook is confirmed to
  exist. Every alternative this repo could reach for without one
  (screenshots, OCR, accessibility-tree text reading, window-title
  polling) either directly violates the non-negotiable privacy rules or
  requires unverified assumptions about what a window title or
  accessibility node might contain.
- **Privacy risk:** High for every currently-known alternative method
  (screen scraping, OCR, accessibility-tree scraping, clipboard
  monitoring) — all explicitly forbidden by this sprint's rules and by
  `FINAL_PRIVACY_SECURITY_REVIEW.md`'s prior findings.
- **Forbidden approaches (re-affirmed):** screen capture + OCR of the
  desktop window; accessibility-tree text reading; clipboard monitoring;
  automating login; process memory inspection; window-title polling
  without first proving the title API never surfaces conversation
  content (not proven, and not attempted).
- **Safe implementation path:** None exists today. The only honest path
  forward is: do not implement, document the blocker (this document +
  `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`), and wait for either (a)
  a confirmed first-party extensibility API, or (b) explicit, reviewed,
  proven-content-free OS-level window lifecycle events.
- **Tests needed:** None — writing tests against a nonexistent safe API
  would be premature and misleading.
- **Verification needed:** External product research confirming whether
  Claude Code desktop exposes any extension/plugin API at all. Not
  performed this sprint (out of scope for an automated engineering
  sprint; requires human product research outside this repo).
- **Current support label:** `requires separate integration`.
- **Completable this sprint:** No — blocked on an external, unconfirmed
  prerequisite (a safe hook existing at all).
- **Blocks the controlled ChatGPT pilot:** **No.** Desktop support was
  never in scope for the ChatGPT-browser-only pilot.

## 3. Codex CLI

- **Current repo implementation:** None specific to Codex. Covered
  identically to Claude Code terminal (§1) by the same tool-agnostic
  `packages/terminal-adapter` `wrap` mode — the package does not name or
  detect "Codex" any more than it names or detects "Claude Code." This is
  intentional: a real CLI process's start/exit lifecycle is observable
  without reading its content regardless of which specific AI CLI tool it
  is, so one generic implementation covers every such tool without
  per-tool code.
- **Possible integration points:** Same as §1 — explicit user-invoked
  wrapper around the `codex` binary, transparent stdio passthrough,
  lifecycle-only observation.
- **Safe official hook/API confirmed to exist in this repo:** **No.**
  No Codex-specific SDK, dependency, or documented hook exists anywhere
  in this workspace.
- **Can implementation be lifecycle-only:** Yes — identical reasoning to
  §1.
- **Privacy risk:** Low for the generic wrap pattern; same scope-creep
  risk as §1, same mitigation (`check:terminal-adapter`).
- **Forbidden approaches (re-affirmed):** Identical list to §1.
- **Safe implementation path:** Identical to §1 — the same
  `packages/terminal-adapter` `wrap` mode, unmodified, run by a user
  against `codex` instead of `claude`.
- **Tests needed:** Identical to §1 (already satisfied — the tests are
  tool-agnostic by construction).
- **Verification needed:** Identical to §1 — a human-operated session
  against a real `codex` invocation, not performed this sprint.
- **Current support label:** `experimental` (via the generic adapter,
  identical basis to §1).
- **Completable this sprint:** Same answer as §1 — the generic adapter is
  done; a Codex-specific "beta"/"verified" label is not.
- **Blocks the controlled ChatGPT pilot:** **No.**

## 4. Codex IDE/editor

- **Current repo implementation:** None. Whether Codex ships a VS
  Code-shaped IDE extension, and for which IDE(s), is not established
  anywhere in this repo — this remains an open external research
  question, unchanged from the prior sprint's finding
  (`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §4).
- **Possible integration points:** If Codex's IDE surface is VS
  Code-shaped, the existing, already-shipped `apps/extension`
  `AiStatusBarAdapter` lifecycle-hook pattern (idle-timer heuristic driven
  by `vscode.window.onDidChangeActiveTerminal` and related focus-only
  events) would very likely transfer directly. This is not confirmed,
  because the concrete product surface is not confirmed.
- **Safe official hook/API confirmed to exist in this repo:** **No** — no
  Codex-IDE-specific dependency or reference exists anywhere in this
  workspace.
- **Can implementation be lifecycle-only:** Cannot be assessed without
  first confirming the concrete product surface.
- **Privacy risk:** Unknown until the product surface is confirmed; the
  known-unsafe alternative (reading Codex's own output channel, webview,
  or panel content) is forbidden regardless of surface.
- **Forbidden approaches (re-affirmed):** Reading Codex's own output
  channel/webview/panel content — this is "reading AI response text"
  regardless of which UI widget it appears in.
- **Safe implementation path:** None can be specified without first
  confirming the product surface. No implementation is attempted this
  sprint.
- **Tests needed:** None until the product surface is confirmed.
- **Verification needed:** External product research first (not
  performed this sprint — out of scope).
- **Current support label:** `requires separate integration`.
- **Completable this sprint:** No.
- **Blocks the controlled ChatGPT pilot:** **No.**

## 5. Generic terminal AI tools

- **Current repo implementation:** **Yes — this is the one row with a
  genuinely new real implementation this sprint.**
  `packages/terminal-adapter` (built this sprint; see
  `REAL_TERMINAL_ADAPTER_DESIGN.md` for the full design and
  `CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md` /
  `CODEX_CLI_IDE_INTEGRATION_DECISION.md` for how it applies to those
  specific tools) provides: an explicit-opt-in CLI (`demo` mode:
  fully-synthetic wait-state simulation with zero process spawning;
  `wrap` mode: spawns an arbitrary user-specified command with `stdio:
  'inherit'`, observing only its lifecycle), a local JSON config file,
  a two-layer kill-switch (global + per-adapter, mirroring
  `packages/platform-core`'s `isAdapterDisabled`), and lifecycle-only
  event emission restricted to the sprint's allowed event vocabulary.
  This supersedes nothing — the older fixture-only prototype
  (`scripts/lib/terminal-fixture.js`) remains in place and passing.
- **Possible integration points:** Already implemented — a user runs the
  CLI explicitly, once, per session they choose to time.
- **Safe official hook/API confirmed to exist in this repo:** N/A — this
  row does not depend on any specific tool's official API; it depends
  only on the OS-level guarantee that a spawned child process's
  lifecycle (start/exit/exit-code) is observable without touching its
  I/O content, which is a property of `child_process.spawn` with `stdio:
  'inherit'`, not of any particular AI tool.
- **Can implementation be lifecycle-only:** Yes — implemented as such.
- **Privacy risk:** Low — verified this sprint by (a) unit tests
  asserting the emitted event schema contains no forbidden field, (b)
  unit tests asserting `wrap` mode never sets `stdio: 'pipe'` or attaches
  a `data` listener to a child's stdout/stderr, and (c) the new
  `check:terminal-adapter` gate's static source scan.
- **Forbidden approaches (re-affirmed):** Identical list to §1; none used
  in the implementation.
- **Safe implementation path:** Implemented this sprint. See
  `REAL_TERMINAL_ADAPTER_DESIGN.md`.
- **Tests needed:** Implemented this sprint —
  `packages/terminal-adapter/src/__tests__/*.test.ts`.
- **Verification needed for a stronger label than `experimental`:** A
  human-operated session using `wrap` mode against a real long-running
  CLI tool of the user's choice, confirming transparent passthrough
  fidelity. Not performed this sprint (would require a human operator and
  a real external tool, matching this repo's existing pattern of
  deferring human-operated verification rather than faking it).
- **Current support label:** `experimental`.
- **Completable this sprint:** Yes — done, to the `experimental` level.
- **Blocks the controlled ChatGPT pilot:** **No.**

## 6. VS Code integrated terminal

- **Current repo implementation:** Already shipped and unchanged this
  sprint. `apps/extension`'s `AiStatusBarAdapter` uses
  `vscode.window.onDidChangeActiveTerminal` (an existing, real VS Code
  API) to drive its idle-timer heuristic — this fires on terminal *focus
  changes* only, never terminal *content*. Confirmed present by direct
  source read this sprint (unchanged from `VSCODE_EXTENSION_DEEP_
  VERIFICATION.md`'s prior finding).
- **Possible integration points:** Already exhausted the safe surface
  available; the only remaining VS Code terminal API that would add more
  signal is `vscode.window.onDidWriteTerminalData`, which is explicitly
  rejected (see below).
- **Safe official hook/API confirmed to exist in this repo:** **Yes** —
  `onDidChangeActiveTerminal`, `onDidOpenTerminal`, `onDidCloseTerminal`
  are all real, currently-used-or-usable VS Code APIs that are
  content-free by design (they report terminal *existence and focus*,
  never terminal *data*).
- **Can implementation be lifecycle-only:** Yes — already is.
- **Privacy risk:** Low — already covered by 82 existing unit tests
  (Mission 4) including explicit privacy-boundary tests.
- **Forbidden approaches (re-affirmed):** `vscode.window.
  onDidWriteTerminalData` is explicitly rejected — it is a real VS Code
  API that exposes the terminal's actual written data/content, which is
  exactly the forbidden "terminal output text" category. This repo does
  not use it anywhere (confirmed by source read this sprint).
- **Safe implementation path:** Already implemented.
- **Tests needed:** Already satisfied (82 unit tests, `browser-extension`
  aside — this count is for `apps/extension`).
- **Verification needed for `verified` (vs. current `beta`):** A
  human-operated e2e session using a real VS Code Extension Development
  Host, per `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md` — not performed
  this sprint (unchanged from prior sprints; still pending a human
  operator).
- **Current support label:** `beta` (unchanged).
- **Completable this sprint:** Already complete at the `beta` level;
  `verified` requires the pending human-operated session, out of this
  sprint's scope.
- **Blocks the controlled ChatGPT pilot:** **No.**

---

## Summary table

| Platform | Safe hook/API in this repo? | Lifecycle-only possible? | Support label | Blocks ChatGPT pilot? |
|---|---|---|---|---|
| Claude Code terminal | No (tool-specific) | Yes, via generic adapter | `experimental` (via `packages/terminal-adapter`) | No |
| Claude Code desktop | No | Cannot assess (no hook found) | `requires separate integration` | No |
| Codex CLI | No (tool-specific) | Yes, via generic adapter | `experimental` (via `packages/terminal-adapter`) | No |
| Codex IDE/editor | No | Cannot assess (surface unconfirmed) | `requires separate integration` | No |
| Generic terminal AI tools | N/A (OS-level guarantee, not tool-specific) | Yes | `experimental` | No |
| VS Code integrated terminal | Yes (`onDidChangeActiveTerminal` et al.) | Yes, already implemented | `beta` | No |

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
