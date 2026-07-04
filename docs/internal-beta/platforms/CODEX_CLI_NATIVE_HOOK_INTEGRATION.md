# Codex CLI Native Hook Integration

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

---

## What was implemented

- `scripts/codex-hook.js` — a `command`-type hook script for Codex's
  `hooks.json` / inline `config.toml` `[hooks]` mechanism. Reads stdin,
  calls `handleCodexHook()` from the shared `packages/native-hook-adapter`
  package, prints only the sanitized event to stdout (and, optionally,
  a `--log` file), and **always exits 0**. Accepts `--ide` to tag events
  `codex_ide` instead of the default `codex_cli`, since both surfaces
  share the same underlying config/hooks engine (see
  `NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md` §6).
- `docs/internal-beta/platforms/examples/codex-hooks.example.json` — a
  standalone `hooks.json` example, schema-shaped per the primary-source
  `config.schema.json` (`HooksToml`: event name → array of
  `{matcher?, hooks: [{type: "command", command, commandWindows?,
  timeout?}]}`).
- `scripts/__tests__/codex-hook.test.js` — 5 fixture tests (including
  hostile `tool_input` and `notify`-shaped `input-messages`/
  `last-assistant-message` canaries), run as real child processes
  against the real script.

## Whether real integration was implemented

**Yes, with one honestly-documented evidence gap.** The event names,
config-file merge behavior (`hooks.json` + inline `[hooks]`), and
`HookHandlerConfig`/`MatcherGroup` schema are confirmed from a
**primary source** — OpenAI's own `codex-rs/core/config.schema.json` in
the `openai/codex` GitHub repository, fetched live this sprint (see
`NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md` §4). What is **not**
confirmed: the exact runtime JSON field names Codex sends to a hook
command's stdin (only the config schema was accessible; the runtime
payload docs page returned HTTP 403 to automated fetch, and `codex` is
not installed on this machine to cross-check directly).

## How the schema uncertainty is handled safely

Because the shared normalizer (`packages/native-hook-adapter`) is an
**allowlist**, this uncertainty does not create a privacy risk: whatever
field names Codex actually sends, only the fixed ten-field shape is ever
extracted, and everything else — including fields this integration's
authors did not anticipate — is discarded. The uncertainty affects
*how well* the integration correctly parses/recognizes Codex's event
names (worst case: every event is classified `unrecognized_event`,
which is a safe, honest failure mode, not a privacy failure), never
*whether content leaks*.

## Whether it bypasses Codex's own hook trust/review model

**No.** Per this sprint's audit (§4): "Installing or enabling a plugin
doesn't automatically trust its hooks; Codex skips plugin-bundled hooks
until you review and trust the current hook definition." Our example
config and installer do not attempt to auto-trust anything — the
operator must go through Codex's own trust/review flow themselves, the
same as any other hook they'd add.

## Whether it writes to `~/.codex/config.toml` by default

**No.** `scripts/install-codex-hooks.js` (Phase 8) defaults to dry-run
and requires an explicit `--write` flag pointed at a path the operator
chooses — never silently touching the user's real global config.

## Whether the `notify` mechanism is used

**No, deliberately.** Codex's separate `notify` config (distinct from
the `[hooks]` lifecycle system, fires only on `agent-turn-complete`)
sends a JSON payload confirmed to include `input-messages` and
`last-assistant-message` — real prompt and response text. This
integration does not wire `notify` at all, specifically to avoid that
content-bearing mechanism. The fixture test suite includes a canary
(`input-messages`/`last-assistant-message`) proving that even if such a
payload were mistakenly fed to our normalizer, it would still be
dropped — defense in depth, not reliance on avoidance alone.

## Test strategy

Fixture tests feed synthetic JSON shaped per the confirmed config schema
(plus the `notify`-shaped hostile canary above) to `scripts/codex-hook.js`
via stdin, exactly as done for Claude Code (`scripts/claude-code-hook.js`).

## Verification strategy

`CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md` (Phase 9) — requires a
human with `codex` actually installed to wire the example config into a
disposable test project, run `codex` normally, and confirm via the
sanitized hook log only that a hook fired and what event name was
recognized (this doubles as the missing local-CLI cross-validation this
sprint could not perform).

## Support label

**`experimental`** — deliberately one level below Claude Code's `beta`,
reflecting the two residual gaps: no local CLI to cross-validate, and
an unconfirmed (only inferred) runtime hook-payload schema. Real code
exists, fixture tests pass (5/5), and a dry-run installer exists — but
this sprint treats "config schema confirmed via primary source" as a
lower evidentiary bar than "config schema AND runtime payload both
confirmed, cross-validated against an installed binary" (which is what
Claude Code has). This is a conservative editorial choice documented
here for auditability, not a claim that the code itself is less
correct.

Escalating to `beta` requires either (a) a human confirming the runtime
schema and hook-firing behavior via the verification runbook, or (b)
`codex` becoming available in a future sprint's environment for direct
local-CLI cross-validation, matching the standard already met for
Claude Code.

---

**Privacy warning: Do not add real Codex prompt/response text, real
tool-call arguments or outputs, real file contents, real account data,
real API keys, or real payment credentials to this document.**
