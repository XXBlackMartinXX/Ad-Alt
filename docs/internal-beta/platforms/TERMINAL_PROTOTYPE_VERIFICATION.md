# Terminal Fixture-Only Prototype — Verification Record

**Phase:** Complete Multi-Platform Support Before Pilot Execution
**Date:** 2026-07-03
**Support label: `fixture-only`** (as a prototype) / `experimental` (as a product concept)

> This is a **prototype that proves an architecture pattern**, not a real
> terminal integration. It does not wrap any real process, read any real
> command or output, or integrate with any real terminal session. Reading
> this document is not a substitute for reading
> `docs/internal-beta/platforms/DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md`,
> which explains WHY this narrow design is the safe one.

---

## 1. What was built

- `scripts/lib/terminal-fixture.js` — the reusable prototype logic.
- `scripts/terminal-fixture-runner.js` — a CLI entry point that runs the
  prototype and prints its output.
- `scripts/check-terminal-prototype.js` — a fresh-execution gate script
  (`pnpm -w run check:terminal-prototype`) that re-runs the prototype as a
  real child process every time and asserts it behaves correctly.
- `scripts/__tests__/terminal-fixture.test.js` — 14 unit tests (Node's
  built-in `node:test`, run via `pnpm -w run test:scripts`), covering
  privacy and both kill-switch layers.

## 2. Requirements met (per the mission's Phase 6 checklist)

1. **Explicit synthetic wait-state fixture** — `runSyntheticWaitStateFixture()`
   uses a hardcoded fixed timestamp (`2026-01-01T00:00:00.000Z`) and a
   hardcoded fixed duration (4200ms). Nothing is measured from a real
   clock, process, or command.
2. **No reading real terminal commands** — the module has no
   `require('child_process')` and never accepts a command string as
   input. Enforced by a static source scan in
   `check-terminal-prototype.js` §3, not just a claim.
3. **No reading real AI output** — same as above; `FORBIDDEN_FIELDS`
   explicitly includes `stdout`, `stderr`, `terminalBuffer`, and the
   scan proves none of these are ever used as an event key.
4. **No automatic shell integration** — the runner is invoked manually
   (`node scripts/terminal-fixture-runner.js`); nothing hooks into any
   real shell, `.bashrc`, `PATH`, or command execution.
5. **No hidden background monitoring** — the script runs once, to
   completion, and exits. There is no daemon, no file watcher, no
   persistent process.
6. **Synthetic monetization event only** — the one event produced uses
   only backend-shaped fields (`eventId`, `adapterName`, `deviceId`,
   `sessionId`, `sequenceNumber`, `clientTimestamp`, `adDecisionId`,
   `campaignId`, `creativeId`, `waitStateDurationMs`), all hardcoded
   fixture values, and is never sent over a network — it is only printed
   to stdout / returned to the caller for inspection.
7. **Privacy tests** — `scripts/__tests__/terminal-fixture.test.js`
   includes dedicated tests proving the synthetic event contains zero
   forbidden fields, and that a deliberately-injected forbidden field
   (`stdout`) is correctly detected by `findForbiddenFields()`.
8. **Kill-switch tests** — dedicated tests for the global kill switch,
   per-adapter `disabledAdapters` suppression, and the
   `kill_switch_<adapterId>` flag path, mirroring
   `packages/platform-core/src/feature-flags.ts`'s exact semantics
   (this module's `isAdapterDisabled()` is a byte-for-byte behavioral
   mirror, kept as a separate implementation rather than an import so
   this fixture-only script has zero dependency on the browser-extension
   or platform-core packages).
9. **Documentation** — this file, plus
   `DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` for the design
   rationale.

## 3. Adapter ID used

This prototype uses `"manual"` — an existing entry in
`packages/shared/src/schemas/adapters.ts`'s `DEV_ADAPTER_IDS`, already
documented there as "Manual trigger (developer tooling only)". No new
adapter ID was added to the canonical shared schema for this prototype,
specifically so it cannot be mistaken for a real, shipped terminal
product adapter. A real future terminal wrapper (see
`DESKTOP_TERMINAL_INTEGRATION_ARCHITECTURE.md` §1) would need its own
dedicated adapter ID added deliberately at that time.

## 4. Evidence

- `pnpm -w run check:terminal-prototype` — fresh execution, all checks
  pass: files exist, the runner exits 0 and confirms zero forbidden
  fields and correct kill-switch suppression in its own printed output,
  a static source scan confirms no `child_process`/`http`/`https`/`net`
  module is ever required, and no forbidden field name is ever used as an
  object key anywhere in `terminal-fixture.js`.
- `pnpm -w run test:scripts` — includes the new
  `terminal-fixture.test.js` (14 tests) alongside the existing script
  test suite.

## 5. What this does NOT prove

- That a real CLI wrapper wrapping a real `claude`/`codex`/other command
  can transparently pass through stdin/stdout/stderr without touching
  content (a real engineering task, not attempted this sprint).
- That the "lifecycle-only" signal (process start/exit) is sufficient
  UX-wise to time a sponsored moment usefully in a real terminal session.
- Any claim about Claude Code terminal or Codex specifically — this
  prototype is intentionally tool-agnostic and does not integrate with
  either.

## 6. Support label

**`fixture-only`** as a prototype (this is exactly and only what exists);
**`experimental`** as a product concept (the architecture is designed and
the pattern is proven in isolation, but no real integration exists). This
prototype does **not** claim readiness for real terminal support of any
kind.

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
