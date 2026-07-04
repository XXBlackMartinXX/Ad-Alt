# Real (Generic, Opt-In) Terminal Adapter — Design

**Phase:** Safe Real Integration Sprint for Claude Code Terminal, Claude
Code Desktop, and Codex CLI/IDE
**Date:** 2026-07-04

> This designs the `packages/terminal-adapter` package implemented this
> sprint. It is a **generic, tool-agnostic** lifecycle-only adapter — it
> does not name, detect, or specially recognize Claude Code, Codex, or
> any other specific CLI tool. See
> `TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md` for why a
> tool-specific integration is not attempted this sprint, and
> `CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md` /
> `CODEX_CLI_IDE_INTEGRATION_DECISION.md` for how this generic adapter
> applies (or doesn't) to those specific tools.

**A safe terminal adapter may wrap a synthetic/local lifecycle session.
It must not capture the real tool's command, prompt, or output.** Every
design decision below is justified against this sentence.

---

## 1. Package/app location

`packages/terminal-adapter` (workspace-discovered automatically per
`pnpm-workspace.yaml`'s `packages: ["apps/*", "packages/*"]`), named
`@ad-alt/terminal-adapter`. Chosen over `apps/terminal-adapter` because
this is a reusable library + thin CLI, matching the shape of
`packages/platform-core` and `packages/fraud`, not a deployable
application.

## 2. Command names

- `pnpm --filter @ad-alt/terminal-adapter demo` — synthetic-only wait-
  state simulation. Zero process spawning. This is what the mission's
  suggested `pnpm -w run terminal:adapter:demo` root script invokes.
- `pnpm --filter @ad-alt/terminal-adapter start -- wrap -- <command...>` —
  the real generic wrapper: spawns `<command...>` with `stdio: 'inherit'`,
  emits lifecycle-only events for its start/exit. Opt-in, explicit,
  per-invocation — never auto-started, never a background daemon.
- `pnpm --filter @ad-alt/terminal-adapter start -- check` — prints the
  resolved local config and current kill-switch state without spawning
  anything. Useful for a user to confirm what would happen before opting
  in.
- Root scripts added: `terminal:adapter:demo` (runs the demo above) and
  `check:terminal-adapter` (runs `scripts/check-terminal-adapter.js`).

## 3. Local config format

A local JSON file, default path `~/.promptprofit/terminal-adapter.config.json`,
overridable via the `PROMPTPROFIT_TERMINAL_ADAPTER_CONFIG` environment
variable (for tests and for users who want a project-local config
instead of a home-directory one). Never auto-created with `enabled:
true` — if the file does not exist, the adapter behaves as disabled
(fail closed, matching every other adapter in this repo).

```json
{
  "enabled": false,
  "killSwitchEnabled": false,
  "disabledAdapters": [],
  "flags": {}
}
```

- `enabled` — must be explicitly set `true` by the user for `wrap` mode
  to do anything beyond printing a "disabled" message and passing
  through the wrapped command with no timing at all. `demo` mode ignores
  `enabled` (it never touches a real process regardless).
- `killSwitchEnabled` / `disabledAdapters` / `flags` — mirrors
  `packages/platform-core`'s `FeatureFlags` shape exactly, so the same
  mental model applies: global kill switch, per-adapter disable list,
  and a `kill_switch_<id>` flag both checked before anything renders or
  emits.

## 4. Kill-switch model

Two-layer, identical semantics to `packages/platform-core/src/feature-
flags.ts`'s `isAdapterDisabled` and to the existing fixture prototype's
`isAdapterDisabled` in `scripts/lib/terminal-fixture.js`:
`killSwitchEnabled` (global) OR `disabledAdapters.includes(adapterId)`
OR `flags['kill_switch_' + adapterId] === true` ⇒ disabled. Implemented
as a self-contained function in `src/kill-switch.ts` — deliberately NOT
importing `@ad-alt/platform-core`, so this package has zero runtime
dependency on the rest of the monorepo and can be reasoned about (and
audited) in complete isolation. This mirrors the same isolation decision
already made for `scripts/lib/terminal-fixture.js`.

When disabled: `demo` mode emits a single `kill_switch_active` event and
exits 0. `wrap` mode still runs the wrapped command transparently (the
user's command must always work, killed-switched or not — this adapter
must never block or interfere with the user's actual tool), but records
no lifecycle event beyond `kill_switch_active`.

## 5. Lifecycle event model

Strictly the sprint's allowed vocabulary, nothing else:
`adapter_started`, `adapter_stopped`, `session_started`,
`wait_state_started`, `wait_state_ended`, `banner_rendered`,
`banner_closed`, `kill_switch_active`, `error_safe_code_only`.

Event shape (TypeScript):

```ts
interface LifecycleEvent {
  eventType:
    | "adapter_started" | "adapter_stopped" | "session_started"
    | "wait_state_started" | "wait_state_ended"
    | "banner_rendered" | "banner_closed"
    | "kill_switch_active" | "error_safe_code_only";
  adapterId: string;       // e.g. "manual" (reuses the existing DEV_ADAPTER_IDS entry)
  timestamp: string;       // ISO 8601, real Date.now() at emission time
  sessionId: string;       // randomUUID, no relation to any real AI session ID
  durationMs?: number;     // only on wait_state_ended / session end events
  exitCode?: number;       // only on adapter_stopped, from the wrapped process's own exit code
  errorCode?: string;      // only on error_safe_code_only — a fixed enum member, never a message string
}
```

No field may hold command text, prompt text, response text, output
text, file content, or terminal buffer content — enforced by (a) the
TypeScript type above simply having no such field, and (b) a runtime
`assertNoForbiddenFields()` check applied before every emission, reusing
the same `FORBIDDEN_FIELDS` list convention as
`scripts/lib/terminal-fixture.js`.

## 6. No-content telemetry rules

- `demo` mode: every timestamp/duration is either a fixed synthetic
  constant or derived from a real (but content-free) `setTimeout`-driven
  simulation — never derived from, or influenced by, any real AI tool.
- `wrap` mode: the only data ever read about the wrapped process is its
  PID (never logged), start time, exit time, and exit code — all
  metadata `child_process` exposes without touching stdio. `stdio:
  'inherit'` means the wrapped process's stdin/stdout/stderr connect
  directly to the real terminal; this adapter's own Node process never
  creates a pipe for them and therefore has no code path capable of
  reading their content even by mistake.
- No event is ever written to, or read from, any network destination.
  This package makes zero HTTP/HTTPS requests — confirmed by
  `check:terminal-adapter`'s static source scan (Phase 7).
- Local result logs (if the user opts into `--log <path>`) contain only
  the lifecycle event objects above, JSON-serialized, sanitized by the
  same `assertNoForbiddenFields()` check before every write.

## 7. Mock API strategy

None needed — this package never talks to any API, mock or real. It is
entirely local and offline. This is stricter than the browser/VS Code
adapters (which do sync flags from `/v1/flags` and post events to the
real backend); the terminal adapter deliberately does not, because there
is no confirmed pilot use case wiring real terminal telemetry into the
production ledger, and adding that would be scope creep beyond "safe
lifecycle framework."

## 8. Real API strategy

**Disabled by default, and not implemented at all this sprint.** Per
this sprint's instruction that any real API wiring must be "disabled by
default unless safe" — the safest and most honest position, given no
confirmed pilot use case exists for real terminal telemetry ingestion,
is to not build the wiring at all rather than build it and disable it.
If a future sprint wires this package's events into the real `/v1/events`
API, that must be a new, explicitly-reviewed change, not an assumed
extension of this design.

## 9. Manual operator workflow

1. User explicitly creates `~/.promptprofit/terminal-adapter.config.json`
   (or sets `PROMPTPROFIT_TERMINAL_ADAPTER_CONFIG` to a project-local
   path) with `"enabled": true`.
2. User runs `pnpm --filter @ad-alt/terminal-adapter start -- wrap --
   <their own command>` themselves, per invocation they choose to time.
3. Lifecycle events print to stdout (and optionally to a local log file
   the user names) for the user's own inspection.
4. User can flip `killSwitchEnabled: true` in the config at any time to
   stop event emission without uninstalling anything.

## 10. Test strategy

- Unit tests for `kill-switch.ts` (all three disable conditions, plus
  the enabled case).
- Unit tests for the lifecycle event builder (`lifecycle.ts`) asserting
  every emitted event matches the allowed `eventType` enum and contains
  no forbidden field key.
- Unit tests for `demo.ts` asserting the full synthetic event sequence
  (`adapter_started` → `session_started` → `wait_state_started` →
  `wait_state_ended` → `adapter_stopped`) and that it never imports or
  calls `child_process`.
- Unit tests for `wrap.ts` asserting it invokes `child_process.spawn`
  with `stdio: 'inherit'` (never `'pipe'`), never attaches a `data`
  listener to `stdout`/`stderr` (there are none to attach to under
  `inherit`), and that its emitted event never contains the argv it was
  given.
- A dedicated privacy test (`privacy.test.ts`) that serializes every
  event type this package can produce and asserts none contains any of
  the sprint's forbidden field names as a JSON key.

## 11. Privacy boundary

Everything in §5-§6 above. Summarized: this package may observe *that*
something started and stopped, and *how long* it took, and *what its
exit code was* — never *what it did*, *what was typed*, or *what was
printed*.

## 12. Failure modes

- Config file missing or unparsable ⇒ treated as disabled (fail closed),
  never as a crash, and never as "enabled by default."
- Wrapped command not found (`ENOENT`) ⇒ `wrap` mode surfaces the same
  error Node's own `spawn` would surface if the user ran the command
  directly (no swallowing, no modification of the wrapped tool's own
  error behavior), and emits `error_safe_code_only` with a fixed error
  code (e.g. `"spawn_enoent"`), never the raw error message (which could
  echo back parts of the attempted command line).
- Kill-switch active ⇒ `wrap` mode still runs the wrapped command
  (never blocks the user's actual tool) but suppresses all lifecycle
  events except `kill_switch_active`.

## 13. Support-label transition rules

- `experimental` (current, as of this sprint): real code exists, is
  unit-tested, and is privacy-clean, but has not been verified in a
  human-operated session against a real long-running CLI tool.
- `beta`: requires a human-operated session confirming `wrap` mode's
  transparent-passthrough fidelity (colors, interactive prompts, signal
  forwarding) against at least one real tool, logged the same way this
  repo's other assisted-verification runbooks require.
- `verified`: requires the same standard as every other `verified` label
  in this repo — a dated, human-operated live-session evidence log, not
  merely passing automated tests.
- This package must never be labeled `beta` or `verified` anywhere in
  this repo's docs until the corresponding evidence log exists —
  enforced by `check:terminal-adapter`'s overclaim scan (Phase 7).

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
