# Native Hook Privacy Contract

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

> This is the single, shared, no-content contract every native hook
> integration built this sprint (`packages/native-hook-adapter`,
> `scripts/claude-code-hook.js`, `scripts/codex-hook.js`) must satisfy.
> It is enforced in code (an allowlist normalizer, not a denylist —
> see below) and mechanically checked by `check:native-hooks`.

---

## 1. Allowed normalized event fields (the only fields that may ever leave the normalizer)

| Field | Type | Meaning |
|---|---|---|
| `sourcePlatform` | `"claude_code" \| "codex_cli" \| "codex_ide" \| "unknown"` | Which tool's hook fired |
| `integrationType` | `"native_hook"` | Always this literal for this sprint's integrations (distinguishes from the generic process-lifecycle adapter) |
| `hookEventType` | string, from a fixed enum per platform (e.g. `PreToolUse`, `Stop`, `SessionStart`) | The hook event name, never the event's content payload |
| `hookReceivedAt` | ISO 8601 timestamp | When the hook script observed the event, not any timestamp from inside the payload |
| `adapterVersion` | string | This package's own version |
| `repoCommit` | string | The commit this integration was built from (informational only) |
| `killSwitchActive` | boolean | Whether the kill-switch suppressed the sanitized result |
| `dryRun` | boolean | Whether this invocation ran in dry-run mode |
| `sanitizedResult` | `"ok" \| "kill_switch_active" \| "error"` | The only "outcome" value ever recorded |
| `errorCodeSafeOnly` | string, from a fixed enum (e.g. `"parse_error"`, `"unknown_safe_error"`) | Never a raw error message (which could echo back input fragments) |

No other field name may appear in a normalized event. The normalizer's
output type in `packages/native-hook-adapter/src/types.ts` has exactly
these ten keys — TypeScript's structural excess-property checking on
object literals rejects any additional field at every call site that
constructs one directly.

## 2. Forbidden normalized fields (never allowed, under any name or nesting)

`prompt`, `response`, `command`, `output`, `stdout`, `stderr`,
`filePath` (when it would reveal a private path — see §5),
`fileContent`, `toolInput`, `toolOutput`, `chatHistory`,
`conversationId`, `accountEmail`, `token`, `cookie`, `secret`,
`clipboard`, `screenshot`, `trace` — plus, inherited from the
established repo-wide forbidden-field list (`packages/terminal-adapter`'s
`FORBIDDEN_FIELDS`, `apps/browser-extension`'s privacy guard): `promptText`,
`aiResponse`, `commandText`, `commandArgs`, `terminalBuffer`,
`environmentVariables`, `workingDirectory`, `sessionCookie`, `authToken`,
`sourceCode`, `screenshotData`, `videoData`, `ocrText`, `windowText`,
`paymentCredential`.

Raw hook input field names actually observed this sprint that map onto
this forbidden list and must never survive normalization: Claude
Code's `tool_input`, `tool_response`, and prompt-carrying
`UserPromptSubmit` payloads; Codex's inferred tool-input/output-shaped
`PreToolUse`/`PostToolUse` fields; and (out of scope for hooks, but
flagged because it is easy to confuse with them) Codex's separate
`notify` mechanism's `input-messages`/`last-assistant-message` fields.

## 3. In-memory-only parsing

Raw hook input (JSON from stdin) is parsed into a plain in-memory
object, immediately passed to the normalizer, and the raw object's
reference is dropped (goes out of scope / is not retained past the
normalization call). No intermediate representation of the raw payload
is created on disk at any point in the process — not a temp file, not a
cache, not a debug dump.

## 4. No raw payload is ever written to disk

The hook scripts (`claude-code-hook.js`, `codex-hook.js`) write only the
normalized event (the ten-field shape in §1) to any log file the
operator has opted into via `--log <path>`. The raw stdin JSON is never
copied to that file, never appended alongside the normalized event
"for debugging," and never written to a crash/error log either — even
on a parse error, only a safe error code (`errorCodeSafeOnly`) is
recorded, never the unparsable raw text.

## 5. No raw payload is ever logged (including to stdout/stderr for debugging)

`console.log`/`console.error`/`process.stdout.write`/`process.stderr.write`
in these scripts and this package may only ever be called with the
normalized event or a fixed, static, non-payload-derived string (e.g.
`"[native-hook-adapter] disabled"`). There is no verbose/debug mode in
this sprint's code that prints the raw hook input — adding one later
would require a fresh privacy review, not a flag flip.

`filePath` handling specifically: if a future event type's normalizer
needs to record that *a* file was touched (not *which* file, and never
its content), it must record a boolean or a repo-relative-vs-absolute
classification, never the literal path string, since an absolute path
can reveal a username, an internal project name, or directory structure
that is effectively account/identity-revealing. This sprint's
implementation does not add any file-path field to the allowed list at
all (§1) — this note exists to bind future extensions, not to describe
current behavior.

## 6. Tests must include hostile/private sample payloads and prove they are dropped

Every normalizer test suite in `packages/native-hook-adapter` must
include at least one "hostile" fixture per platform: a JSON payload
shaped like a real hook invocation but with `tool_input`, `tool_response`,
a realistic-looking prompt string, a fake API-key-shaped string, and an
absolute file path injected — and assert that:

1. The normalized output's `JSON.stringify(...)` never contains any of
   the injected content strings.
2. The normalized output's keys are exactly the §1 allowlist (no more,
   no fewer, for the given event type).
3. Nothing was written to disk during the test (checked by asserting no
   unexpected file appears in a scratch temp directory used as the
   test's only allowed write target).

## 7. Kill-switch and dry-run are cross-cutting, not per-platform

Both `killSwitchActive` and `dryRun` are computed once, in the shared
core, before any platform-specific normalization runs, using the same
two-layer kill-switch semantics already established in
`packages/terminal-adapter/src/kill-switch.ts` (global `killSwitchEnabled`,
per-adapter `disabledAdapters`, `kill_switch_<id>` flag) — reimplemented
here as a self-contained copy (same reasoning as `terminal-adapter`: zero
cross-package runtime dependency, auditable in isolation).

## 8. What "no-content telemetry" positively includes

To be concrete about what the contract *does* allow observing (not just
what it forbids): a hook fired; which event it was; when; whether the
kill-switch was active; whether this was a dry run; whether parsing
succeeded; a safe, enumerated error code if not. That is the entire
observable surface. It is enough to prove "the integration works and
respects the kill-switch" without being enough to reconstruct any
sentence a user typed or any file Claude Code or Codex touched.

---

**Privacy warning: Do not add real Claude Code/Codex prompt/response
text, real tool-call arguments or outputs, real file contents, real
account data, real API keys, or real payment credentials to this
document.**
